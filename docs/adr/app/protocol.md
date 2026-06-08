# App · 协议级决策

> 模块间怎么通信——Banyan 应用层的服务间通信协议与平台接口。

---

## 决策依赖图

```
┌───────────────────────────────────┐
│  C1 服务间通信协议                 │
│  （HTTP/JSON + SSE）              │
└────────────────┬──────────────────┘
                 │ enables
┌────────────────▼──────────────────┐
│  C3 环境变量配置协议               │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  C2 Electron IPC 协议             │
└───────────────────────────────────┘

        C1 ←complements→ C2
```

关系说明：

- C1→C3：服务间通信协议确立了多服务 HTTP 互联的模式，环境变量配置协议解决了「各服务如何发现彼此地址」的问题，是通信协议落地的必要配套
- C1⇄C2：服务间通信协议覆盖后端服务互联，Electron IPC 协议覆盖桌面端前后进程通信，二者互补构成应用层完整的通信协议体系

---

## 后端通信协议

### C1. 服务间通信协议

**✅ 已实施**

服务间通信统一使用 HTTP/JSON。AI 请求链路使用 SSE（Server-Sent Events）流式传输。所有请求携带 X-Request-Id header 做链路追踪。

**决策链：** 三个服务都是 Node.js + Koa -> HTTP/JSON 是最自然的选择 -> AI 推理耗时长需要流式反馈 -> SSE 比 WebSocket 更轻量（单向流即可）-> X-Request-Id 为未来可观测性预留。

**约束：**

- 请求体 Content-Type: application/json
- SSE 响应 Content-Type: text/event-stream
- 每个 SSE event 格式：event: {type}\ndata: {json}\n\n
- event type 枚举：delta（增量变更）、done（完成）、error（错误）
- 超时设置：AI 请求 120s，知识检索 10s

---

### C3. 环境变量配置协议

**✅ 已实施** · 依赖 C1

各服务通过环境变量配置运行参数，遵循统一命名规范。敏感信息（API Key、Token）禁止硬编码。

**决策链：** 多服务需要知道彼此地址 -> 硬编码不灵活 -> 环境变量是 12-factor app 标准方式 -> 统一命名规范降低记忆负担。

**约束：**

- 服务地址类：{SERVICE}_URL（如 XIANGDI_URL、KNOWLEDGE_URL）
- 认证类：{SERVICE}_TOKEN 或 {SERVICE}_KEY
- 端口类：PORT 或 {SERVICE}_PORT
- MongoDB：MONGODB_URI
- 所有服务提供合理默认值（localhost + 默认端口）
- .env 文件不入 Git，.env.example 入 Git 作为模板

---

## 桌面端通信协议

### C2. Electron IPC 协议

**未实施**

Electron main 进程与 renderer 进程通过 contextBridge 暴露的类型安全 API 通信。每个 Bridge 方法对应一个 IPC channel，命名规则为 bridge:{domain}:{action}。

**决策链：** Electron 要求 renderer 进程不能直接访问 Node.js -> contextBridge 是安全通道 -> 类型安全的 API 定义确保两端契约一致 -> 命名规范方便排查和管理。

**约束：**

- preload 脚本只暴露白名单内的 API，不暴露 require 或 electron 全量对象
- IPC channel 命名格式：bridge:{domain}:{action}（如 bridge:fs:readFile）
- 所有 Bridge API 返回 Promise（即使底层是同步操作）
- Bridge 接口定义文件同时供 main 和 renderer 共享类型

---

## 部署管控协议

### C4. deploy-agent WebSocket 管控协议

**未实施**

deploy-agent（租户 ECS 上的守护进程）通过 WebSocket 长连接主动连接 Banyan 后端（`/ws/agent`），实现反向管控——平台后端不需要知道租户服务器 IP，也不需要租户暴露任何端口。

**为什么反向连接：** 租户 ECS 在云端，暴露管理端口有安全风险。Agent 主动外连（outbound WebSocket）是业界通用模式（类似 GitHub Actions runner、Cloudflare Tunnel），既安全又穿透 NAT/防火墙。

**决策链：** 需要平台控制租户服务器行为（构建/部署/回滚）-> 传统 SSH 需要暴露端口 + 维护密钥 -> WebSocket 长连接由 agent 主动建立 -> 认证通过 agentToken（注册时生成）-> 后端 AgentGateway 管理所有 agent 连接。

**消息协议（双向）：**

- 下行（后端→agent）：`deploy:start`（携带 appJSON + appSlug）、`deploy:rollback`（指定版本号）、`health:ping`
- 上行（agent→后端）：`deploy:progress`（实时进度）、`deploy:result`（成功/失败 + URL）、`health:pong`

**约束：**

- agent 启动时通过 agentToken 认证，token 存储在 systemd 服务环境变量中
- 断线自动重连（指数退避）
- 一个租户对应一个 agent 长连接，后端通过 tenantId 路由消息
- agent 不持有任何业务数据库连接，只做构建和部署操作
