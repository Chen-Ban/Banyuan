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

### Step 4：租户 ECS 初始化自动化（P0，基础设施）

**目标**：一键开通租户服务器

**内容**：

- Deploy Service 中实现 `TenantProvisionService`：
  - 调用 ECS API 创建实例（ecs.t6-c1m2.large，Ubuntu 22.04）
  - 分配弹性 IP + 配置安全组（开放 80/443）
  - 通过 Cloud Assistant 执行初始化脚本
- 初始化脚本内容：
  - 安装 Docker CE
  - 安装 Node.js 20（仅供 deploy-agent 运行）
  - 部署 deploy-agent + 启动 systemd 服务
  - 安装 Nginx + 基础配置
  - 配置 Let's Encrypt 泛域名证书（acme.sh + DNS API 验证）
- 阿里云 DNS API：添加 `*.{tenantId}.banyuan.app` A 记录指向 EIP
- 写入 Tenant 模型（MongoDB）：tenantId/ecsInstanceId/eip/status/provisionedAt

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

---

## 依赖关系图

```
Step 1 (Deploy Service 骨架)
  ├──▶ Step 2 (构建流水线改造)
  │         └──▶ Step 6 (端到端联调)
  │                   └──▶ Step 7 (生产化加固)
  │                   └──▶ Step 8 (Capacitor 移动端)
  └──▶ Step 3 (deploy-agent)
            └──▶ Step 4 (ECS 初始化自动化)
                      └──▶ Step 5 (Nginx 动态路由)
                                └──▶ Step 6 (端到端联调)
```

---

## 里程碑

| 里程碑 | 包含步骤 | 交付标志 | 预估工期 |
|--------|---------|---------|---------|
| **M1：Web 发布 MVP** | Step 1~6 | 用户可点击发布，浏览器可访问应用 | 8 周 |
| **M2：生产就绪** | Step 7 | 监控告警就位，自定义域名可用，安全审计通过 | 4 周 |
| **M3：移动端发布** | Step 8 | 同一应用可构建为 iOS/Android 安装包 | 5 周 |

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

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 构建队列积压（多租户同时发布） | 发布延迟 | 水平扩展 Worker 数量 + 优先级队列 |
| 租户 ECS 宕机 | 该租户所有应用不可访问 | 健康检查 + 自动重启 + 告警 |
| OSS 产物下载失败 | 部署中断 | 重试 3 次 + 降级为 Deploy Service 直传 |
| Let's Encrypt 证书续期失败 | HTTPS 不可用 | acme.sh cron 监控 + 提前 30 天续期 + 告警 |
| iOS 构建依赖 macOS | 移动端构建能力受限 | M3 阶段再引入 macOS 构建机，不阻塞 Web 发布 |
| Docker 镜像拉取慢 | 首次部署耗时长 | ECS 初始化时预拉取基础镜像 |

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
- 新增 `packages/deploy-agent/`：独立包，构建后部署到租户 ECS
