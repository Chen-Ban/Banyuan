# App · 协议级决策

> 模块间怎么通信——Banyan 应用层的服务间通信协议与平台接口。

---

## 服务间通信协议

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

## Electron IPC 协议

**未实施**

Electron main 进程与 renderer 进程通过 contextBridge 暴露的类型安全 API 通信。每个 Bridge 方法对应一个 IPC channel，命名规则为 bridge:{domain}:{action}。

**决策链：** Electron 要求 renderer 进程不能直接访问 Node.js -> contextBridge 是安全通道 -> 类型安全的 API 定义确保两端契约一致 -> 命名规范方便排查和管理。

**约束：**

- preload 脚本只暴露白名单内的 API，不暴露 require 或 electron 全量对象
- IPC channel 命名格式：bridge:{domain}:{action}（如 bridge:fs:readFile）
- 所有 Bridge API 返回 Promise（即使底层是同步操作）
- Bridge 接口定义文件同时供 main 和 renderer 共享类型

---

## 环境变量配置协议

**✅ 已实施**

各服务通过环境变量配置运行参数，遵循统一命名规范。敏感信息（API Key、Token）禁止硬编码。

**决策链：** 多服务需要知道彼此地址 -> 硬编码不灵活 -> 环境变量是 12-factor app 标准方式 -> 统一命名规范降低记忆负担。

**约束：**

- 服务地址类：{SERVICE}_URL（如 XIANGDI_URL、KNOWLEDGE_URL）
- 认证类：{SERVICE}_TOKEN 或 {SERVICE}_KEY
- 端口类：PORT 或 {SERVICE}_PORT
- MongoDB：MONGODB_URI
- 所有服务提供合理默认值（localhost + 默认端口）
- .env 文件不入 Git，.env.example 入 Git 作为模板
