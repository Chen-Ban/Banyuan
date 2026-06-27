# @banyuan/deploy-agent

> 一键发布到多个平台，部署的最后一公里。

`@banyuan/deploy-agent` 是运行在**租户 ECS 上**的部署代理。它通过 WebSocket 与 Banyan 后端保持长连接，接收部署指令后在租户自己的机器上脚手架化、构建并发布应用——把 Banyuan「从生成到上线，一气呵成」的承诺落到租户独立的运行环境中。

部署产物可以是纯静态站点，也可以是带后端服务器与数据库的全栈应用。云函数的 FlowSchema 在这里真正执行——Banyan 后端只负责存储定义。

---

## 它在架构里的位置

```
Banyan 后端(:3001) ──WebSocket──▶ 租户 ECS (deploy-agent)
                                       │
                                       ├─ 脚手架化项目 / 服务器
                                       ├─ Docker 构建
                                       └─ Nginx 配置 → 上线
```

deploy-agent 不属于平台中心服务，而是部署在**每个租户自己的 ECS** 上的常驻进程。后端通过 AgentGateway 下发指令，agent 在本地执行，将进度与结果回传。这样租户应用的数据与运行环境与平台完全隔离。

---

## 工作流程

1. **连接与认证**：agent 启动后连接 `BACKEND_WS_URL`，发送 `auth`（携带 `agentToken` + `teamId`），并维持 30s 心跳；断线自动指数退避重连（5s → 60s）。
2. **接收部署指令**：后端下发 `deploy:start`，携带 `DeployRequest`（appId、appSlug、deployType、appJSON、collections、cloudFunctions 等）。
3. **脚手架化**：
   - `scaffoldProject()` 生成前端项目（页面、主题、入口）。
   - `scaffoldServer()` 在全栈模式下生成后端服务器代码，内含 `flowRunner` 模块——通过 `createServerFlowRunner()`（来自 `@banyuan/banvasgl/flow/server`）执行云函数的 FlowSchema。
4. **构建与发布**：执行 Docker 构建，写入 Nginx 站点配置，启动服务。
5. **回传进度/结果**：通过 `deploy:progress` 与 `deploy:result` 上报，成功时返回访问 URL。

---

## 部署类型

| 类型        | 说明       | 产物                                                       |
| ----------- | ---------- | ---------------------------------------------------------- |
| `static`    | 纯静态站点 | 构建后的前端资源 + Nginx 静态托管                          |
| `fullstack` | 全栈应用   | 前端 + 后端服务器（含数据库连接、云函数执行）+ Docker 容器 |

---

## 公共 API

| 导出              | 说明                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeployAgent`     | 部署代理核心类（`connect()` / `disconnect()`），内部实现 `deployStatic` / `deployFullstack`                                                                                                                                |
| `scaffoldProject` | 脚手架化前端项目                                                                                                                                                                                                           |
| `scaffoldServer`  | 脚手架化后端服务器（`ScaffoldServerOptions`），会调用 `generateFlowRunnerModule` 生成 flow-runner 模块                                                                                                                     |
| 类型              | `AgentConfig`、`AgentMessage`、`AgentMessageType`、`AgentOutMessageType`、`DeployType`、`DeployRequest`、`DeployProgress`、`DeployResult`、`CollectionDef`、`FieldDef`、`FieldType`、`CloudFunctionDef`、`UIDefinition` 等 |

---

## CLI 与配置

提供 `deploy-agent` 可执行入口（`bin`），从环境变量读取配置后启动：

```bash
deploy-agent
```

| 环境变量          | 必填 | 默认值                     | 说明                       |
| ----------------- | ---- | -------------------------- | -------------------------- |
| `AGENT_TOKEN`     | ✅   | —                          | 认证 token                 |
| `TENANT_ID`       | ✅   | —                          | 租户 ID                    |
| `BACKEND_WS_URL`  | ✅   | —                          | Banyan 后端 WebSocket 地址 |
| `DEPLOY_ROOT`     | —    | `/opt/banyuan/apps`        | 部署根目录                 |
| `NGINX_SITES_DIR` | —    | `/etc/nginx/sites-enabled` | Nginx 站点配置目录         |

接收 `SIGINT` / `SIGTERM` 时优雅退出。

---

## 依赖与运行环境

- 运行时依赖：`ws`（WebSocket 客户端）
- Node.js `>=22`
- 产物为 ESM（`type: module`）

云函数执行依赖宿主侧安装的 `@banyuan/banvasgl`（通过 `@banyuan/banvasgl/flow/server` 子路径加载执行器，不引入图形引擎代码）。

---

## 构建

```bash
pnpm --filter @banyuan/deploy-agent build   # tsup，输出 cli.js + index.js（ESM + d.ts）
pnpm --filter @banyuan/deploy-agent dev     # tsx watch
```

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权，详见仓库根目录。
