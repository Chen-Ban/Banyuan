# ADR-036：商业化可收费 — 支付系统、权限控制与用量配额

**状态**：提案  
**决策日期**：2026-06-01  
**决策者**：陈班

---

## 背景

Banyuan 平台已完成核心产品链路（AI 生成 → 画布编辑 → 全栈部署），但缺少变现基础设施。当前 `Tenant.plan` 字段有 `free | pro` 枚举却无实际约束逻辑，`User.role` 有 `owner | admin | member` 却仅做「是否登录」校验。这意味着：

- 所有用户享受完全相同的服务，无法区分免费/付费
- 任何成员可执行任意操作（发布、删除、管理团队），无安全边界
- 无法统计 AI 调用成本，无法向 LLM 供应商的成本建立对冲

本决策确立 Banyuan 从「可用」到「可收费」所需的三个子系统的架构设计。

---

## 决策

### 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        Banyan 后端                            │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │ AuthMW   │──▶│  RBAC MW     │──▶│  Quota MW         │   │
│  │(JWT验证)  │   │(角色+资源权限)│   │(配额检查+计量写入) │   │
│  └──────────┘   └──────────────┘   └─────────┬─────────┘   │
│                                               │             │
│                                    ┌──────────▼──────────┐  │
│                                    │  UsageService       │  │
│                                    │  (Redis 计量聚合)    │  │
│                                    └──────────┬──────────┘  │
│                                               │             │
│  ┌──────────────┐                  ┌──────────▼──────────┐  │
│  │ BillingService│◀─── 月结账单 ───│  QuotaService       │  │
│  │ (计费+发票)   │                  │  (套餐限额定义)      │  │
│  └──────┬───────┘                  └─────────────────────┘  │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │ 支付网关      │
   │ Stripe/支付宝 │
   └──────────────┘
```

---

### Decision 1：套餐体系与计量模型

#### 套餐定义

| 维度 | Free | Pro | Enterprise |
|------|------|-----|------------|
| 应用数量 | 3 | 无限 | 无限 |
| 页面数/应用 | 10 | 50 | 无限 |
| AI 对话轮次/月 | 100 | 5,000 | 无限 |
| 云函数数量 | 5 | 50 | 无限 |
| 部署次数/月 | 10 | 无限 | 无限 |
| 自定义域名 | ✗ | ✓ | ✓ |
| 团队成员 | 1 | 10 | 无限 |
| 存储空间 | 500MB | 10GB | 自定义 |
| 技术支持 | 社区 | 工单(48h) | 专属对接 |

#### 计量存储

使用 Redis Sorted Set 做实时计量，MongoDB 做持久化月度汇总：

```typescript
// Redis key 设计
`usage:${tenantId}:${yyyy-mm}:ai_rounds`     // AI 对话轮次
`usage:${tenantId}:${yyyy-mm}:deploys`        // 部署次数
`usage:${tenantId}:${yyyy-mm}:storage_bytes`  // 存储用量
```

每次 AI 调用完成后，`XiangDi 服务 → done 事件 → banyan 后端 → UsageService.increment()` 写入 Redis。月底定时任务将 Redis 计量快照写入 `MonthlyUsage` MongoDB 文档作为计费依据。

#### 配额检查时机

配额通过 Koa 中间件在请求进入业务逻辑前拦截：

```typescript
// QuotaMiddleware 伪代码
async function quotaMiddleware(ctx, next) {
  const { tenantId } = ctx.state.user
  const quota = await quotaService.getQuota(tenantId)
  const usage = await usageService.getCurrent(tenantId)

  // 按路由匹配检查
  if (ctx.path.startsWith('/api/ai/') && usage.aiRounds >= quota.aiRounds) {
    ctx.throw(429, 'AI 对话配额已用尽，请升级套餐')
  }
  // ... 其他维度
  await next()
}
```

---

### Decision 2：权限控制（RBAC）

#### 角色能力矩阵

| 操作 | Owner | Admin | Member |
|------|-------|-------|--------|
| 管理套餐/支付 | ✓ | ✗ | ✗ |
| 邀请/移除成员 | ✓ | ✓ | ✗ |
| 修改成员角色 | ✓ | ✓(不可改 Owner) | ✗ |
| 创建应用 | ✓ | ✓ | ✓ |
| 编辑/删除应用 | ✓ | ✓ | 仅自己创建的 |
| 发布应用 | ✓ | ✓ | ✗ |
| 管理数据集合 | ✓ | ✓ | 仅读 |
| 管理云函数 | ✓ | ✓ | 仅读 |
| 查看部署历史 | ✓ | ✓ | ✓ |

#### 实现方式 — 声明式中间件

不采用复杂的 ACL 表，而是以路由级声明式配置 + 资源所有权校验组合实现：

```typescript
// routes/applications.ts
router.delete('/applications/:id',
  requireRole('owner', 'admin'),  // 角色门槛
  requireOwnership('application'), // 或 admin+ 直接放行
  applicationController.delete
)

// routes/deploy.ts
router.post('/deploy/publish',
  requireRole('owner', 'admin'),  // member 不可发布
  quotaCheck('deploys'),          // 配额检查
  deployController.publish
)
```

`requireRole(…roles)` 是通用中间件，检查 `ctx.state.user.role` 是否在允许列表中。`requireOwnership(resource)` 针对 member 角色做额外的创建者校验。

#### 数据模型扩展

```typescript
// 现有 User model 无需修改（role 字段已存在）
// 新增 TeamInvitation model
interface ITeamInvitation {
  invitationId: string
  tenantId: string
  inviterUserId: string
  inviteePhone: string    // 或 email
  role: 'admin' | 'member'
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: Date
}
```

---

### Decision 3：支付系统集成

#### 支付网关选型

| 市场 | 方案 | 理由 |
|------|------|------|
| 国内 | 支付宝当面付 + 微信 Native 支付 | 覆盖 99% 国内用户 |
| 国际 | Stripe Checkout | 开发体验最佳，支持订阅自动续费 |

两套网关通过统一的 `PaymentGateway` 接口隔离，BillingService 不感知底层支付渠道。

#### 核心流程

```
用户点击"升级 Pro"
  → 前端调 POST /api/billing/checkout
    → BillingService 创建 Order（pending）
      → 调支付网关生成支付链接/二维码
        → 返回前端展示
          → 用户支付
            → 网关回调 POST /api/billing/webhook
              → BillingService 确认 Order
                → TenantService.upgradePlan(tenantId, 'pro')
                  → QuotaService 刷新配额缓存
```

#### 订阅生命周期

```
trial(7d) ──支付──▶ active ──到期未续──▶ grace(7d) ──仍未续──▶ suspended
                      │                                           │
                      │◀───────── 续费成功 ─────────────────────────┘
                      │
                      ▼ (主动降级)
                    downgrade_pending ──次月生效──▶ free
```

- **Grace Period（宽限期）**：到期后 7 天内服务不降级，仅发提醒邮件
- **Suspended**：冻结发布、AI 调用、云函数执行，但应用数据不删除
- **降级**：不立即生效，等当前计费周期结束再执行

#### 数据模型

```typescript
interface ISubscription {
  subscriptionId: string
  tenantId: string
  plan: 'free' | 'pro' | 'enterprise'
  status: 'trialing' | 'active' | 'grace' | 'suspended' | 'cancelled'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  paymentGateway: 'stripe' | 'alipay' | 'wechat'
  externalSubscriptionId?: string  // Stripe subscription ID
}

interface IOrder {
  orderId: string
  tenantId: string
  type: 'subscription' | 'addon'  // addon = 加购包
  amount: number       // 分
  currency: 'CNY' | 'USD'
  status: 'pending' | 'paid' | 'refunded' | 'failed'
  paidAt?: Date
  externalOrderId?: string
}
```

---

### Decision 4：前端权限感知

前端登录后通过 `GET /api/auth/me` 获取用户信息（含 role + plan），存入全局 Context：

```typescript
interface UserContext {
  userId: string
  tenantId: string
  role: 'owner' | 'admin' | 'member'
  plan: 'free' | 'pro' | 'enterprise'
  quota: {
    aiRoundsUsed: number
    aiRoundsLimit: number
    // ...
  }
}
```

组件级权限控制通过 `<Authorized>` 包装组件或 `usePermission()` hook 实现：

```tsx
<Authorized roles={['owner', 'admin']}>
  <PublishButton />
</Authorized>
```

配额耗尽时展示升级引导，而非冰冷的 403 页面。

---

## 影响范围

### 新增文件

| 文件 | 用途 |
|------|------|
| `backend/src/middleware/rbac.ts` | requireRole / requireOwnership 中间件 |
| `backend/src/middleware/quota.ts` | 配额检查中间件 |
| `backend/src/services/UsageService.ts` | Redis 实时计量 |
| `backend/src/services/QuotaService.ts` | 套餐配额定义与查询 |
| `backend/src/services/BillingService.ts` | 订阅/订单/发票逻辑 |
| `backend/src/services/PaymentGateway.ts` | 支付网关统一接口 |
| `backend/src/models/Subscription.ts` | 订阅模型 |
| `backend/src/models/Order.ts` | 订单模型 |
| `backend/src/models/MonthlyUsage.ts` | 月度用量快照 |
| `backend/src/models/TeamInvitation.ts` | 团队邀请 |
| `backend/src/routes/billing.ts` | 计费路由（checkout/webhook/invoices） |
| `backend/src/routes/team.ts` | 团队管理路由（invite/remove/role） |
| `frontend/src/api/billing.ts` | 计费 API 客户端 |
| `frontend/src/api/team.ts` | 团队 API 客户端 |
| `frontend/src/components/Authorized.tsx` | 权限包装组件 |
| `frontend/src/pages/BillingPage/` | 套餐/支付/发票页面 |
| `frontend/src/pages/TeamPage/` | 团队成员管理页面 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/routes/index.ts` | 注册 billing/team 路由组 + 挂载 rbac/quota 中间件 |
| `backend/src/models/Tenant.ts` | plan 字段保留，新增 subscriptionId 关联 |
| `backend/src/services/AuthService.ts` | `/me` 接口返回 role + plan + quota |
| `backend/src/controllers/DeployController.ts` | publish 前增加 quota 消费 |
| `backend/src/services/AiService.ts` | AI 调用完成后 increment usage |
| `frontend/src/routes/index.tsx` | 新增 Billing/Team 页面路由 |
| `frontend/src/layouts/` | 导航栏增加套餐标识、用量进度条 |

### 新增基础设施依赖

| 组件 | 用途 |
|------|------|
| Redis | 实时计量、配额缓存、Rate Limiting 令牌桶 |
| Stripe SDK / 支付宝 SDK | 支付网关 |
| 定时任务（node-cron） | 月度用量快照、订阅到期检查 |

---

## 备选方案与否决理由

### 备选 1：使用第三方 SaaS 计费平台（如 Lago、Orb）

否决理由：引入外部依赖增加运维复杂度，Banyuan 的计量维度简单（6-8 个指标），自建成本可控且更灵活。

### 备选 2：前端硬编码权限而非中间件拦截

否决理由：前端权限仅做 UI 优化（隐藏按钮），安全边界必须在后端实施。绕过前端直接调 API 的攻击必须被中间件拦截。

### 备选 3：先不做配额，仅做开关式 feature flag

否决理由：无法防止恶意用户通过 free 套餐大量消耗 LLM API 成本。AI 调用的边际成本不可忽略，必须从第一天就有计量。

---

## 实施计划

**阶段 1（1 周）**：RBAC 中间件 + 角色路由守卫，让权限生效  
**阶段 2（1 周）**：UsageService + QuotaService + Redis 计量，让配额可见  
**阶段 3（1 周）**：Stripe/支付宝集成 + 订阅生命周期，让升级可购买  
**阶段 4（3 天）**：前端 Billing/Team 页面 + 用量仪表盘
