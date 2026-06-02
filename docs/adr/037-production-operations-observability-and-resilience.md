# ADR-037：生产可运维 — 可观测性、部署韧性与 Web 服务热更新

**状态**：提案  
**决策日期**：2026-06-01  
**决策者**：陈班

---

## 背景

Banyuan 部署系统（ADR-028）实现了从 banyan 后端到租户 ECS 的全链路部署，但当前生产环境存在以下运维盲区：

1. **无可观测性**：后端仅有 koa-logger 请求日志，无结构化指标、无链路追踪、无告警。Agent 执行成功率/耗时/token 消耗无处查询。
2. **无部署韧性**：部署成功后无法回滚到前一版本，docker 容器如果 crash 仅靠 `--restart unless-stopped` 自愈，无健康检查上报。
3. **无版本感知**：终端用户的壳（Electron/Capacitor）无法感知 Web 服务已更新，用户需手动刷新才能加载新版本，且无版本一致性保证。
4. **单进程风险**：banyan 后端跑在单个 Koa 进程中，OOM 或未捕获异常将导致全站不可用。

本决策确立 Banyuan 从「能跑」到「可运维」所需的基础设施架构。

---

## 决策

### 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                       可观测性平面                                     │
│                                                                     │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌───────────┐  │
│  │ Prometheus │   │  Grafana   │   │   Loki     │   │ AlertMgr  │  │
│  │  (指标)    │   │  (仪表盘)   │   │  (日志)    │   │  (告警)    │  │
│  └─────┬──────┘   └────────────┘   └─────┬──────┘   └─────┬─────┘  │
│        │                                  │                │        │
└────────┼──────────────────────────────────┼────────────────┼────────┘
         │ pull /metrics                    │ push           │ webhook
         │                                  │                │
┌────────▼──────────────────────────────────▼────────────────▼────────┐
│                       Banyan 后端集群                                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────┐               │
│  │  PM2 Cluster (N workers)                         │               │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │               │
│  │  │Worker 0│ │Worker 1│ │Worker 2│ │Worker N│   │               │
│  │  └────────┘ └────────┘ └────────┘ └────────┘   │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │
│  │HealthService │  │MetricsService │  │ StructuredLogger (pino) │  │
│  └──────────────┘  └───────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ WebSocket
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    租户 ECS (deploy-agent)                            │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ deploy-agent    │  │ Docker 容器群      │  │ Nginx + acme.sh  │  │
│  │ (健康上报)       │  │ (healthcheck)     │  │ (SSL 自动续签)    │  │
│  └─────────────────┘  └──────────────────┘  └───────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ /opt/banyuan/versions/{appSlug}/{v1,v2,v3...}  (版本保留)    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Decision 1：可观测性三支柱

#### 1.1 结构化日志（Logs）

替换当前 koa-logger 为 **pino**（JSON 结构化），所有日志携带 `tenantId`、`requestId`、`userId` 字段：

```typescript
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin: () => ({
    service: 'banyan-backend',
    version: process.env.APP_VERSION,
  }),
})

// 每个请求注入 child logger
app.use(async (ctx, next) => {
  ctx.log = logger.child({
    requestId: ctx.state.requestId,
    tenantId: ctx.state.user?.tenantId,
  })
  await next()
})
```

日志通过 pino-loki transport 推送到 Loki（或阿里云 SLS），Grafana 统一查询。

#### 1.2 应用指标（Metrics）

暴露 Prometheus 格式的 `/metrics` 端点，核心指标：

| 指标名 | 类型 | 含义 |
|--------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数（按 method/path/status） |
| `http_request_duration_seconds` | Histogram | 请求延迟分布 |
| `ai_sessions_total` | Counter | AI 会话总数（按 mode: task/chat） |
| `ai_session_duration_seconds` | Histogram | AI 会话耗时 |
| `ai_tokens_consumed_total` | Counter | LLM token 消耗（按 provider/model） |
| `deploy_tasks_total` | Counter | 部署任务总数（按 type/status） |
| `deploy_task_duration_seconds` | Histogram | 部署耗时 |
| `ws_connections_active` | Gauge | 当前活跃的 agent WebSocket 连接数 |
| `tenant_agents_online` | Gauge | 在线 agent 数量 |

使用 `prom-client` 库，在 AgentGateway、AiService、DeployController 中埋点。

#### 1.3 告警规则

| 告警 | 条件 | 级别 | 通知方式 |
|------|------|------|---------|
| 高错误率 | 5xx rate > 5% 持续 3min | P1 | 钉钉/飞书 + 短信 |
| AI 超时 | ai_session_duration > 120s P95 | P2 | 钉钉/飞书 |
| Agent 离线 | tenant_agents_online 骤降 > 30% | P1 | 短信 |
| 部署连续失败 | deploy_tasks{status=failed} > 3 连续 | P2 | 钉钉/飞书 |
| MongoDB 慢查询 | query_duration > 5s | P2 | 日志标记 |
| 磁盘空间不足 | ECS disk usage > 85% | P1 | 短信 |

告警通过 Alertmanager → Webhook → 通知渠道（钉钉机器人/飞书/邮件/短信按级别分流）。

---

### Decision 2：部署韧性 — 发布快照与版本回滚

#### 2.1 发布快照存储设计

**核心问题**：回滚需要「那个版本当时发布的完整数据」，而不是「当前 MongoDB 中的最新数据」。因此必须在每次 publish 时将发送给 agent 的完整数据冻结为快照。

**设计决策**：在 `Deployment` 记录中嵌入 `snapshot` 字段，存储发布时的三份声明式数据：

```typescript
interface IDeploySnapshot {
  /** 完整的 appJSON（序列化字符串） */
  appJSON: string
  /** 数据库表定义 */
  collections: ICollectionSnapshot[]
  /** 云函数定义（FlowSchema 节点图） */
  cloudFunctions: ICloudFunctionSnapshot[]
}

// Deployment 记录
interface IDeployment {
  deploymentId: string
  applicationId: string
  tenantId: string
  version: number
  deployType: 'static' | 'fullstack'
  status: DeployStatus
  snapshot?: IDeploySnapshot    // ← 发布数据快照
  // ... 其他字段
}
```

**快照生成时机**：DeployController.publish 在创建 Deployment 记录时，将已查出的 appJSON + collections + cloudFunctions 同步写入 snapshot 字段。零额外查询开销。

**与对话快照（Snapshot）的关系**：

| 维度 | 对话快照（Snapshot 模型） | 发布快照（Deployment.snapshot） |
|------|--------------------------|-------------------------------|
| 触发时机 | AI task 对话完成时 | 用户点击 Publish 时 |
| 关联对象 | dialogueId（对话） | deploymentId（部署记录） |
| 用途 | 编辑态撤销/恢复 | 线上版本回滚 |
| 数据相同 | appJSON + collections + cloudFunctions | 相同三份数据 |
| 区别 | 记录编辑过程中的每个状态 | 只记录实际推到生产的状态 |

#### 2.2 版本保留策略（ECS 本地）

deploy-agent 在每次部署时保留历史版本构建产物，而非覆盖：

```
/opt/banyuan/versions/{appSlug}/
├── v1/           ← 第 1 次部署的 dist + server
├── v2/           ← 第 2 次
├── v3/           ← 当前活跃版本
└── current → v3  ← 符号链接指向当前版本
```

Nginx `root` 指向 `current` 符号链接。默认保留最近 **5 个版本**，超出自动清理最旧版本。

注意：ECS 本地的版本目录仅用于快速 symlink 切换（如果构建产物还在），是一种**加速手段**。真正的回滚数据源是 MongoDB 中 Deployment.snapshot——即使 ECS 本地版本被清理，也能从快照重新构建。

#### 2.3 回滚流程

回滚本质上就是「用历史快照重新做一次 publish」：

```
用户选择历史部署版本 → POST /api/deploy/rollback { deploymentId }
  → 后端从 Deployment.snapshot 取出冻结的 appJSON + collections + cloudFunctions
  → 创建新的 Deployment 记录（snapshot 复用，形成完整审计链）
  → 构建 DeployRequest（与 publish 相同结构）
  → 发送给 agent 执行标准部署流程
  → agent 本地 scaffold + build + docker run
  → 上报 deploy:result success
```

**关键设计**：回滚不走特殊协议，而是复用标准的 `deploy:start` 消息。对 agent 来说，回滚和正常发布没有区别——都是收到一个 DeployRequest 然后构建部署。这大幅简化了 agent 实现。

#### 2.4 DeployController 回滚端点

```
POST /api/deploy/rollback
Body: { deploymentId }     ← 要回滚到的目标历史 Deployment 记录 ID
Response: { deploymentId, rollbackTo, rollbackToVersion, status: 'pending' }
```

校验逻辑：
- 目标 Deployment 必须存在且属于当前租户
- 目标 Deployment 状态必须为 `success`（不能回滚到失败的版本）
- 目标 Deployment 必须有 `snapshot` 字段（早期无快照的记录无法回滚）
- Agent 必须在线

#### 2.5 容器健康检查

deploy-agent 定时（每 30s）检查所有 fullstack 应用容器的健康状态：

```typescript
// 健康检查逻辑
async function checkContainerHealth(containerName: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}
```

如果连续 3 次健康检查失败，agent 通过 `deploy:progress` 上报 `{ step: 'health_alert', message: '容器不健康' }`，后端写入 Deployment 记录并触发告警。

---

### Decision 3：数据驱动热更新 — 构建即部署

#### 3.1 更新本质

Banyuan 应用的「热更新」本质上是三份声明式数据在租户 ECS 上的更新与重建：

| 数据源 | 含义 | 存储位置 | 更新时部署到 |
|--------|------|---------|-------------|
| **appJSON** | UI 页面定义（pages/theme/globalData） | banyan MongoDB `applications` 集合 | 前端 SPA 的 `/public/app.json` |
| **collections** | 动态数据库表结构定义 | banyan MongoDB `collectionschemas` 集合 | 服务端 `schema.json` → Mongoose 动态模型 |
| **cloudFunctions** | 云函数（FlowSchema 节点图） | banyan MongoDB `cloudfunctions` 集合 | 服务端 `functions.json` → FlowRunner 执行 |

产品交付给终端用户的架构与 Banyan 自身一致：**平台壳（Electron/Capacitor/Web）+ Web 服务**。壳只是 WebView 容器，应用的实际内容由上述三份数据决定。

**核心设计决策**：每次 publish 都将这三份数据发送到租户 ECS，由 deploy-agent 在本地执行构建和部署。用户应用的「更新」就是这三份数据的增量传输 + ECS 本地重建。

#### 3.2 热更新完整流程

```
用户在 Banyan 平台点击 Publish
  → banyan 后端 DeployController 查询 MongoDB 取出：
      • appJSON（Application 文档的 pages/theme/globalData）
      • collections（该应用关联的 CollectionSchema 文档组）
      • cloudFunctions（该应用关联的 CloudFunction 文档组）
  → 自动判断 deployType：有 collections 或 cloudFunctions → fullstack，否则 static
  → 构建 DeployRequest { appJSON, collections?, cloudFunctions?, ... }
  → 通过 AgentGateway WebSocket 发送到租户 ECS 的 deploy-agent
  → deploy-agent 收到 DeployRequest 后本地执行：
      1. scaffoldProject(appJSON) → 生成 React + Vite 前端项目（含 /public/app.json）
      2. pnpm install + pnpm build → 输出 dist/（SPA 静态资源）
      3. [fullstack] scaffoldServer(collections, cloudFunctions) → 生成 Koa 服务端：
          • schema.json ← collections 快照
          • functions.json ← cloudFunctions 快照
          • index.js（Koa 入口 + 自动 CRUD 路由 + 云函数路由）
          • db.js（从 schema.json 动态生成 Mongoose 模型）
          • flow-runner.js（FlowSchema 执行器）
          • Dockerfile
      4. [fullstack] docker build → docker stop 旧容器 → docker run 新容器
      5. 替换 Nginx 静态目录 + reload
      6. 上报 deploy:result success + 返回访问 URL
```

#### 3.3 更新粒度分析

| 变更内容 | 影响范围 | 部署动作 |
|---------|---------|---------|
| 仅修改页面 UI（appJSON 变化） | 前端 SPA 重建 | Vite rebuild + Nginx reload |
| 新增/修改数据表（collections 变化） | 服务端 schema.json 变化 | Docker 重建重启（Mongoose 动态加载新 schema） |
| 新增/修改云函数（cloudFunctions 变化） | 服务端 functions.json 变化 | Docker 重建重启（FlowRunner 加载新节点图） |
| 三者都变 | 全量重建 | 前端 + 服务端全部重建 |

当前实现为**全量重建策略**（每次 publish 都完整执行上述流程），这对于 MVP 是合理的——构建时间在单应用级别可控（< 60s），且保证了版本一致性。

#### 3.4 后续优化方向（P2）

1. **增量检测**：对比上次部署的 hash，如果 appJSON 未变则跳过前端重建，如果 collections/cloudFunctions 未变则跳过 Docker 重建
2. **服务端热重载**：不重建 Docker 镜像，而是 volume mount schema.json/functions.json，容器内 watch 文件变化后 graceful restart
3. **前端版本探测**：SPA 内置 `/version.json` 检测机制，部署完成后自动通知终端用户刷新

```typescript
// 未来优化：前端版本探测（部署后 deploy-agent 生成 /version.json）
// { "hash": "a3f2b1c", "version": "1.2.0", "deployedAt": "2026-06-01T10:30:00Z" }
```

#### 3.5 壳更新策略（低优先级，P2）

壳（Electron/Capacitor）本身只是 WebView wrapper，更新频率极低（预计季度级）：

- **常规 publish 不涉及壳更新**：用户刷新页面即可加载新版 SPA + 使用新版 API
- **壳更新场景**：仅当 native 引擎安全补丁、新增 native 能力时需要推送新安装包
- **实现方式**：用户在 Banyuan 管理面板下载新安装包即可；当终端规模 >1000 时再引入 electron-updater 自动更新

#### 3.6 域名方案（简化）

MVP 阶段统一使用 `*.banyuan.club` 子域名，通过通配符证书覆盖所有租户应用：

```nginx
server {
    listen 443 ssl;
    server_name ~^(?<app>.+)\.(?<tenant>.+)\.banyuan\.club$;

    ssl_certificate /etc/ssl/banyuan.club/fullchain.pem;   # 通配符证书
    ssl_certificate_key /etc/ssl/banyuan.club/privkey.pem;

    root /opt/banyuan/versions/$app/current/dist;
    # ...
}
```

自定义域名绑定作为 **付费增值功能** 后续迭代（参见 ADR-036 增值服务），暂不实现。

---

### Decision 4：进程管理与高可用

#### 4.1 banyan 后端 — PM2 Cluster 模式

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'banyan-backend',
    script: './dist/app.js',
    instances: 'max',       // CPU 核数
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
  }],
}
```

注意事项：
- AgentGateway（WebSocket）在 cluster 模式下需要 sticky session，或将 WebSocket 服务独立为单进程
- 替代方案：AgentGateway 独立为子进程，通过 Redis Pub/Sub 与 API workers 通信

#### 4.2 deploy-agent — systemd watchdog

当前已通过 systemd `Restart=always` 管理。增强为 watchdog 模式：

```ini
[Service]
Type=notify
WatchdogSec=60
# agent 进程每 30s 调用 sd_notify("WATCHDOG=1")
# 如果 60s 内未收到，systemd 强制重启
```

#### 4.3 MongoDB — Replica Set

单节点 MongoDB 是 SPOF。生产环境最小配置为 3 节点 Replica Set（1 Primary + 2 Secondary）。短期可使用云托管 MongoDB（阿里云 MongoDB/MongoDB Atlas）替代自建。

---

### Decision 5：部署日志实时查看

#### 问题

当前 deploy 进度通过 `deploy:progress` 消息传递给后端，仅存储最新一条 `currentStep`。用户无法查看完整的部署日志。

#### 方案

agent 在部署过程中产生的所有 stdout/stderr 输出，按行追加到 `deploy:log` 消息中流式上报：

```typescript
// 新增消息类型
type AgentToServerType = ... | 'deploy:log'

interface DeployLog {
  requestId: string
  line: string
  stream: 'stdout' | 'stderr'
  timestamp: string
}
```

后端收到后：
1. 写入 MongoDB `DeploymentLog` 集合（TTL 30 天自动清理）
2. 通过 SSE 推送到前端（如果用户正在查看部署详情页）

前端部署详情页实时展示类似 CI/CD 的日志终端界面。

---

## 影响范围

### 新增文件

| 文件 | 用途 |
|------|------|
| `backend/src/services/MetricsService.ts` | Prometheus 指标采集 |
| `backend/src/services/HealthService.ts` | 健康检查端点 + 依赖探活 |
| `backend/src/middleware/requestId.ts` | 生成 requestId 注入上下文 |
| `backend/src/middleware/metrics.ts` | HTTP 请求指标中间件 |
| `backend/src/models/DeploymentLog.ts` | 部署日志模型（TTL） |
| `deploy-agent/src/versioning.ts` | 版本保留/清理/symlink 管理 |
| `deploy-agent/src/health-checker.ts` | 容器定时健康检查 |
| `deploy-agent/src/version-json.ts` | 部署后生成 /version.json |
| `backend/ecosystem.config.cjs` | PM2 集群配置 |
| `infra/prometheus/` | Prometheus 配置 + 告警规则 |
| `infra/grafana/dashboards/` | Grafana 仪表盘 JSON |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/app.ts` | 注册 metrics/requestId 中间件、挂载 /metrics 端点 |
| `backend/src/services/AgentGateway.ts` | 新增 `deploy:rollback` 消息处理、`deploy:log` 消息转发、Prometheus 计数器 |
| `backend/src/controllers/DeployController.ts` | 新增 rollback/domains 端点 |
| `deploy-agent/src/types.ts` | 新增 RollbackRequest/DeployLog 类型、`deploy:rollback` 消息类型 |
| `deploy-agent/src/DeployAgent.ts` | 版本目录管理、健康检查循环、rollback 处理、log 流式上报、version.json 生成 |
| `deploy-agent/src/scaffold.ts` | Dockerfile 增加 HEALTHCHECK 指令 |
| `backend/package.json` | 新增 pino/prom-client/pm2 依赖 |
| `deploy-agent/package.json` | — |

### 新增基础设施

| 组件 | 部署位置 | 用途 |
|------|---------|------|
| Prometheus | 中心节点 | 指标拉取 + 存储 |
| Grafana | 中心节点 | 可视化仪表盘 |
| Loki | 中心节点 | 日志聚合 |
| Alertmanager | 中心节点 | 告警路由 + 通知 |
| Redis | 中心节点 | 指标缓存（也服务于 ADR-036 的计量） |

---

## 备选方案与否决理由

### 备选 1：使用云 APM（阿里云 ARMS / Datadog）替代自建可观测性

否决理由：成本随租户数线性增长，对于早期 SaaS 来说自建 Prometheus + Grafana + Loki 的栈成本更可控（均开源免费）。后期如果运维负担增大可迁移到 Grafana Cloud。

### 备选 2：蓝绿部署替代版本 symlink 切换

否决理由：每个租户 ECS 是单机（2C4G），没有足够资源同时运行两套完整应用实例。symlink 原子切换是单机场景下最轻量的零停机方案。

### 备选 3：Kubernetes 替代 Docker + systemd

否决理由：K8s 的最低资源门槛（3 节点 master + N worker）远超单租户 ECS 规格。去中心化架构下每台 ECS 是独立的运行单元，systemd + Docker Compose 是最合适的编排粒度。未来如果单租户规模增长到多机，可引入 K3s 作为轻量编排。

### 备选 4：壳内嵌更新服务（electron-updater / CodePush）

保留作为后期可选方案。当前壳更新频率极低（季度级），用户在 Banyuan 管理面板下载新安装包即可。当用户量达到一定规模（>1000 终端），再引入自动更新能力以减少用户操作成本。

---

## 实施计划

**阶段 1（1 周）— 可观测**：pino 结构化日志 + Prometheus 指标 + Grafana 基础仪表盘 + 核心告警规则  
**阶段 2（1 周）— 可回滚**：版本目录管理 + rollback 协议 + 容器健康检查 + 部署日志流  
**阶段 3（3 天）— 热更新增强**：增量检测（hash 对比跳过无变更构建）+ version.json 生成 + 通配符 SSL 证书  
**阶段 4（3 天）— 高可用**：PM2 cluster 部署 + AgentGateway 独立进程 + MongoDB Replica Set  
**阶段 5（后续）— 壳更新**：electron-updater 集成（当终端规模 >1000 时启动）
