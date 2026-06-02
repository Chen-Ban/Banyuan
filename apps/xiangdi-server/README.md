# xiangdi-server — XiangDi AI Agent HTTP 服务

XiangDi HTTP 服务将 `@banyuan/xiangdi-agent` AI Agent 引擎封装为独立的无状态 HTTP 服务，运行在 `:3002`，供 banyan 后端通过 HTTP SSE 调用。

## 架构定位

```
前端(:5174)
    ↓ REST API
banyan 后端(:3001)
    │  POST /ai/run  →  XiangDi 服务(:3002)
    │                        │
    │                        │ ① Pull-based：通过 BanyanClient 反向回调 banyan 后端
    │                        │    /internal/apps/:appId/appJSON|schema|cloud-functions
    │                        │    按需拉取应用数据（不再随请求体传入 appJSON）
    │                        │
    │                        │ ② MasterGraph V2 执行（task 模式）
    │                        │    START → spec → think ↔ tools → ... → END
    │                        │    或 ChatGraph（chat 模式，轻量聊天）
    │                        │
    │                        │ ③ knowledge_search 工具
    │                        ▼
    │                  知识服务(:3003)  /knowledge/search
    │  ←── SSE 事件流 ─────────────────
    │  写入 appJSON to MongoDB
    ↓
前端(:5174) 接收 SSE 事件
```

**核心设计原则**：本服务完全无状态，采用 **Pull-based 架构**。请求体只携带 `appId` 与轻量上下文，Agent 执行时通过内置的 `BanyanClient` 反向调用 banyan 后端的 `/internal/*` 接口按需拉取 `appJSON`、Schema、云函数、物料等数据。写操作产生的最新 `appJSON` 通过 `app_snapshot` 事件实时推送，并随 `done` 事件返回最终结果。本服务不访问 MongoDB，持久化由 banyan 后端负责。

LangGraph 执行状态（checkpoint）由本服务自行持久化（默认 SQLite），用于支持 Human-in-the-Loop 的中断/恢复（interrupt/resume）。

## API

所有 `/ai/*` 路由需要内部认证（见[认证](#认证)），`/health` 除外。

### `GET /health`

健康检查。

**响应**：`200 OK`，`{ "success": true, "message": "XiangDi server is running" }`

---

### `POST /ai/run`

启动 AI Agent，以 SSE 流式返回执行进度。根据 `mode` 路由到不同的 Graph：`task`（默认，完整 MasterGraph V2 管线）或 `chat`（轻量聊天管线，无工具、无知识检索）。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appId` | `string` | 是 | 应用 ID，用于通过 BanyanClient 拉取该应用的 appJSON/schema/物料等数据 |
| `prompt` | `string` | 是 | 用户自然语言指令 |
| `threadId` | `string` | 否 | 线程 ID（LangGraph Checkpointer 持久化用），未提供时自动生成。若提供且该 thread 已存在 checkpoint，返回 `409`（应改用 `/ai/resume`） |
| `previousMessages` | `Array<{ role: 'user' \| 'assistant'; content: string \| ContentBlock[] }>` | 否 | 最近几轮对话消息（由 banyan 后端 ContextBuilder 按 token 预算裁剪后传入），注入 Graph 初始 messages |
| `memoryHint` | `string` | 否 | 历史上下文摘要（Context Summary），注入 `state.contextSummary`，覆盖被压缩的远期历史 |
| `agentMemory` | `string` | 否 | Agent 记忆文本（由 banyan 后端 MemoryService.recall() 生成，含用户偏好），注入 `state.agentMemory` |
| `requireApproval` | `boolean` | 否 | 是否需要人工审批（默认 `false`，即 autoRun 模式）。为 `true` 时启用 Human-in-the-Loop，可能在 `humanGate` 等节点触发 `interrupt` |
| `mode` | `'chat' \| 'task'` | 否 | 对话模式，默认 `task`。`chat` 为轻量聊天（不拉取 appJSON、不注册工具） |
| `images` | `string[]` | 否 | 用户上传的图片 URL 列表（已上传至 OSS），存在时构建多模态消息 |

> 注意：与早期版本不同，请求体**不再接收** `appJSON` 与 `appSchema`。这些数据由 Agent 运行时通过 `BanyanClient` 从 banyan 后端的 `/internal/apps/:appId/*` 接口按需拉取（Pull-based）。

**响应**：`text/event-stream`（SSE）

SSE 连接每 15 秒发送一个 `:ping` 注释帧保持活跃；客户端断开（`res` close）时会触发 `AbortController` 取消 Agent 执行。

| 事件类型 | 数据结构 | 说明 |
|----------|----------|------|
| `text_delta` | `{ text: string }` | LLM 输出的文字片段 |
| `tool_call` | `{ id, name, input }` | 工具调用开始 |
| `tool_result` | `{ id, name, result, isError }` | 工具调用结果 |
| `app_snapshot` | `{ appJSON: string }` | 写操作工具完成后实时推送当前 appJSON |
| `schema_update` | `{ collections }` | AI 调用 schema 写工具后推送新 Schema |
| `disambiguation` | `DisambiguationOptions` | 检测到意图冲突，推送消歧选项（需调用 `/ai/disambiguation-response` 应答） |
| `round_summary` | `{ summary: string }` | 本轮对话总结 |
| `memory_update` | `{ episode, facts }` | Agent 记忆更新 |
| `checkpoint` | `{ threadId, node, step }` | 执行状态已持久化（`step` 为 `interrupted` 或 `completed`） |
| `interrupt` | `{ threadId, node, value }` | 图执行被中断，等待人工介入（需调用 `/ai/resume` 恢复） |
| `done` | `{ appJSON: string, threadId, roundSummary? }` | Agent 执行完成，携带最终 appJSON（chat 模式 appJSON 为空，含 roundSummary） |
| `error` | `{ message: string, code?, service? }` | 发生错误（`code='SERVICE_UNAVAILABLE'` 时携带 `service`） |

**触发写操作 app_snapshot 的工具**：`banvas_create_page`、`banvas_add_node`、`banvas_update_node`、`banvas_delete_node`、`banvas_move_node`、`banvas_resize_node`、`banvas_apply_patch`。

---

### `POST /ai/resume`

从 LangGraph Checkpointer 恢复中断的执行（Human-in-the-Loop 审批后续流程）。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `threadId` | `string` | 是 | 要恢复的 thread ID，必须已存在 checkpoint（否则返回 `404`） |
| `resumeValue` | `unknown` | 否 | 用户对 `interrupt` 的响应值（如 `{ approved: true }`），通过 `Command({ resume })` 传入 |
| `appJSON` | `string` | 否 | 当前最新的 appJSON 数据（由 banyan 后端从 MongoDB 读取后传入），确保 adapter 以最新状态恢复 |

**响应**：`text/event-stream`（SSE，事件类型同 `/ai/run`）

恢复时会先发送一个 `resumed` 事件：`{ fromNode, step }`。若恢复后再次被中断（如多步 humanGate），会再次发送 `interrupt`。

---

### `GET /ai/thread/:threadId/status`

查询指定 thread 的当前执行状态。

**响应**：`200 OK`

| 字段 | 类型 | 说明 |
|------|------|------|
| `threadId` | `string` | thread ID |
| `status` | `'not_found' \| 'running' \| 'interrupted' \| 'completed'` | 当前状态 |
| `currentNode` | `string` | 当前/下一个待执行节点（running/interrupted 时） |
| `interrupt` | `{ node, value }` | 中断详情（interrupted 时） |
| `lastCheckpointAt` | `string \| null` | 最近一次 checkpoint 时间 |

---

### `DELETE /ai/thread/:threadId`

请求删除指定 thread 的 checkpoint 数据。

**响应**：`204 No Content`（幂等操作）

> 当前 `SqliteSaver` 未提供官方 delete thread API，过期 thread 由 CheckpointStore 的 TTL 定时清理负责，本端点返回 204 表示接受请求。

---

### `POST /ai/disambiguation-response`

前端用户选择消歧方案后调用，resolve 挂起的 Agent 消歧 Promise。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `threadId` | `string` | 是 | 对应 `disambiguation` 事件的 thread ID（按 threadId 隔离 pending，支持并发） |
| `choiceId` | `string` | 是 | 用户选择的方案 ID |

**响应**：`{ "success": boolean, "error"?: string }`（无挂起消歧时返回 `404`）

---

### `GET /ai/models`

返回所有已注册 LLM provider 的信息及当前激活状态。

**响应**：

```json
{
  "providers": [
    { "provider": "deepseek", "model": "deepseek-v4-pro", "availableModels": ["deepseek-v4-pro", "deepseek-v4-flash"], "active": true },
    { "provider": "kimi", "model": "kimi-k2.6", "availableModels": ["kimi-k2.6"], "active": false }
  ],
  "activeProvider": "deepseek"
}
```

---

### `POST /ai/models/switch`

运行时切换激活的 LLM provider（在 DeepSeek 和 Kimi 之间切换）。

**请求体**：`{ "provider": string }`（可选值见 `GET /ai/models` 返回的 `providers[].provider`）

**响应**：

- 成功：`{ "success": true, "activeProvider": string }`
- 失败：`{ "success": false, "error": string }`（未知 provider 返回 `400`，切换失败返回 `500`）

---

## 认证

除 `/health` 外，所有路由都经过 `internalAuth` 中间件校验请求头 `X-Internal-Token`：

- 未配置 `XIANGDI_INTERNAL_TOKEN`：开发模式（`NODE_ENV !== 'production'`）跳过认证并打印警告；生产模式拒绝所有请求（`503`）。
- 已配置：请求头 `X-Internal-Token` 必须与之相等，否则返回 `401`。

banyan 后端代理请求时需注入相同的 token。

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10.10
- DeepSeek API Key（或 Kimi API Key）

### API Key 配置

优先通过环境变量注入（推荐）：`DEEPSEEK_API_KEY` / `KIMI_API_KEY`。

本地开发也可在 `apps/xiangdi-server/src/` 目录下创建 `apiKey.json`（已在 `.gitignore` 中），字段名按 provider 区分：

```json
{
  "deepseekApiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
  "kimiApiKey": "sk-yyyyyyyyyyyyyyyyyyyyyyyy"
}
```

> 兼容旧字段：DeepSeek 还会回退读取 `apiKey`、`key` 字段。环境变量优先级高于文件。

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

# 启动 XiangDi 服务（tsx watch 热重载）
pnpm --filter xiangdi-server dev
```

服务启动后监听 `http://localhost:3002`，并初始化 CheckpointStore（含 TTL 清理定时任务）。

### 构建与生产启动

```bash
# 构建（tsc 编译到 dist/）
pnpm --filter xiangdi-server build

# 生产启动
pnpm --filter xiangdi-server start
```

### 知识种子（可选）

```bash
# 向 knowledge-server 灌入知识种子
pnpm --filter xiangdi-server seed
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Koa | ^2.15 | HTTP 框架 |
| @koa/router | ^13.1 | 路由 |
| @koa/cors | ^5.0 | 跨域支持 |
| koa-body | ^6.0 | 请求体解析（jsonLimit 20mb，兼容大体积上下文） |
| @langchain/core | ^0.3 | LangChain 消息类型（HumanMessage/AIMessage 等） |
| @langchain/langgraph | ^0.2 | StateGraph / Command / Checkpointer 抽象 |
| @langchain/langgraph-checkpoint-sqlite | ^0.1 | SqliteSaver checkpoint 持久化 |
| @banyuan/xiangdi-agent | workspace:* | AI Agent 引擎（MasterGraph/ChatGraph/工具/LLM 客户端） |
| @banyuan/banvasgl | workspace:* | 2D 图形引擎（用于 Schema 转换） |
| tsx | ^4.19 | TypeScript 直接运行（开发模式） |
| typescript | ~5.7 | 类型与编译 |

## 目录结构

```
src/
├── server.ts                    # 入口（监听端口、CheckpointStore 启动、Graceful Shutdown）
├── app.ts                       # Koa 应用实例（中间件 + 路由注册）
├── errors.ts                    # 自定义错误（ServiceUnavailableError 等）
├── logger.ts                    # 结构化日志（含 createRequestLogger）
├── apiKey.json                  # 本地 API Key（gitignore，可选）
├── banyan/                      # Banyan 后端反向调用（Pull-based 数据获取）
│   ├── BanyanClient.ts          #   内部 API 客户端（appJSON/schema/cloud-functions/materials）
│   ├── DataFetchTools.ts        #   注册数据拉取工具（registerDataFetchTools）
│   ├── RemoteMaterialStore.ts   #   远程物料库（供物料工具使用）
│   └── index.ts                 #   barrel 导出
├── knowledge/
│   └── RemoteKnowledgeStore.ts  # 远程 KnowledgeStore，HTTP 调用 knowledge-server(:3003) /knowledge/search
├── llm/
│   └── createLLMClient.ts       # LLMRouter 工厂（DeepSeek 主 + Kimi 备，健康检测、运行时切换、PROVIDER_CATALOG）
├── checkpoint/
│   ├── types.ts                 #   CheckpointStore 抽象接口 + 默认清理配置
│   ├── index.ts                 #   工厂 + 全局单例 getStore()（按 CHECKPOINT_BACKEND 选择实现）
│   ├── SqliteCheckpointStore.ts #   SqliteSaver 实现（默认，含 TTL 清理）
│   └── MemoryCheckpointStore.ts #   内存实现（CHECKPOINT_BACKEND=memory）
├── middleware/
│   ├── auth.ts                  # 内部服务认证中间件（X-Internal-Token）
│   ├── errorHandler.ts          # 全局错误处理
│   └── logger.ts                # 请求日志
├── utils/
│   └── loadApiKey.ts            # 按 provider 加载 API Key（env > apiKey.json）
└── routes/
    ├── index.ts                 # 路由聚合（healthRouter + aiRouter）
    └── ai.ts                    # /ai/run|resume、/ai/thread/:id/status|（DELETE）、
                                 #   /ai/disambiguation-response、/ai/models|/ai/models/switch
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3002` |
| `NODE_ENV` | 运行环境，`production` 时强制要求认证 token | — |
| `XIANGDI_INTERNAL_TOKEN` | 本服务的内部认证密钥（校验 `X-Internal-Token`），生产必填 | — |
| `LLM_PROVIDER` | 初始激活的 LLM provider（`deepseek` / `kimi`） | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（优先级高于 `apiKey.json`） | — |
| `DEEPSEEK_MODEL` | DeepSeek 模型名 | `deepseek-v4-pro` |
| `DEEPSEEK_BASE_URL` | DeepSeek API 基础 URL | `https://api.deepseek.com` |
| `KIMI_API_KEY` | Kimi API Key（优先级高于 `apiKey.json` 的 `kimiApiKey`） | — |
| `KIMI_MODEL` | Kimi 模型名 | `kimi-k2.6` |
| `KIMI_BASE_URL` | Kimi API 基础 URL | `https://api.moonshot.ai/v1` |
| `LLM_HIGH_LATENCY_MS` | LLMRouter 高延迟阈值（ms） | `60000` |
| `LLM_CONSECUTIVE_FAIL_THRESHOLD` | LLMRouter 连续失败触发信号阈值 | `3` |
| `BANYAN_URL` | banyan 后端地址（BanyanClient 反向调用 `/internal/*`） | `http://localhost:3001` |
| `INTERNAL_API_TOKEN` | 调用 banyan 后端 `/internal/*` 时携带的 token | `__dev_internal_token__` |
| `KNOWLEDGE_URL` | knowledge-server 地址 | `http://localhost:3003` |
| `KNOWLEDGE_INTERNAL_TOKEN` | 知识服务内部认证 token | — |
| `CHECKPOINT_BACKEND` | checkpoint 存储后端（`sqlite` / `memory`） | `sqlite` |
| `CHECKPOINT_DB_PATH` | SQLite 模式下的 db 文件路径 | `./data/checkpoints.db` |

## Checkpoint 持久化

LangGraph 执行状态通过统一的 `CheckpointStore` 抽象持久化，由 `getStore()` 全局单例管理：

- **SqliteCheckpointStore**（默认）：基于 `@langchain/langgraph-checkpoint-sqlite` 的 `SqliteSaver`，额外维护 `thread_activity` 表记录每个 thread 的活跃状态（running / completed / interrupted），并按 TTL 定时清理过期 thread（completed 默认 1 小时、interrupted/running 默认 24 小时、清理间隔 10 分钟）。
- **MemoryCheckpointStore**：内存实现，设置 `CHECKPOINT_BACKEND=memory` 启用，进程重启即丢失，适合无状态/临时场景。

`server.ts` 在监听成功后调用 `store.start()` 启动清理定时任务，并在 Graceful Shutdown（SIGTERM/SIGINT）时调用 `store.stop()` 释放资源。

## 与 Monorepo 其他包的关系

- **@banyuan/xiangdi-agent**（`packages/xiangdi-agent`）：AI Agent 引擎，本服务是其 HTTP 宿主，通过 `createMasterGraph()` / `createChatGraph()` 驱动执行，并复用其工具注册（`createBanvasToolRegistry`、`registerKnowledgeSearchTool`、`registerSchemaTools`、`registerMaterialTools`）与 LLM 客户端（`LLMRouter`/`DeepSeekClient`/`KimiClient`）。
- **@banyuan/banvasgl**（`packages/banvasgl`）：2D 图形引擎，用于 AISchema ↔ BanvasGL 双向转换。
- **banyan 后端**（`apps/banyan/backend`）：主要调用方，通过 `XIANGDI_URL` 环境变量（默认 `http://localhost:3002`）访问本服务。本服务反向通过 `BanyanClient`（`BANYAN_URL`，默认 `http://localhost:3001`）调用其 `/internal/*` 与 `/api/materials/*` 接口按需拉取数据；本服务不直接访问 MongoDB，业务数据持久化完全由 banyan 后端负责。
- **knowledge-server**（`apps/knowledge-server`）：知识微服务，本服务通过 `RemoteKnowledgeStore` 调用其 `/knowledge/search` 端点，为 `knowledge_search` 工具提供检索能力；知识服务不可用时降级返回空结果（非致命）。
