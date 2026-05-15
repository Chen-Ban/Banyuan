# @banyuan/xiangdi-server — XiangDi AI Agent HTTP 服务

XiangDi HTTP 服务将 `xiangdi` AI Agent 引擎封装为独立的无状态 HTTP 服务，运行在 `:3002`，供 banyan 后端通过 HTTP SSE 调用。

## 架构定位

```
前端(:5173)
    ↓ REST API
banyan 后端(:3001)
    │  读取 pages from MongoDB
    │  POST /ai/run  →  XiangDi 服务(:3002)
    │                        │ AgentLoop 执行
    │  ←── SSE 事件流 ────────┘
    │  写入 pages to MongoDB
    ↓
前端(:5173) 接收 SSE 事件
```

**核心设计原则**：本服务完全无状态。`pages`（BanvasGL 序列化的页面 JSON 数组）随请求传入，Agent 执行完毕后最终 `pages` 随 `done` 事件返回。本服务不访问 MongoDB，持久化由 banyan 后端负责。

## API

### `GET /health`

健康检查。

**响应**：`200 OK`，`{ status: "ok" }`

---

### `POST /ai/run`

启动 AI Agent，以 SSE 流式返回执行进度。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appId` | `string` | 否 | 应用 ID（仅用于日志标识） |
| `prompt` | `string` | 是 | 用户自然语言指令 |
| `pages` | `string[]` | 是 | BanvasGL Serializer 序列化的页面 JSON 数组 |

**响应**：`text/event-stream`（SSE）

| 事件类型 | 数据结构 | 说明 |
|----------|----------|------|
| `text_delta` | `{ text: string }` | LLM 输出的文字片段 |
| `tool_call` | `{ id, name, input }` | 工具调用开始 |
| `tool_result` | `{ id, result, isError }` | 工具调用结果 |
| `done` | `{ pages: string[] }` | Agent 执行完成，携带最终 pages |
| `error` | `{ message: string }` | 发生错误 |

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10.10
- DeepSeek API Key（放置于 `apiKey.json`，格式见下方）

### API Key 配置

在 `apps/xiangdi/` 目录下创建 `apiKey.json`（已在 `.gitignore` 中）：

```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### 安装依赖

在 monorepo 根目录执行：

```bash
pnpm install
```

### 启动开发服务器

```bash
# 在 monorepo 根目录
pnpm --filter @banyuan/xiangdi-server dev
```

服务启动后监听 `http://localhost:3002`。

### 构建

```bash
pnpm --filter @banyuan/xiangdi-server build
```

### 生产启动

```bash
pnpm --filter @banyuan/xiangdi-server start
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Koa | ^2.15 | HTTP 框架 |
| @koa/router | ^13.1 | 路由 |
| @koa/cors | ^5.0 | 跨域支持 |
| koa-body | ^6.0 | 请求体解析 |
| xiangdi | workspace:* | AI Agent 引擎 |
| tsx | ^4.19 | TypeScript 直接运行（开发模式） |

## 目录结构

```
src/
├── app.ts              # Koa 应用实例（中间件 + 路由注册）
├── server.ts           # 入口（监听端口）
├── middleware/
│   ├── errorHandler.ts # 全局错误处理
│   └── logger.ts       # 请求日志
└── routes/
    ├── index.ts        # 路由聚合（health + ai）
    ├── health.ts       # GET /health
    └── ai.ts           # POST /ai/run（SSE）
```

## 与 Monorepo 其他包的关系

- **xiangdi**（`packages/XiangDi`）：AI Agent 引擎，本服务是其 HTTP 宿主
- **banyan 后端**（`apps/banyan/backend`）：唯一调用方，通过 `XIANGDI_URL` 环境变量（默认 `http://localhost:3002`）访问本服务
- **MongoDB**：本服务不直接访问，持久化完全由 banyan 后端负责
