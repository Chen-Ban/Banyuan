# xiangdi-server — XiangDi AI Agent HTTP 服务

XiangDi HTTP 服务将 `@banyuan/xiangdi-agent` AI Agent 引擎封装为独立的无状态 HTTP 服务，运行在 `:3002`，供 banyan 后端通过 HTTP SSE 调用。

## 架构定位

```
前端(:5174)
    ↓ REST API
banyan 后端(:3001)
    │  读取 appJSON from MongoDB
    │  POST /ai/run  →  XiangDi 服务(:3002)
    │                        │ MasterGraph V2 执行
    │                        │   plan → humanGate → execute
    │                        │   → assemble → audit → summarize
    │                        │   → extractMemory
    │                        │
    │                        │ knowledge_search 工具
    │                        ▼
    │                  知识服务(:3003)
    │  ←── SSE 事件流 ─────────────────
    │  写入 appJSON to MongoDB
    ↓
前端(:5174) 接收 SSE 事件
```

**核心设计原则**：本服务完全无状态。`appJSON`（BanvasGL App 级别序列化字符串）随请求传入，Agent 执行完毕后最终 `appJSON` 随 `done` 事件返回。本服务不访问 MongoDB，持久化由 banyan 后端负责。

## API

### `GET /health`

健康检查。

**响应**：`200 OK`，`{ status: "ok" }`

---

### `POST /ai/run`

启动 AI Agent（MasterGraph V2），以 SSE 流式返回执行进度。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appId` | `string` | 否 | 应用 ID（仅用于日志标识） |
| `prompt` | `string` | 是 | 用户自然语言指令 |
| `appJSON` | `string` | 是 | BanvasGL App.serialize() 输出的 App 级别序列化字符串 |
| `threadId` | `string` | 否 | 线程 ID（LangGraph Checkpointer 用于持久化），未提供时自动生成 |
| `previousMessages` | `Message[]` | 否 | 最近几轮对话消息（L4，由 banyan 后端 ContextBuilder 裁剪后传入） |
| `memoryHint` | `string` | 否 | 锚定摘要（L3，由 banyan 后端 ContextBuilder 生成，覆盖被压缩的远期历史） |
| `appSchema` | `SchemaCollectionDef[]` | 否 | 当前应用 Schema 定义，注册 Schema 工具时使用 |
| `requireApproval` | `boolean` | 否 | 是否需要人工审批（默认 false 即 autoRun 模式），为 true 时启用 Human-in-the-Loop |

**响应**：`text/event-stream`（SSE）

| 事件类型 | 数据结构 | 说明 |
|----------|----------|------|
| `text_delta` | `{ text: string }` | LLM 输出的文字片段 |
| `tool_call` | `{ id, name, input }` | 工具调用开始 |
| `tool_result` | `{ id, name, result, isError }` | 工具调用结果 |
| `app_snapshot` | `{ appJSON: string }` | 写操作完成后实时推送当前 appJSON |
| `schema_update` | `{ collections }` | AI 调用 schema_set_collections 后推送新 Schema |
| `disambiguation` | `DisambiguationOptions` | 检测到意图冲突，推送消歧选项 |
| `round_summary` | `{ summary: string }` | 本轮对话总结 |
| `memory_update` | `{ episode, facts }` | Agent 记忆更新 |
| `checkpoint` | `{ threadId, node, step }` | 执行状态已持久化 |
| `interrupt` | `{ threadId, node, value }` | 图执行被中断，等待人工介入 |
| `done` | `{ appJSON: string, threadId }` | Agent 执行完成，携带最终 appJSON |
| `error` | `{ message: string }` | 发生错误 |

---

### `POST /ai/resume`

从 LangGraph Checkpointer 恢复中断的执行（Human-in-the-Loop 审批后续流程）。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `threadId` | `string` | 是 | 要恢复的 thread ID |
| `resumeValue` | `unknown` | 否 | 用户对 interrupt 的响应值（如 `{ approved: true }`） |
| `appJSON` | `string` | 否 | 当前最新的 appJSON 数据（由 banyan 后端从 MongoDB 读取后传入） |

**响应**：`text/event-stream`（SSE，同 `/ai/run`）

---

### `POST /ai/disambiguation-response`

前端用户选择消歧方案后调用，resolve 挂起的 Agent 消歧 Promise。

**请求体**：`{ "choiceId": string }`

**响应**：`{ "success": boolean }`

---

### `GET /ai/models`

返回所有已注册 LLM provider 的信息及当前激活状态。

**响应**：`{ "providers": ModelInfo[], "activeProvider": string }`

---

### `POST /ai/models/switch`

运行时切换激活的 LLM provider（在 DeepSeek 和 Kimi 之间切换）。

**请求体**：`{ "provider": string }`（可选值见 `GET /ai/models`）

**响应**：`{ "success": boolean, "activeProvider"?: string }`

---

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10.10
- DeepSeek API Key（或 Kimi API Key）

### API Key 配置

在 `apps/xiangdi/` 目录下创建 `apiKey.json`（已在 `.gitignore` 中）：

```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

也可通过环境变量 `DEEPSEEK_API_KEY` 注入，优先级高于文件。

### 启动

**推荐**：通过根目录命令一键启动完整平台（含 XiangDi 服务）：

```bash
# 在 monorepo 根目录
pnpm dev:banyan
```

此命令会同时启动 BanvasGL watch + XiangDi 引擎 watch + XiangDi 服务(:3002) + Banyan 全栈。

**单独启动**（仅调试 XiangDi 服务本身时使用）：

```bash
# 先确保引擎包已构建
pnpm --filter @banyuan/banvasgl build && pnpm --filter @banyuan/xiangdi-agent build

# 启动 XiangDi 服务
pnpm --filter xiangdi-server dev
```

服务启动后监听 `http://localhost:3002`。

### 构建与生产启动

```bash
# 构建
pnpm --filter xiangdi-server build

# 生产启动
pnpm --filter xiangdi-server start
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Koa | ^2.15 | HTTP 框架 |
| @koa/router | ^13.1 | 路由 |
| @koa/cors | ^5.0 | 跨域支持 |
| koa-body | ^6.0 | 请求体解析 |
| @banyuan/xiangdi-agent | workspace:* | AI Agent 引擎 |
| @banyuan/banvasgl | workspace:* | 2D 图形引擎（用于 Schema 转换） |
| tsx | ^4.19 | TypeScript 直接运行（开发模式） |

## 目录结构

```
src/
├── app.ts              # Koa 应用实例（中间件 + 路由注册）
├── server.ts           # 入口（监听端口）
├── knowledge/
│   └── RemoteKnowledgeStore.ts  # 远程 KnowledgeStore，通过 HTTP 调用 knowledge-server(:3003)
├── llm/
│   └── createLLMClient.ts  # LLM 客户端工厂（DeepSeek/Kimi 自动选择，LLMRouter 健康检测）
├── middleware/
│   ├── auth.ts         # 内部服务认证中间件
│   ├── errorHandler.ts # 全局错误处理
│   └── logger.ts       # 请求日志
├── checkpoint/
│   └── index.ts       # SqliteSaver checkpointer 工厂（LangGraph 持久化）
└── routes/
    ├── index.ts        # 路由聚合（health + ai）
    ├── health.ts       # GET /health
    └── ai.ts           # POST /ai/run|summarize|resume、GET /ai/models 等（SSE + REST）
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3002` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（优先级高于 `apiKey.json` 文件） | — |
| `KIMI_API_KEY` | Kimi API Key | — |
| `DEEPSEEK_MODEL` | DeepSeek 模型名 | `deepseek-v4-pro` |
| `KIMI_MODEL` | Kimi 模型名 | `kimi-k2.6` |
| `KNOWLEDGE_URL` | knowledge-server 地址 | `http://localhost:3003` |
| `KNOWLEDGE_INTERNAL_TOKEN` | 知识服务内部认证 token | — |

## 与 Monorepo 其他包的关系

- **@banyuan/xiangdi-agent**（`packages/xiangdi-agent`）：AI Agent 引擎，本服务是其 HTTP 宿主，通过 `createMasterGraph()` 驱动执行
- **@banyuan/banvasgl**（`packages/banvasgl`）：2D 图形引擎，用于 AISchema ↔ BanvasGL 双向转换
- **banyan 后端**（`apps/banyan/backend`）：主要调用方，通过 `XIANGDI_URL` 环境变量（默认 `http://localhost:3002`）访问本服务；本服务不直接访问 MongoDB，持久化完全由 banyan 后端负责
- **knowledge-server**（`apps/knowledge-server`）：知识微服务，本服务通过 `RemoteKnowledgeStore` 调用 `/knowledge/search` 端点，为 `knowledge_search` 工具提供检索能力
