# ADR-028：Web 部署发布与跨平台发布体系

**状态**：已采纳  
**决策日期**：2026-05-28  
**决策者**：陈班

---

## 背景

Banyuan 当前的构建产物只有桌面安装包（Electron 封装的 .dmg/.exe/.AppImage），缺少 Web 发布能力。用户设计完成后无法直接生成一个可访问的 Web 链接，也无法发布到 iOS/Android。

现有构建流程：前端 pages JSON → scaffold 生成 Vite 项目 → bundle 打包为纯静态 SPA → Electron 封装为桌面包。预览系统是内存临时方案（esm.sh CDN 加载，1 小时过期）。

核心诉求：

1. 按租户维度分配实体云服务器，租户的所有应用运行在其专属服务器上
2. 服务器控制台不暴露给用户，由平台统一运维（面向非研发人员）
3. 新建应用时在服务器上创建运行环境
4. 生成应用时触发打包，返回可访问的预览/正式链接
5. 架构需为后续 Electron、iOS、Android 跨平台发布预留扩展路径

---

## 决策

### 决策一：租户级实体服务器隔离（阿里云 ECS）

每个付费租户独占一台阿里云 ECS 实例，采用 Silo 隔离模式。

**选择阿里云 ECS 的理由**：

- 完善的 OpenAPI（RunInstances/DescribeInstances/SendCommand），支持自动化开通和管理
- 弹性公网 IP + 安全组 + VPC，网络隔离原生支持
- 轻量运维：Cloud Assistant 可远程执行命令，无需 SSH 直连
- 成本可控：2C4G 实例（ecs.t6-c1m2.large）足以承载中小租户数十个静态应用

**隔离边界**：

- 租户间：物理机级别隔离（独立 ECS）
- 应用间：Docker 容器级别隔离（同一 ECS 内）
- 网络：每台 ECS 绑定独立弹性 IP，Nginx 网关统一入口

### 决策二：构建集中化，运行分布化

构建在平台侧（Banyan 后端所在机器/构建集群）完成，产物分发到租户 ECS 部署。

**理由**：

- 构建是 CPU 密集操作（Vite + esbuild），不应消耗租户服务器资源
- 租户服务器不安装 node_modules，保持运行环境干净
- 产物标准化为 `dist/` 目录（index.html + assets + pages.json），与平台无关
- 同一份产物可部署到 Web（Nginx 托管）、Electron（本地加载）、Capacitor（移动壳）

### 决策三：每个应用 = 一个自包含的 Docker 容器

每个应用独立打包为一个 Docker 容器，内含前端静态文件 + 后端服务壳子（Koa + ORM + 云函数运行时）：

- 镜像：`node:20-alpine`，内含 Koa 服务壳子，同时托管静态文件和提供后端 API
- 构建产物一体打包：`dist/`（前端 SPA）+ `server/`（Koa 入口 + schema.json + functions.json）
- 容器内 Koa 服务根据 `schema.json`（数据表定义）自动生成 ORM，根据 `functions.json`（FlowSchema）执行云函数
- 资源限制：默认 `--memory=256m --cpus=0.5`，按套餐可调
- 纯静态应用（无数据表/无云函数）可降级为 `nginx:alpine` 容器，节省资源
- 版本回滚：停止当前版本容器 → 启动旧版本容器

详细的应用服务器壳子架构见 [ADR-011 决策 4（修订版）](./011-backend-capability-system.md)。

### 决策四：deploy-agent 作为租户服务器管控代理

在每台租户 ECS 上运行轻量 deploy-agent（Node.js 守护进程）：

- 通过 WebSocket 长连接与平台 Deploy Service 通信
- 负责：拉取产物、创建/更新/停止容器、更新 Nginx 配置、上报健康状态
- 无需在租户服务器上暴露任何端口给公网（agent 主动外连）
- 后续开放控制台时，agent 扩展为 Web Terminal 代理即可

### 决策五：泛域名 + 自定义域名双模式

- 默认域名：`{appSlug}.{tenantId}.banyuan.app`
- 自定义域名：用户配置 CNAME 指向平台，Nginx 动态匹配
- SSL：Let's Encrypt 通配符证书（泛域名）+ 按需申请（自定义域名）

### 决策六：跨平台产物复用

Vite 构建的 `dist/` 目录是所有平台的统一入口：

| 平台 | 封装层 | 额外依赖 |
|------|--------|---------|
| Web | Nginx 静态托管 | 无 |
| macOS/Windows/Linux | Electron 壳（现有） | electron-builder |
| iOS | Capacitor 壳 | @capacitor/ios + Xcode |
| Android | Capacitor 壳 | @capacitor/android + Android SDK |

移动端选择 Capacitor（而非 Cordova）的理由：Ionic 团队活跃维护、原生 Swift/Kotlin 插件体系、与现代 Web 工具链无缝集成、社区生态已超越 Cordova。

### 决策七：全自动化租户开通（API 驱动，零人工）

租户付费后，整个服务器开通流程由 Deploy Service 通过阿里云 OpenAPI 全自动完成，无需人工登录控制台。

**自动化开通链路**：

```
用户付费成功（支付回调）
  → Deploy Service.TenantProvisionService
    → RunInstances — 创建 ECS（预装 Docker 的自定义镜像）
    → AllocateEipAddress — 分配弹性公网 IP
    → DescribeInstances (轮询) — 等待实例 Running
    → AssociateEipAddress — 绑定 EIP 到实例
    → Cloud Assistant SendCommand — 远程执行初始化脚本
      (安装 deploy-agent、配置 Nginx、拉取泛域名证书)
    → DNS AddDomainRecord — 添加 *.{tenantId}.banyuan.app → EIP
    → CreateSecurityGroupRule — 开放 80/443
    → 写入 Tenant 注册表 (MongoDB)
  → 通知用户「环境已就绪」
```

**关键 API 清单**：

| 用途 | 阿里云 API | Node.js SDK 包 |
|------|-----------|---------------|
| 创建 ECS | `RunInstances` | `@alicloud/ecs20140526` |
| 查询实例状态 | `DescribeInstances` | `@alicloud/ecs20140526` |
| 分配弹性 IP | `AllocateEipAddress` | `@alicloud/vpc20160428` |
| 绑定 EIP | `AssociateEipAddress` | `@alicloud/vpc20160428` |
| 远程执行命令 | `SendCommand` | `@alicloud/ecs20140526` |
| DNS 记录管理 | `AddDomainRecord` | `@alicloud/alidns20150109` |
| 安全组规则 | `AuthorizeSecurityGroup` | `@alicloud/ecs20140526` |
| 释放实例 | `DeleteInstance` | `@alicloud/ecs20140526` |
| 释放 EIP | `ReleaseEipAddress` | `@alicloud/vpc20160428` |

**自定义镜像策略**：预先制作包含 Docker CE + Node.js 20 + deploy-agent 基础环境的 ECS 自定义镜像，创建实例时直接使用，减少初始化脚本执行时间（从 ~5 分钟缩短至 ~1 分钟）。

**租户退订/欠费流程**：

```
用户退订或欠费超期
  → Deploy Service
    → 通知 deploy-agent 停止所有容器
    → DeleteInstance — 释放 ECS
    → ReleaseEipAddress — 释放 EIP
    → DNS DeleteDomainRecord — 删除域名解析
    → 更新 Tenant 状态为 terminated
```

**认证方式**：RAM 子账号（仅授予 ECS/VPC/DNS 操作权限），生产环境通过 STS AssumeRole 获取临时凭证，最大降低密钥泄露风险。

### 决策八：资金流与计费模型

**资金流向**：

```
用户 ──付费──▶ 班园平台 ──预充值──▶ 阿里云账户余额
                │                        │
                │ (收入)                  │ (成本，自动扣费)
                ▼                        ▼
         平台收入账户              阿里云按量/月结自动结算
```

**核心机制**：阿里云采用「先使用后付费」模式，通过 API 创建的 ECS 资源自动从阿里云账户余额扣费，无需调用任何"支付 API"。创建即开始计费，释放即停止计费。

**计费模式选择**：

| 计费方式 | API 参数 | 适用场景 | 成本 |
|---------|---------|---------|------|
| 按量付费（PostPaid） | `instanceChargeType: 'PostPaid'` | 试用期/不确定续费的租户 | ~¥0.12/h (2C4G) |
| 包年包月（PrePaid） | `instanceChargeType: 'PrePaid'` | 稳定付费租户 | 按量的 3~5 折 |

**策略**：租户初始开通使用按量付费（灵活释放），稳定续费 3 个月以上自动通过 `ModifyInstanceChargeType` API 转为包年包月（降低成本）。

**平台侧收费模型**（参考定价）：

| 套餐 | 用户月付 | 阿里云成本 | 毛利 |
|------|---------|-----------|------|
| 基础版（5 应用） | ¥299/月 | ~¥200/月 | ~33% |
| 专业版（20 应用） | ¥599/月 | ~¥300/月 | ~50% |
| 企业版（不限应用） | ¥1299/月 | ~¥500/月 | ~61% |

**资金安全保障**：

- 阿里云账户设置余额告警阈值（余额 < ¥5000 时触发告警）
- 绑定企业支付宝/银行卡自动充值（余额 < ¥2000 时自动充值 ¥10000）
- 费用监控 API：`QueryAccountBalance`（查余额）、`QueryBill`（查明细）
- Deploy Service 中实现成本看板：按租户维度统计阿里云实际资源消耗

**支付接入（用户→平台）**：

- 微信支付 / 支付宝当面付（个人用户）
- 企业对公转账 / 发票（企业用户）
- 支付回调触发 `TenantProvisionService` 自动开通

---

### 决策九：租户休眠与冷藏策略

当租户暂停使用（到期未续费、主动暂停等），平台无需持续为其保留满载 ECS 资源。引入三级降级策略：

**第一级：节省停机（Grace Period，1-30 天）**

- 使用阿里云 `StopInstances` 的"节省停机模式"（`StoppedMode=StopCharging`）
- ECS 释放 vCPU / 内存计费，**保留云盘和 EIP**
- 成本从 ~¥170/月降至 ~¥12/月（仅云盘 + EIP 计费）
- 恢复：`StartInstance` → ~30 秒回到运行态，deploy-agent 自动恢复服务
- 适用场景：短期暂停、试用期结束观察期

**第二级：冷藏归档（Cold Storage，30-180 天）**

- 执行 `mongodump` 导出该租户所有应用数据 → 压缩 → 上传到 OSS 归档存储（¥0.033/GB/月）
- 将 OSS 中该租户的构建产物转为归档/冷归档存储类型
- 释放 ECS 实例（`DeleteInstance`）和 EIP，彻底归零计算成本
- 月成本：~¥2/月（仅 OSS 归档存储 + MongoDB 中一行 Tenant 元数据）
- 恢复：重新走 TenantProvisionService 创建 ECS → `mongorestore` 恢复数据 → 从 OSS 拉取产物重新部署，全程 ~5 分钟
- 适用场景：长期未活跃、已到期未续费的租户

**第三级：数据清除（180+ 天或主动注销）**

- 删除 OSS 归档数据 + MongoDB Tenant 记录
- 不可逆操作，执行前需邮件通知用户并保留 7 天申诉期

**与 Pool 模式的兼容性**：当前的冷藏策略（产物在 OSS + 可恢复的 DB dump）天然可过渡到 Pool 模式——Pool 模式下恢复时不再分配独立 ECS，而是将产物部署到共享资源池中，数据从 dump 恢复到共享 MongoDB 集群。

**自动化触发规则**：

| 触发条件 | 动作 | 通知 |
|----------|------|------|
| 订阅到期 + 3 天未续费 | 第一级：节省停机 | 邮件 + 站内信 |
| 节省停机状态持续 30 天 | 第二级：冷藏归档 | 邮件通知「数据已归档」 |
| 冷藏状态持续 180 天 | 第三级前置：发送清除预警 | 邮件通知「7 天后清除」 |
| 冷藏 180 天 + 7 天申诉期结束 | 第三级：数据清除 | 邮件确认已清除 |
| 用户任何时候续费/充值 | 恢复到运行态 | 邮件通知「已恢复」 |

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Banyuan 平台层                         │
│                                                         │
│  Banyan 设计器(:5174) ──▶ Banyan 后端(:3001)            │
│                                │                        │
│                                ▼                        │
│                    ┌─────────────────────┐              │
│                    │  Deploy Service     │              │
│                    │  (:3004)            │              │
│                    │                     │              │
│                    │  - BullMQ 构建队列  │              │
│                    │  - 阿里云 ECS API   │              │
│                    │  - 产物分发调度     │              │
│                    └────────┬────────────┘              │
│                             │                           │
│              ┌──────────────┼──────────────┐            │
│              ▼              ▼              ▼            │
│         OSS 产物仓库   阿里云 DNS    SSL 证书管理       │
└─────────────────────────────────────────────────────────┘
                              │
                    WebSocket 长连接
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 租户A ECS    │    │ 租户B ECS    │    │ 租户C ECS    │
│              │    │              │    │              │
│ deploy-agent │    │ deploy-agent │    │ deploy-agent │
│ Nginx 网关   │    │ Nginx 网关   │    │ Nginx 网关   │
│              │    │              │    │              │
│ ┌──┐┌──┐┌──┐│    │ ┌──┐┌──┐    │    │ ┌──┐         │
│ │A1││A2││A3││    │ │B1││B2│    │    │ │C1│         │
│ └──┘└──┘└──┘│    │ └──┘└──┘    │    │ └──┘         │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 核心流程

### 租户开通（全自动，详见决策七）

```
用户付费成功（微信/支付宝回调）
  → Deploy Service.TenantProvisionService
    → RunInstances (自定义镜像，按量付费)
    → AllocateEipAddress + AssociateEipAddress
    → DescribeInstances (轮询等待 Running)
    → SendCommand (Cloud Assistant 初始化):
        - 启动 deploy-agent systemd 服务
        - 配置 Nginx + 泛域名 SSL 证书
        - 配置安全组 (80/443)
    → DNS AddDomainRecord *.{tenantId}.banyuan.app → EIP
    → 写入 Tenant 注册表 (MongoDB)
  → 通知用户「环境已就绪，可开始创建应用」
  → 全程 ~2 分钟（使用自定义镜像），零人工介入
```

### 应用发布

```
用户点击"发布" → Banyan 后端
  → 提交构建任务到 Deploy Service 队列
  → 构建 Worker 执行:
      1. scaffold() — 生成 Vite 项目
      2. bundle() — Vite 构建
      3. 压缩 dist/ → {appId}-{version}.tar.gz
      4. 上传到 OSS
  → 通知 deploy-agent:
      - 从 OSS 拉取产物
      - 解压到 /srv/banyuan/apps/{appId}/versions/{version}/
      - 更新 current 软链接
      - 若容器不存在则创建，否则 reload Nginx
  → 返回正式链接: https://{appSlug}.{tenantId}.banyuan.app
```

### 版本回滚

```
用户选择历史版本 → Deploy Service → deploy-agent
  → 切换 current 软链接到目标版本目录
  → nginx -s reload
  → 完成 (秒级)
```

---

## 影响范围

| 模块 | 变更 |
|------|------|
| `apps/banyan/backend/src/services/build/` | 构建完成后增加 OSS 上传 + deploy-agent 通知 |
| `apps/banyan/backend/src/services/preview/` | 可选升级为部署到 staging 容器 |
| `apps/banyan/backend/src/routes/` | 新增发布/回滚/版本管理/支付回调路由 |
| `apps/banyan/backend/src/models/` | 新增 Tenant/Deployment/PublishRecord/Order/Subscription 模型 |
| `apps/banyan/frontend/` | 设计器增加"发布到 Web"按钮、发布管理面板、订阅管理页 |
| 新增 `apps/deploy-service/` | 部署控制面服务（含 TenantProvisionService + 阿里云 SDK 集成） |
| 新增 `packages/deploy-agent/` | 租户服务器代理 |
| 新增 `apps/deploy-service/src/services/billing/` | 计费模块：支付回调、订阅管理、阿里云成本监控 |

---

## 被否决的方案

### 方案A：共享服务器 + K8s namespace 隔离

否决理由：K8s 运维复杂度远超当前团队规模所需，且面向非研发用户的场景不需要如此精细的编排能力。ECS + Docker 足够覆盖单租户数十应用的规模。

### 方案B：Serverless（FC/云函数）托管

否决理由：纯静态 SPA 用 Serverless 是大材小用（CDN 更适合），且后续需要支持云函数长连接、WebSocket 等能力时 Serverless 会有冷启动和连接限制问题。独立 ECS 更灵活。

### 方案C：所有租户共享 CDN + OSS 静态托管

否决理由：无法支持带云函数的应用（需要 Node.js 运行时），且共享域名在 Cookie/Storage 等方面存在安全隔离问题。

---

## 后续演进

- 当租户规模增长到单机容纳不下时，可升级为多 ECS + 负载均衡
- 后续有需求时可对接阿里云容器服务（ACK），deploy-agent 平滑迁移为 K8s Operator
- 开放控制台：deploy-agent 扩展 Web Terminal + 简易日志查看器
- iOS/Android 构建：平台侧增加 Capacitor 构建流水线（需 macOS 构建机用于 iOS）
