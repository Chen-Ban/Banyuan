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
└────────────────┬──────────────────┘
                 │ extends
┌────────────────▼──────────────────┐
│  C5 PreviewServer hotUpdate       │
│     下推协议（IPC 单向推送）       │
└───────────────────────────────────┘

        C1 ←complements→ C2
        C2 → C5（IPC 基座扩展 PreviewServer 下推通道）
```

关系说明：

- C1→C3：服务间通信协议确立了多服务 HTTP 互联的模式，环境变量配置协议解决了「各服务如何发现彼此地址」的问题，是通信协议落地的必要配套
- C1⇄C2：服务间通信协议覆盖后端服务互联，Electron IPC 协议覆盖桌面端前后进程通信，二者互补构成应用层完整的通信协议体系
- C2→C5：C2 定义了 IPC 通道基础规范（contextBridge + 命名格式 + Promise 返回），C5 在此基座上定义前端向 PreviewServer 下推预览数据的单向推送协议

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

- 服务地址类：{SERVICE}\_URL（如 XIANGDI_URL、KNOWLEDGE_URL）
- 认证类：{SERVICE}\_TOKEN 或 {SERVICE}\_KEY
- 端口类：PORT 或 {SERVICE}\_PORT
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

> **本地预览模式例外（app/A5）：** 上述约束描述的是 **ECS 远程部署模式**。app/A5 引入的「预览态本地后端」复用的是 deploy-agent 的 `scaffoldServer` 构建能力，但运行形态不同——它在开发者本地直接起服务并连**本地 Mongo**（仅用于预览验证，非真实业务库），不走 WebSocket 反向管控、不经租户 ECS。即「不持有业务库连接」仅约束 ECS 远程模式；本地预览模式连本地 Mongo 是 A5 的显式设计。

---

## PreviewServer 通信协议

### C5. PreviewServer hotUpdate 下推协议——IPC 单向推送

**未实施** · 扩展 C2，配合 app/A6 + app/M6

定义前端（Electron renderer 进程）向 PreviewServer（Electron main 进程）单向推送预览执行数据的 IPC 消息协议。PreviewServer 作为下游只读消费者（A6），不参与持久化链路，只接收 collections + cloudFunctions 用于刷新服务端 FlowRunner 的可执行态。

**核心问题背景：** A6 确立了 PreviewServer 的定位——纯后端执行环境、非元数据代理。它不持有 appJSON、不做持久化、不维护 savedSnapshot/workingState。前端在任何持久化成功后（save / AI done 写库 / 集合 CRUD / 云函数 CRUD），通过本协议将最新 collections + cloudFunctions 推送给 PreviewServer，触发其 hotUpdate 刷新 mongoose model 注册和 ServerFlowRunner 执行器映射。C2 定义了 IPC 基础规范（contextBridge + 命名格式 + Promise），C5 在其上定义唯一的下推消息。

**IPC Channel 命名规则：**

- 命名格式：`preview:{action}`（当前所有 preview IPC 统一使用此前缀，未来 C2 实施时可迁移到 `bridge:preview:{action}`）
- 下推方法返回 Promise（Renderer → Main，等待 Main 确认热更新完成）
- preload 脚本只暴露白名单内的 API

**消息族定义：**

- `preview:hotUpdate` — 热更新推送：前端在持久化成功后调用，将最新 collections + cloudFunctions 推送给 PreviewServer，PreviewServer 接收后刷新 mongoose model 和 ServerFlowRunner 执行器映射，返回 ack

**触发时机（均在 banyan 后端持久化确认后）：**

- 用户手动保存成功后（Ctrl+S → HTTP PUT → 200 → hotUpdate）
- AI 对话 done 事件后 banyan 后端写库成功，前端拉取最新数据后推送
- 集合 CRUD 操作持久化到 banyan 后端成功后推送
- 云函数 CRUD 操作持久化到 banyan 后端成功后推送

**数据结构：**

```typescript
// preview:hotUpdate IPC 参数（preload 层传递）
// 前端辅助函数 hotUpdatePreview() 不需要调用方传 appId（从 store 自取），
// 但 preload→main IPC 层仍携带 appId 做路由（Orchestrator 单例管理多 app 实例）
ipcRenderer.invoke('preview:hotUpdate', appId, patch)

interface HotUpdatePatch {
  collections?: CollectionDef[] // 全量——当前应用的所有集合 schema
  cloudFunctions?: CloudFunctionDef[] // 全量——当前应用的所有云函数定义
}

// preview:hotUpdate 返回值（void，失败时 reject）
// Orchestrator 内部处理文件写入 + 可能的进程重启
```

**约束：**

- 唯一的 hotUpdate IPC channel 为 `preview:hotUpdate`，不存在 load / save / rollback 等反向通道
- PreviewServer 不发起任何向 banyan 后端的 HTTP 请求（只读消费者，数据来源为前端 IPC 推送）
- 推送的 collections 和 cloudFunctions 均为全量快照（非增量 diff），PreviewServer 收到后整体替换当前可执行态
- appJSON 不通过此协议推送（A6 约束：PreviewServer 不持有页面数据）
- preload 中注册到 `window.electronAPI.preview` 命名空间
- 前端非 Electron 环境时 `window.electronAPI.preview` 为 undefined，静默跳过推送（无 PreviewServer 可接收）
- 前端 hotUpdatePreview() 辅助函数从 store 自取当前 appId，调用方无需显式传入（PreviewServer 生命周期与应用页一致，天然单应用）

**反例：**

- PreviewServer 主动从 banyan 后端拉取数据——违反只读消费者定位，引入额外网络依赖和数据源分叉
- 使用增量 diff 而非全量推送——增加 PreviewServer 状态管理复杂度，全量替换更简单可靠（collections / cloudFunctions 数据量有限）
- 为 collections 和 cloudFunctions 设计独立的推送 channel——增加复杂度，统一 hotUpdate 一次推送、一次刷新更内聚
- 推送 appJSON——PreviewServer 不需要页面布局数据，ServerFlowRunner 只关心数据表和云函数

**实施方案：** `docs/specs/app/metadata-dataflow.md`（应用元数据数据流：前端 store 设计、持久化链路、PreviewServer hotUpdate 下推机制）
