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

### 决策二：去中心化构建（租户端构建 + 就地部署）

构建在租户自己的 ECS 上由 deploy-agent 完成（scaffold → pnpm install → vite build → 部署到 Nginx）。平台后端通过 WebSocket 将 appJSON 发送给 agent，agent 一站式完成构建和部署。这是架构选型，不是 MVP 简化。

**选择去中心化构建的理由**：

- **无排队**：每个租户在自己的 ECS 上构建，100 个租户同时发布互不影响；中心化构建必然面临队列积压
- **数据本地性**：appJSON → scaffold → build → dist → nginx，全链路在同一台机器完成，零网络传输、零 OSS 中转
- **天然水平扩展**：租户数增长 = ECS 数增长 = 构建能力线性增长，无需扩容中心构建集群
- **故障隔离**：一台 ECS 构建失败不影响其他租户
- **架构简洁**：不需要 OSS 产物仓库、不需要独立构建服务、不需要 BullMQ 队列、不需要产物分发调度
- **运行时复用**：deploy-agent 本身运行在 Node.js 之上，构建环境零额外安装成本
- **语义正确**：谁的应用在谁的机器上构建，产物天然属于该租户，无跨租户数据流动

**产物标准化**：

- 构建产物为 `dist/` 目录（index.html + assets），与平台无关
- 同一份 appJSON 可在不同环境构建：Web（租户 ECS）、Electron（用户本地）、Capacitor（移动端构建机）

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

在每台租户 ECS 上运行轻量 deploy-agent（Node.js 守护进程，`packages/deploy-agent/`）。注意：此 agent 是纯粹的部署代理程序，与 XiangDi AI Agent 无关。

- 通过 WebSocket 长连接主动连接 Banyan 后端（`/ws/agent`），由后端 AgentGateway 管理连接
- 核心职责：接收 appJSON → scaffold 生成项目 → 安装依赖 → 构建 → 部署到 Nginx → 上报进度和结果
- 无需在租户服务器上暴露任何端口给公网（agent 主动外连）
- 认证方式：agent 启动时通过 `agentToken`（租户注册时自动生成）进行身份认证
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
┌──────────────────────────────────────────────────────────────┐
│                       Banyuan 平台层                           │
│                                                              │
│  Banyan 设计器(:5174) ──▶ Banyan 后端(:3001)                 │
│                                │                             │
│                    ┌───────────┴───────────┐                 │
│                    │                       │                 │
│                    ▼                       ▼                 │
│         ┌──────────────────┐    ┌──────────────────┐         │
│         │  AgentGateway    │    │ TenantProvision  │         │
│         │  (WebSocket网关) │    │ Service          │         │
│         │  /ws/agent       │    │ (ECS/DNS 自动化) │         │
│         └────────┬─────────┘    └──────────────────┘         │
│                  │                                           │
└──────────────────┼───────────────────────────────────────────┘
                   │
         WebSocket 长连接（agent 主动外连）
                   │
     ┌─────────────┼─────────────────────┐
     ▼             ▼                     ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 租户A ECS    │  │ 租户B ECS    │  │ 租户C ECS    │
│              │  │              │  │              │
│ deploy-agent │  │ deploy-agent │  │ deploy-agent │
│ (构建+部署)  │  │ (构建+部署)  │  │ (构建+部署)  │
│ Nginx 网关   │  │ Nginx 网关   │  │ Nginx 网关   │
│ MongoDB      │  │ MongoDB      │  │ MongoDB      │
│              │  │              │  │              │
│ ┌──┐┌──┐┌──┐│  │ ┌──┐┌──┐    │  │ ┌──┐         │
│ │A1││A2││A3││  │ │B1││B2│    │  │ │C1│         │
│ └──┘└──┘└──┘│  │ └──┘└──┘    │  │ └──┘         │
└──────────────┘  └──────────────┘  └──────────────┘

去中心化构建：后端通过 WebSocket 发送 appJSON → agent 端完成 scaffold/build/deploy
每个租户独立构建，无排队、无中转、天然水平扩展
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
  → 校验租户环境就绪 + agent 在线
  → 创建 Deployment 记录（status: pending）
  → 通过 WebSocket 向 deploy-agent 发送 deploy:start 消息（payload: appJSON + appSlug + tenantDomain）
  → deploy-agent 执行:
      1. scaffold() — 根据 appJSON 生成 Vite 项目
      2. pnpm install — 安装依赖
      3. pnpm build — Vite 构建
      4. 复制 dist/ 到 /opt/banyuan/www/{appSlug}/
      5. 生成 Nginx server block 配置
      6. nginx -s reload — 热加载
  → agent 上报 deploy:progress（实时进度）和 deploy:result（最终结果）
  → 后端更新 Deployment 状态 + Application.webUrl
  → 返回正式链接: https://{appSlug}.{tenantId}.banyuan.club
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

---

## 附录：环境变量清单

本系统涉及两个运行环境的环境变量配置：

### Banyan 后端（apps/banyan/backend/.env）

| 变量名 | 必填 | 默认值 | 用途 | 获取方式 |
|--------|------|--------|------|---------|
| `ECS_ACCESS_KEY_ID` | 是 | - | 阿里云 RAM 子账号 AccessKey（ECS/VPC 操作） | 阿里云控制台 → RAM 访问控制 → 用户 → AccessKey 管理 |
| `ECS_ACCESS_KEY_SECRET` | 是 | - | 阿里云 RAM 子账号 SecretKey | 同上，创建时仅显示一次 |
| `ECS_REGION` | 否 | `cn-beijing` | ECS 实例所在地域 | 按业务选择（cn-hangzhou/cn-shanghai 等） |
| `ECS_INSTANCE_TYPE` | 否 | `ecs.t6-c1m2.large` | ECS 实例规格（2C4G） | 阿里云 ECS 规格族文档 |
| `ECS_IMAGE_ID` | 是 | - | 预制自定义镜像 ID（含 Docker/Node.js/Nginx） | 阿里云控制台 → ECS → 镜像 → 自定义镜像（初期可用公共镜像 `ubuntu_22_04_x64_20G_alibase_*.vhd`） |
| `ECS_SECURITY_GROUP_ID` | 是 | - | 安全组 ID（需开放 80/443/WebSocket 端口） | 阿里云控制台 → ECS → 安全组，创建后获取 ID（格式 `sg-xxx`） |
| `ECS_VSWITCH_ID` | 是 | - | VPC 交换机 ID（实例网络） | 阿里云控制台 → VPC → 交换机（格式 `vsw-xxx`） |
| `DNS_ACCESS_KEY_ID` | 否 | 取 `ECS_ACCESS_KEY_ID` | DNS 操作的 AccessKey（可与 ECS 共用） | 同 ECS_ACCESS_KEY_ID，或单独授权 DNS 操作的子账号 |
| `DNS_ACCESS_KEY_SECRET` | 否 | 取 `ECS_ACCESS_KEY_SECRET` | DNS 操作的 SecretKey | 同上 |
| `DNS_DOMAIN` | 是 | - | 平台主域名（已托管到阿里云 DNS） | 需先将域名添加到阿里云云解析 DNS 并完成 NS 验证（如 `banyuan.club`） |
| `BACKEND_PUBLIC_URL` | 是 | `http://localhost:3001` | 后端公网可达地址（deploy-agent 通过此地址建立 WebSocket 连接） | 部署后端服务器后，填写其公网 URL（如 `https://api.banyuan.club`） |

### 租户 ECS 上的 deploy-agent（systemd 环境变量）

deploy-agent 的环境变量由 `TenantProvisionService.generateAgentScript()` 在初始化时自动写入 systemd service 文件，**不需要手动配置**：

| 变量名 | 来源 | 用途 |
|--------|------|------|
| `TENANT_ID` | 自动（注册时生成） | 标识当前租户 |
| `AGENT_TOKEN` | 自动（注册时生成，存入 Tenant.agentToken） | WebSocket 认证令牌 |
| `BACKEND_WS_URL` | 自动（由 BACKEND_PUBLIC_URL 推导，替换 http→ws + /ws/agent） | 后端 WebSocket 连接地址 |
| `DEPLOY_ROOT` | 自动（默认 /opt/banyuan/apps） | 项目 scaffold 和构建的工作目录 |
| `NGINX_SITES_DIR` | 自动（默认 /etc/nginx/sites-enabled） | Nginx 站点配置存放目录 |

### 前置准备步骤

在配置环境变量之前，需要完成以下阿里云资源准备：

1. **RAM 子账号**：在阿里云 RAM 控制台创建子账号，授予 `AliyunECSFullAccess` + `AliyunVPCFullAccess` + `AliyunDNSFullAccess` 权限，获取 AccessKey
2. **VPC + 交换机**：在目标地域创建 VPC（10.0.0.0/8 网段），创建交换机（子网），记录 VSwitch ID
3. **安全组**：在 VPC 内创建安全组，添加入方向规则：TCP 80（HTTP）、TCP 443（HTTPS），记录安全组 ID
4. **域名**：购买域名（如 `banyuan.club`），将 NS 解析迁移到阿里云云解析 DNS，验证生效
5. **ECS 镜像**（可选）：制作自定义镜像（预装 Docker + Node.js 22 + pnpm + Nginx），记录镜像 ID；或直接使用 Ubuntu 公共镜像，由初始化脚本安装所有依赖（首次开通约 5 分钟）
