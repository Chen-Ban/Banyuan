# ADR-028 Build Plan：Web 部署发布与跨平台发布体系

> 对应决策：[ADR-028](./028-web-deployment-and-cross-platform-publishing.md)  
> 创建日期：2026-05-28

---

## 建设步骤

### Step 1：Deploy Service 骨架（P0，基础设施）

**目标**：建立部署控制面的核心框架

**内容**：

- 创建 `apps/deploy-service/`（Koa + TypeScript，与 banyan backend 同技术栈）
- 阿里云 ECS SDK 集成（@alicloud/ecs20140526）
- 阿里云 OSS SDK 集成（ali-oss）
- BullMQ 构建队列基础设施（Redis 连接、队列定义、Worker 框架）
- 基础 API：`POST /tenants/provision`、`POST /apps/{appId}/deploy`、`GET /apps/{appId}/status`
- WebSocket Server 骨架（用于 deploy-agent 连接）

**产物**：可启动的 Deploy Service，能接收请求、入队列

---

### Step 2：构建流水线改造（P0，核心链路）

**目标**：构建产物从本地存储迁移到 OSS，支持分发

**内容**：

- 将现有 `apps/banyan/backend/src/services/build/` 中的 scaffold + bundle 逻辑提取为可复用函数
- 构建完成后：压缩 `dist/` 为 tar.gz → 上传阿里云 OSS
- OSS 路径规范：`builds/{tenantId}/{appId}/{version}/{appId}-{version}.tar.gz`
- 构建记录持久化到 MongoDB（PublishRecord 模型：version/status/ossPath/createdAt）
- banyan 后端新增路由：`POST /api/v1/apps/:appId/publish`（触发 Web 发布）

**依赖**：Step 1（队列基础设施）

---

### Step 3：deploy-agent 开发（P0，核心链路）

**目标**：开发运行在租户 ECS 上的管控代理

**内容**：

- 创建 `packages/deploy-agent/`（独立 Node.js 进程，零外部依赖原则）
- WebSocket Client：主动连接平台 Deploy Service，断线重连 + 心跳
- 指令处理器：
  - `deploy`：从 OSS 下载产物 → 解压 → 更新 current 软链接 → reload Nginx
  - `rollback`：切换 current 到指定版本 → reload Nginx
  - `create-app`：创建容器 + Nginx server block
  - `remove-app`：停止容器 + 删除 Nginx 配置
  - `health`：上报容器状态、磁盘、内存
- 版本目录管理：保留最近 5 个版本，自动清理旧版本
- systemd service 配置文件（开机自启、崩溃重启）
- 安装脚本：`install.sh`（一键部署 agent 到目标 ECS）

**依赖**：Step 1（WebSocket 协议定义）

---

### Step 4：租户 ECS 全自动化开通（P0，基础设施）

**目标**：用户付费后零人工干预，全 API 驱动开通租户环境

**内容**：

- Deploy Service 中实现 `TenantProvisionService`：
  - `RunInstances` 创建 ECS（使用预制自定义镜像，内含 Docker CE + Node.js 20 + deploy-agent）
  - `AllocateEipAddress` + `AssociateEipAddress` 分配并绑定弹性 IP
  - `DescribeInstances` 轮询等待实例 Running 状态
  - `SendCommand`（Cloud Assistant）远程执行最终初始化：启动 deploy-agent、配置 Nginx、拉取 SSL 证书
  - `AuthorizeSecurityGroup` 开放 80/443
  - `AddDomainRecord` 添加 `*.{tenantId}.banyuan.app` A 记录指向 EIP
- 自定义镜像制作脚本（一次性）：
  - 基于 Ubuntu 22.04 安装 Docker CE + Node.js 20 + deploy-agent + Nginx + acme.sh
  - 通过 `CreateImage` API 保存为自定义镜像
- 写入 Tenant 模型（MongoDB）：tenantId/ecsInstanceId/eip/status/provisionedAt/chargeType
- 退订/欠费流程：`DeleteInstance` + `ReleaseEipAddress` + `DeleteDomainRecord` + 状态置 terminated
- 认证：RAM 子账号 + STS AssumeRole 临时凭证

**阿里云 SDK 依赖**：

```
@alicloud/ecs20140526      — ECS 实例/安全组/Cloud Assistant
@alicloud/vpc20160428      — 弹性 IP 分配/绑定/释放
@alicloud/alidns20150109   — DNS 记录增删改查
@alicloud/openapi-client   — SDK 公共基础
@alicloud/tea-util         — SDK 工具类
```

**依赖**：Step 3（agent 安装脚本）

---

### Step 5：Nginx 网关动态路由（P1，核心链路）

**目标**：实现应用级域名路由

**内容**：

- deploy-agent 管理 Nginx 配置模板：
  ```nginx
  server {
      listen 443 ssl;
      server_name {appSlug}.{tenantId}.banyuan.app;
      ssl_certificate /etc/letsencrypt/live/*.{tenantId}.banyuan.app/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/*.{tenantId}.banyuan.app/privkey.pem;
      root /srv/banyuan/apps/{appId}/current/dist;
      index index.html;
      location / {
          try_files $uri $uri/ /index.html;  # SPA fallback
      }
  }
  ```
- 应用创建/删除时动态生成/移除 server block
- `nginx -t` 校验 + `nginx -s reload` 热加载
- 带云函数应用：proxy_pass 到对应 Docker 容器端口

**依赖**：Step 3、Step 4

---

### Step 6：端到端联调 + 前端发布面板（P1，用户体验）

**目标**：完成从设计器"点击发布"到"浏览器可访问"的完整闭环

**内容**：

- Banyan 前端新增"发布管理"面板：
  - 发布按钮（触发构建 + 部署）
  - 发布状态轮询（building → deploying → online）
  - 版本列表 + 回滚操作
  - 正式链接展示 + 复制
- Banyan 后端：
  - `POST /api/v1/apps/:appId/publish` → 调用 Deploy Service
  - `GET /api/v1/apps/:appId/deployments` → 版本列表
  - `POST /api/v1/apps/:appId/rollback` → 回滚
- 全链路测试：创建应用 → 设计 → 发布 → 访问 → 修改 → 重新发布 → 回滚

**依赖**：Step 2、Step 5

---

### Step 7：生产化加固（P1，稳定性）

**目标**：让系统可上生产

**内容**：

- 构建队列：优先级（VIP 租户优先）、失败重试（最多 3 次）、超时取消（10 分钟）
- 健康监控：
  - deploy-agent 定时上报：容器状态、CPU/内存/磁盘使用率
  - Deploy Service 聚合展示 + 异常告警（钉钉/邮件）
  - ECS 实例级监控（阿里云云监控 CloudMonitor）
- 安全加固：
  - deploy-agent ↔ Deploy Service 通信加密（WSS + Token 认证）
  - OSS 产物签名 URL（防篡改）
  - 租户 ECS 安全组最小化开放
- 自定义域名支持：
  - 用户配置 CNAME → deploy-agent 动态申请 SSL 证书
  - Nginx 配置更新
- 日志系统：应用访问日志 + 部署操作日志 + agent 运行日志

**依赖**：Step 6

---

### Step 8：跨平台扩展 — Capacitor 移动端（P2，扩展能力）

**目标**：复用 Web 构建产物发布 iOS/Android 应用

**内容**：

- 构建流水线扩展：
  - `dist/` 产出后 → `npx cap init` + `npx cap sync`
  - iOS：需要 macOS 构建机（可用 Mac Mini/GitHub Actions macOS runner）
  - Android：Gradle assembleRelease → .apk/.aab
- Deploy Service 新增移动端构建 Worker
- Capacitor 配置模板：
  - `capacitor.config.ts`（appId/appName/webDir 动态生成）
  - 原生插件按需集成（Camera/Geolocation/Push Notification）
- 产物分发：
  - iOS → TestFlight / App Store Connect API
  - Android → Google Play Console API / 直接下载 APK
- 前端发布面板扩展：选择发布平台（Web/Desktop/iOS/Android）

**依赖**：Step 6（Web 发布闭环完成）

### Step 9：支付接入与计费模块（P1，商业闭环）

**目标**：完成用户付费 → 自动开通 → 持续计费 → 成本监控的商业闭环

**内容**：

- 支付接入（用户→平台）：
  - 微信支付 V3 API（JSAPI + Native 扫码）
  - 支付宝当面付（当面付/手机网站）
  - 统一支付回调处理：验签 → 创建 Order → 更新 Subscription 状态 → 触发 TenantProvisionService
- 订阅管理：
  - Subscription 模型：tenantId/plan/status/startAt/expireAt/autoRenew
  - 到期提醒（提前 7 天通知）+ 自动续费扣款
  - 欠费处理：到期 → 宽限期 3 天 → 触发三级降级策略（详见 Step 11 / ADR-028 决策九）
- 阿里云成本监控：
  - `@alicloud/bssopenapi20171214`：QueryAccountBalance（余额）、QueryBill（账单明细）
  - 定时任务：每日拉取阿里云实际消耗，按租户维度归集
  - 余额告警：余额 < ¥5000 邮件/钉钉通知
  - 自动充值触发条件记录（实际充值仍需人工确认或自动代扣）
- 计费模式自动优化：
  - 租户连续付费 ≥ 3 个月 → 自动调用 `ModifyInstanceChargeType` 转包年包月
  - 降本估算日志：记录每次切换节省的成本
- 前端订阅管理页：
  - 套餐选择 + 支付二维码
  - 订阅状态/到期时间/续费入口
  - 用量统计（应用数/存储/带宽）

**产物**：用户可在平台内完成付费，付费即自动开通；平台可监控阿里云成本

**依赖**：Step 4（TenantProvisionService）、Step 6（前端面板框架）

---

### Step 10：成本看板与运营工具（P2，运营支撑）

**目标**：为平台运营者提供租户级别的成本与收入可视化

**内容**：

- 运营后台页面（Banyan 管理面板）：
  - 租户列表：状态/ECS 实例/应用数/月消耗/收入/毛利
  - 成本趋势图：按日/周/月统计阿里云总消耗
  - 告警记录：余额告警/实例异常/欠费租户
- 自动化报表：
  - 每月初生成上月收支报表
  - 对比用户收入 vs 阿里云成本 = 实际毛利
- 优化建议：
  - 识别低使用率实例（CPU < 5%），建议降配
  - 识别高使用率实例，建议升配

**依赖**：Step 9（计费数据源）

---

### Step 11：租户休眠与冷藏自动化（P2，成本优化）

**目标**：实现租户分级停机策略，最大化闲置资源的成本节省

**内容**：

- 三级降级自动化：
  - 第一级（节省停机）：`StopInstances(StoppedMode=StopCharging)` → 释放 vCPU/内存，保留云盘和 EIP（~¥12/月）
  - 第二级（冷藏归档）：`mongodump` + 压缩 → OSS 归档存储 → `DeleteInstance` + 释放 EIP（~¥2/月）
  - 第三级（数据清除）：删除 OSS + MongoDB Tenant 记录（不可逆，需 7 天申诉期）
- 触发规则引擎：
  - 基于 Subscription.expireAt + 宽限期天数，定时任务检查并触发降级
  - 第一级→第二级：节省停机满 30 天自动升级
  - 第二级→第三级：冷藏满 180 天 + 7 天申诉期
- 恢复链路：
  - 从第一级恢复：`StartInstance` → deploy-agent 自启动 → ~30 秒
  - 从第二级恢复：TenantProvisionService 创建新 ECS → `mongorestore` → 从 OSS 拉取产物重新部署 → ~5 分钟
- 用户通知：每次降级/预警通过邮件 + 站内信通知
- Pool 模式兼容：恢复逻辑抽象为接口，后续 Pool 模式下切换实现（产物部署到共享集群 + 数据恢复到共享 DB）

**技术选型补充**：

| 组件 | 选型 | 理由 |
|------|------|------|
| OSS 存储类型 | Archive（归档）/ Cold Archive（冷归档） | 租户冷藏数据极少访问 |
| 定时任务 | node-cron 或 BullMQ Repeat | 与现有基础设施复用 |
| 数据备份 | mongodump CLI (child_process) | 最可靠的 MongoDB 备份方式 |

**产物**：到期租户自动降级节省成本，用户续费后自动恢复

**依赖**：Step 9（Subscription 模型 + 到期状态）、Step 4（TenantProvisionService 用于恢复）

---

## 依赖关系图

```
Step 1 (Deploy Service 骨架)
  ├──▶ Step 2 (构建流水线改造)
  │         └──▶ Step 6 (端到端联调)
  │                   └──▶ Step 7 (生产化加固)
  │                   └──▶ Step 8 (Capacitor 移动端)
  └──▶ Step 3 (deploy-agent)
            └──▶ Step 4 (ECS 全自动化开通)
                      ├──▶ Step 5 (Nginx 动态路由)
                      │         └──▶ Step 6 (端到端联调)
                      └──▶ Step 9 (支付接入与计费)
                                ├──▶ Step 10 (成本看板与运营)
                                └──▶ Step 11 (租户休眠与冷藏)
```

---

## 里程碑

| 里程碑 | 包含步骤 | 交付标志 | 预估工期 |
|--------|---------|---------|---------|
| **M1：Web 发布 MVP** | Step 1~6 | 用户可点击发布，浏览器可访问应用 | 8 周 |
| **M2：生产就绪** | Step 7 | 监控告警就位，自定义域名可用，安全审计通过 | 4 周 |
| **M3：商业闭环** | Step 9 | 用户可付费，自动开通，成本可监控 | 4 周 |
| **M4：移动端发布** | Step 8 | 同一应用可构建为 iOS/Android 安装包 | 5 周 |
| **M5：运营工具** | Step 10~11 | 成本看板上线，租户休眠自动化，运营可自助查看收支 | 4 周 |

---

## 技术选型

| 组件 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 云服务器 | 阿里云 ECS | - | 完善 OpenAPI，Cloud Assistant 远程管控 |
| 对象存储 | 阿里云 OSS | - | 与 ECS 同区域内网传输免费 |
| DNS | 阿里云 DNS | - | API 管理泛域名解析 |
| SSL 证书 | Let's Encrypt + acme.sh | - | 免费，支持 DNS 验证通配符证书 |
| 构建队列 | BullMQ | ^5.x | Node.js 生态最成熟的任务队列 |
| 容器运行时 | Docker CE | ^26.x | 轻量，单机够用 |
| 反向代理 | Nginx | ^1.26 | 高性能静态托管 + 动态路由 |
| 移动端封装 | Capacitor | ^6.x | 现代化跨平台方案，活跃维护 |
| Agent 通信 | WebSocket (ws) | ^8.x | 轻量双向通信，agent 主动外连 |
| ECS SDK | @alicloud/ecs20140526 | latest | ECS 实例管理/安全组/Cloud Assistant |
| VPC SDK | @alicloud/vpc20160428 | latest | 弹性 IP 分配/绑定/释放 |
| DNS SDK | @alicloud/alidns20150109 | latest | 域名解析记录 CRUD |
| 费用 SDK | @alicloud/bssopenapi20171214 | latest | 账户余额/账单明细/成本监控 |
| 支付（微信） | wechatpay-node-v3 或官方 SDK | latest | 微信支付 V3 API（Native/JSAPI） |
| 支付（支付宝） | alipay-sdk | latest | 支付宝当面付/手机网站 |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 构建队列积压（多租户同时发布） | 发布延迟 | 水平扩展 Worker 数量 + 优先级队列 |
| 租户 ECS 宕机 | 该租户所有应用不可访问 | 健康检查 + 自动重启 + 告警 |
| OSS 产物下载失败 | 部署中断 | 重试 3 次 + 降级为 Deploy Service 直传 |
| Let's Encrypt 证书续期失败 | HTTPS 不可用 | acme.sh cron 监控 + 提前 30 天续期 + 告警 |
| iOS 构建依赖 macOS | 移动端构建能力受限 | M4 阶段再引入 macOS 构建机，不阻塞 Web 发布 |
| Docker 镜像拉取慢 | 首次部署耗时长 | ECS 初始化时预拉取基础镜像 |
| 阿里云账户余额不足 | 新租户开通失败 | 余额告警 + 自动充值 + 开通前余额预检 |
| 支付回调丢失 | 用户付费后未开通 | 回调重试 + 定时对账 + 人工补单入口 |

---

## 成本估算（单租户）

| 资源 | 规格 | 月费用（估） |
|------|------|------------|
| ECS 实例 | ecs.t6-c1m2.large (2C4G) | ¥70~100 |
| 弹性 IP | 5Mbps 带宽 | ¥100~150 |
| OSS 存储 | 按量（构建产物通常 <100MB） | ¥5~10 |
| DNS 解析 | 基础版 | 免费 |
| SSL 证书 | Let's Encrypt | 免费 |
| **合计** | | **¥175~260/月/租户** |

---

## 与现有系统的衔接

- `apps/banyan/backend/src/services/build/`：scaffold + bundle 逻辑不变，新增 OSS 上传步骤
- `apps/banyan/backend/src/services/build/electron.ts`：桌面发布路径完全保留，不受影响
- `apps/banyan/backend/src/services/preview/`：可选升级为部署到 staging 容器（M2 阶段）
- 新增 `apps/deploy-service/`：独立服务，通过 HTTP 与 banyan backend 通信
- 新增 `apps/deploy-service/src/services/billing/`：支付回调、订阅管理、阿里云成本监控
- `apps/banyan/frontend/`：新增订阅管理页面（套餐选择/支付/续费）
- 新增 `packages/deploy-agent/`：独立包，构建后部署到租户 ECS
