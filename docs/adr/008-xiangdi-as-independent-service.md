# ADR-008：XiangDi 独立服务化 + packages/server 归并

**状态**：已采纳  
**决策日期**：2026-05-15  
**决策者**：陈班

---

## 背景

### 问题一：XiangDi 被 banyan 后端直接 import

在将 XiangDi 接入 Banyan 的初版实现中，`apps/banyan/backend` 直接 `import { AgentLoop, DeepSeekClient, ... } from 'xiangdi'`，在同一个 Node.js 进程内运行 AI Agent。

这带来以下问题：

1. **API Key 管理混乱**：DeepSeek API Key 需要在 banyan 后端进程中加载，而 banyan 后端本质上是一个面向用户的业务服务，不应持有 LLM 凭证。
2. **进程耦合**：AI Agent 运行时（LanceDB 向量库、HuggingFace 模型、AgentLoop 循环）与业务 CRUD 服务共享同一进程，任一崩溃会拖垮另一方。
3. **扩展性差**：未来若需要多实例部署 AI 服务（负载均衡、GPU 节点），无法独立扩缩容。
4. **违反包边界**：`packages/` 下的库包被应用层直接 import 运行时逻辑，而非通过公共 API 消费，违反了 monorepo 的依赖方向约定。

### 问题二：packages/server 与 apps/banyan/backend 端口冲突

`packages/server`（构建/预览服务）和 `apps/banyan/backend`（应用 CRUD 服务）都监听 `localhost:3001`，前端 Vite proxy 将 `/api` 统一转发到 3001。两个服务实际上无法同时运行，说明它们本应是同一个服务。

`packages/server` 的职责（Electron 构建任务、应用预览 HTML 生成）是 Banyan 平台功能的一部分，放在 `packages/` 下是历史遗留，缺乏独立发布的必要性。

---

## 决策

### 决策一：XiangDi 独立为服务端进程，通过 HTTP/SSE 对外提供服务

将 XiangDi 的运行时能力封装为一个独立的 HTTP 服务，入口为 `packages/server/src/xiangdi/`（复用已有的 `packages/server` 基础设施），对外暴露以下接口：

```
POST /api/xiangdi/chat
  Body:  { appId: string, prompt: string, pages: string[], appMeta: { id, name, version } }
  Response: SSE 流
    event: text_delta   data: { text }
    event: tool_call    data: { id, name, input }
    event: tool_result  data: { id, result, isError }
    event: patch        data: { pages: string[] }   ← 每次工具写操作后推送最新 pages
    event: done         data: { pages: string[] }   ← 最终完成
    event: error        data: { message }
```

**关键设计：pages 随请求传入，随响应返回**

XiangDi 服务是**无状态**的：banyan 后端在调用时将当前 `pages` JSON 数组随请求体一起发送，XiangDi 服务在内存中操作，通过 `patch` 事件实时推送变更后的 `pages`，最终通过 `done` 事件返回完整的最终 `pages`。banyan 后端收到 `done` 后将 `pages` 写回 MongoDB。

这样 XiangDi 服务不需要访问 MongoDB，彻底解耦。

### 决策二：packages/server 归并进 apps/banyan/backend

将 `packages/server` 的构建（`/api/v1/build`）和预览（`/preview`）路由迁移到 `apps/banyan/backend`，删除 `packages/server`。

归并后 banyan 后端统一提供：
- `/api/applications` — 应用 CRUD（原有）
- `/api/v1/build` — Electron 构建任务（从 packages/server 迁入）
- `/preview` — 应用预览 HTML（从 packages/server 迁入）
- `/api/ai/:appId/chat` — AI 对话代理（转发到 XiangDi 服务）

---

## 考虑过的方案

### 方案 A：保持 banyan 后端直接 import xiangdi（被否决）

优点：实现简单，无跨进程通信开销。

缺点：API Key 泄漏风险、进程耦合、无法独立扩缩容、违反包边界。**否决。**

### 方案 B：XiangDi 作为独立服务，banyan 后端作为代理（采纳）

banyan 后端的 `AiController` 接收前端 SSE 请求，将 `pages` + `prompt` 转发给 XiangDi 服务，并将 XiangDi 服务的 SSE 响应透传给前端。

优点：
- API Key 只在 XiangDi 服务中管理，banyan 后端无需持有
- 两个服务独立部署、独立重启
- XiangDi 服务可复用于其他消费方（未来的 CLI 工具、其他平台）
- 前端无感知，接口不变

缺点：增加一跳网络延迟（本地部署可忽略）；banyan 后端需要实现 SSE 透传逻辑。

### 方案 C：XiangDi 服务直接暴露给前端（被否决）

前端直接连接 XiangDi 服务，绕过 banyan 后端。

缺点：前端需要知道 XiangDi 服务地址；无法在 banyan 后端做鉴权；`done` 事件后的 pages 写回 MongoDB 需要前端再发一次请求，时序复杂。**否决。**

---

## 最终架构

```
前端 (React)
  │  SSE: POST /api/ai/:appId/chat
  ▼
banyan 后端 (Koa, :3001)
  │  1. 从 MongoDB 读取当前 pages
  │  2. HTTP SSE: POST /api/xiangdi/chat  { pages, prompt, appMeta }
  │  3. 透传 text_delta / tool_call / tool_result 给前端
  │  4. 收到 done 事件 → 将最终 pages 写回 MongoDB
  │  5. 向前端发送 done 事件
  ▼
XiangDi 服务 (Koa, :3002)
  │  - 持有 DeepSeek API Key
  │  - 运行 AgentLoop（内存中操作 pages JSON）
  │  - 通过 SSE 实时推送进度
  └── packages/server（构建/预览）已归并进 banyan 后端
```

---

## 影响

### 正面影响

- API Key 集中在 XiangDi 服务管理，banyan 后端无需持有 LLM 凭证
- 两个服务独立部署，AI 崩溃不影响业务 CRUD
- XiangDi 服务无状态（不访问 MongoDB），可水平扩展
- `packages/server` 归并消除了端口冲突问题，banyan 后端成为唯一的业务服务

### 负面影响 / 权衡

- 增加一个服务进程，本地开发需要同时启动 banyan 后端（:3001）和 XiangDi 服务（:3002）
- banyan 后端需要实现 SSE 透传逻辑（相对简单）
- `packages/server` 归并需要迁移构建/预览相关代码和依赖

### 迁移路径

1. 在 `packages/server/src/` 下新增 `xiangdi/` 目录，实现 XiangDi HTTP 服务
2. 将 `packages/server` 的构建/预览路由迁移到 `apps/banyan/backend`
3. 改造 `apps/banyan/backend/src/services/AiService.ts`：从直接 import 改为 HTTP 调用
4. 删除 `packages/server` 中已迁移的构建/预览代码（保留 XiangDi 服务部分）
5. 更新根 `package.json` 的 dev 脚本，同时启动两个服务

---

## 参考

- [ADR-001：BanvasGL 三入口物理隔离架构](./001-three-entry-architecture.md)
- [ADR-004：采用 Agentic Loop 而非经典 ReAct 模式](./004-agentic-loop-not-react.md)
- [Anthropic：Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
