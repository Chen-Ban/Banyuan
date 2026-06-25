# 缺失基础建设整体方案

> 本文档不修改代码，仅提供基于当前架构的基建补全规划与优先级建议。

## 1. 当前系统边界

### 已有的能力

| 模块 | 状态 | 说明 |
|------|------|------|
| 用户认证 | ✅ 完整 | 手机号+验证码登录/注册，JWT + Refresh Token |
| 多租户 N:N | ✅ 完整 | User ↔ Membership ↔ Tenant，角色 owner/admin/member |
| Plan 套餐 | ✅ 基础 | plan_free / plan_pro 种子数据，permissions 控制按 tenant 生效 |
| 应用 CRUD | ✅ 完整 | Application 元数据壳 + UIDefinition/Collection/CloudFunction 内容表 |
| AI Agent 编排 | ✅ 完整 | Orchestrator Graph + 5 SubAgent + SSE 事件协议 |
| Credit 计算框架 | ✅ 就绪 | CreditService.calculateCredits() + CREDIT_PRICE_TABLE |
| Web 部署 | ✅ 基础 | deploy-agent + ECS + DNS，1:1 Tenant:ECS |
| **Credit 实际记录** | ✅ **本轮已补齐** | AiService.onDone 调用 creditService.recordUsage() |
| **注册自动分配** | ✅ **本轮已补齐** | 注册即创建 Tenant+Free Plan |
| **应用可见性** | ✅ **本轮已补齐** | visibility(private/team) 控制跨用户可见 |

### 缺失的能力（按优先级排序）

---

## 2. P0 — 核心闭环（1-2 周）

### 2.1 精确 Token 回传

见 `docs/specs/agent-observability.md` P0 部分。

### 2.2 支付集成

**背景**：Pro Plan ¥99/月当前只定义了 `priceInCents: 9900`，没有支付能力。

**方案**：

```
用户点击「升级 Pro」
    │
    ▼
后端创建支付订单（支付宝当面付 / 微信支付 Native）
    │ 返回 paymentUrl（二维码）
    ▼
用户扫码支付
    │
    ▼
异步回调（notify_url）→ 验证签名 → Tenant.planId = 'plan_pro'
    │
    ▼
到期自动续费 / 手动取消
```

**改动范围**：

| 文件 | 改动 |
|------|------|
| `routes/planning.ts` 或新建 `routes/payment.ts` | `POST /api/payments/create-order` — 创建支付订单 |
| 新建 `services/PaymentService.ts` | 封装支付宝/微信 SDK，订单创建 + 验签 + 查询 |
| 新建 `models/PaymentOrder.ts` | 记录订单状态（pending/paid/expired/refunded） |
| `models/Tenant.ts` | 新增 `subscriptionExpiresAt` 字段 |
| `services/CreditService.ts` | 付费用户按 `monthlyCredits` 限额，免费用户 `0` 表示无限制（已有） |

**技术选型**：
- 轻量方案：`alipay-sdk` + 微信支付 Native（不依赖三方聚合支付）
- 进阶方案：接入 `LemonSqueezy` / `Paddle`（出海）或 `Bill.com`（国内）

### 2.3 Plan 升降级

**当前问题**：Tenant.planId 可以随意修改，没有校验和回滚保护。

**方案**：

```typescript
async function changePlan(tenantId: string, newPlanId: string): Promise<void> {
  // 1. 校验新套餐存在且 active
  const newPlan = await Plan.findOne({ planId: newPlanId, active: true })
  if (!newPlan) throw new Error('套餐不存在')

  // 2. 降级检查：新套餐月 credit 额度 < 当月已用 → 拒绝降级
  if (newPlan.monthlyCredits > 0) {  // 0 = 无限制
    const usage = await creditService.getMonthlyUsage(tenantId)
    if (usage.used > newPlan.monthlyCredits) {
      throw new Error('本月已超出新套餐额度，无法降级')
    }
  }

  // 3. 刷新 permission 缓存
  permissionCache.delete(tenantId)

  // 4. 更新 tenant
  await Tenant.updateOne({ tenantId }, { $set: { planId: newPlanId, plan: newPlanId === 'plan_pro' ? 'pro' : 'free' } })
}
```

**改动范围**：
- `services/CreditService.ts`：新增 `getMonthlyUsage()` → 已有
- `routes/tenants.ts`：`PUT /api/tenants/:tenantId/plan` 端点
- `middleware/requirePermission.ts`：`permissionCache` 在变更后清除

---

## 3. P1 — 运营基础能力（2-4 周）

### 3.1 结构化日志

见 `docs/specs/agent-observability.md` P1 部分。

### 3.2 月度账单

**方案**：

每月 1 日凌晨，cron job 执行：

```typescript
async function generateMonthlyBill(yearMonth: string): Promise<void> {
  // 1. 查出所有 active 的 pro 租户
  const proTenants = await Tenant.find({ plan: 'pro', planId: 'plan_pro' })

  for (const tenant of proTenants) {
    // 2. 查当月 credit 用量
    const usage = await CreditUsage.findOne({ tenantId: tenant.tenantId, yearMonth })
    const creditsUsed = usage?.creditsUsed ?? 0
    const overage = Math.max(0, creditsUsed - 50_000)  // Pro plan 额度

    // 3. 生成账单记录
    await Bill.create({
      tenantId: tenant.tenantId,
      yearMonth,
      basePrice: 9900,  // ¥99
      overageCredits: overage,
      overagePrice: overage * OVERAGE_UNIT_PRICE,  // 超量单价
      totalPrice: 9900 + (overage * OVERAGE_UNIT_PRICE),
      status: 'pending',
    })
  }
}
```

**改动范围**：
- 新建 `models/Bill.ts`：账单记录模型
- 新建 `services/BillingService.ts`：月度账单生成逻辑
- 新建 `cron/` 目录：cron job 入口
- 后端 `app.ts`：注册 cron 定时任务（`node-cron`）

### 3.3 用量告警

**方案**：

每次 `creditService.recordUsage()` 后检查剩余额度：

```typescript
async function recordUsage(tenantId, ...): Promise<void> {
  // ... 现有逻辑 ...

  // 新增：用量告警检查
  const { remaining, total } = await this.getMonthlyUsage(tenantId)
  if (total > 0) {  // 有限额套餐
    const ratio = remaining / total
    if (ratio <= 0.1) {
      await this.sendQuotaAlert(tenantId, 'critical', remaining, total)
    } else if (ratio <= 0.2) {
      await this.sendQuotaAlert(tenantId, 'warning', remaining, total)
    }
  }
}
```

**通知方式**（MVP 选 1-2 种即可）：
1. 站内信（存入 Notification 集合，前端轮询/SSE）
2. 邮件（需接入邮件服务）
3. 短信（已有 SmsService）

**改动范围**：
- 新建 `models/Notification.ts`：站内信模型
- `services/CreditService.ts`：`recordUsage()` 后追加告警检查
- 新建 `services/NotificationService.ts`：通知发送

---

## 4. P2 — 全链路可观测（4-8 周）

见 `docs/specs/agent-observability.md` P2-P4 部分。

| 项目 | 时间 | 依赖 |
|------|------|------|
| 引入 OpenTelemetry traceId | 3 天 | 结构化日志（P1）已完成 |
| Filebeat + Loki 采集管道 | 3 天 | 部署 ECS / K8s |
| Grafana 看板搭建 | 2 天 | Loki 就绪 |
| Sentry 异常上报 | 1 天 | 无 |

---

## 5. P3 — 运营体系完善（8 周+）

### 5.1 应用级配额

**背景**：当前配额是 tenant 级别（按租户总 credit），缺少按应用（app）的细分控制。

**方案**：
- `CreditUsage` 表增加 `applicationId` 维度（当前按 `tenantId + yearMonth` 聚合）
- 新增 `app:ai_limit` 字段到应用元数据或 Plan permissions
- AiService 在创建对话前检查该应用当月是否超限

**改动范围**：
- `models/CreditUsage.ts`：新增 `applicationId` 字段（可选，无值表示无限制）
- `services/CreditService.ts`：新增 `getAppMonthlyUsage(appId)` 查询
- `controllers/AiController.ts`：对话前检查

### 5.2 发票系统

**方案**：
- 集成电子发票服务商（如「发票通」、「百望云」）
- 用户申请开票 → 后端查询已支付订单 → 调用发票 API 开具
- 存储发票 PDF 到 OSS

### 5.3 ECS 实例监控

**背景**：当前 deploy-agent 通过 WebSocket 连接，但无资源使用率上报。

**方案**：
- deploy-agent 定时上报 CPU/内存/磁盘到后端
- 后端写入 `EcsInstance.metrics` 子文档
- 超过阈值时告警

### 5.4 AI 调用分类分析

**背景**：当前无法区分「好的」AI 调用（用户确认的 task）和「浪费的」AI 调用（被 discard/rollback 的）。

**方案**：
- `LLMCallRecord` 中增加 `dialoguePhase` 和 `isCommitted` 字段
- 报表区分：有效 token（committed dialogue）vs 失效 token（discarded dialogue）

---

## 6. 整体路线图

```
时间线         P0 (1-2周)         P1 (2-4周)          P2 (4-8周)          P3 (8周+)
              ─────────         ─────────           ─────────           ─────────

Phase 1   ■ 精确 token 回传    ■ 结构化日志(pino)  ■ OpenTelemetry      ■ 应用级配额
Phase 2   ■ 支付集成(支付宝)   ■ 月度账单生成       ■ Filebeat+Loki      ■ 发票系统
Phase 3   ■ Plan 升降级        ■ 用量告警(站内信)   ■ Grafana 看板       ■ ECS 监控
Phase 4   ■                    ■ CREDIT_PRICE_TABLE ■ Sentry 异常上报     ■ 分类分析
                                 ■ 超量计费          ■ 自动扩缩容
```

### 推荐启动顺序

1. **P0 Phase 1** — 精确 token 回传（AI 计费的根基）
2. **P0 Phase 2** — 支付集成（开始收费才能验证商业模型）
3. **P1 Phase 1** — 结构化日志（为观测体系打地基）
4. **P0 Phase 3** — Plan 升降级（配套支付）
5. **P1 Phase 2-3** — 月度账单 + 用量告警（运营工具）
6. **P2 全链路** — 可观测
7. **P3** — 运营体系完善
