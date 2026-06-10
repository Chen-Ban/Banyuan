# xiangdi-server —— XiangDi AI Agent HTTP 服务

XiangDi Server 是 `@banyuan/xiangdi-agent` 引擎的 HTTP 服务壳。它把 AI Agent 的能力通过 SSE（Server-Sent Events）接口暴露给 Banyan 后端调用。

---

## 它做什么

XiangDi Server 是一个**无状态**的 AI 服务：

- 接收来自 Banyan 后端的 AI 请求（用户消息 + 当前应用数据）
- 调用 `@banyuan/xiangdi-agent` 的 OrchestratorGraph 执行 AI 生成
- 通过 SSE 流式返回进度事件和最终结果
- 不访问 MongoDB，不持有应用数据

所有应用数据的读写由 Banyan 后端负责——XiangDi Server 采用 Pull-based 架构，需要数据时主动向 Banyan 后端拉取。

---

## 请求流程

```
Banyan 后端(:3001)
    │
    │ POST /ai/run（用户消息 + appId，mode: task | chat）
    ▼
XiangDi Server(:3002)
    │
    │ 执行 OrchestratorGraph（LangGraph StateGraph）
    │ Pull-based 拉取 pages/collections/cloudFunctions
    │ 按需拉取物料（RemoteMaterialStore）/知识
    ▼
SSE 流式返回（进度事件 + 最终产物）
```

---

## 主要接口

| 接口 | 用途 |
|------|------|
| `POST /ai/run` | 执行 AI 生成（SSE 流式响应），支持 `mode: task`（构建）与 `mode: chat`（对话） |
| `GET /ai/models` | 查看可用 LLM 模型 |
| `POST /ai/models/switch` | 切换当前使用的模型 |

SSE 事件类型包括：阶段切换（phase_change）、SubAgent 进度（agent_progress）、工具调用活动（tool_activity）、审计进度（audit_progress）、文本增量（text_delta）、完成（done）。

---

## 快速开始

```bash
# 配置 API Key（二选一）
export DEEPSEEK_API_KEY=sk-your-key
# 或创建 src/apiKey.json: { "apiKey": "sk-your-key" }

# 开发模式
pnpm dev

# 生产构建
pnpm build && pnpm start
```

默认监听 `:3002`。通常不需要单独启动——`pnpm dev:banyan` 会一并启动所有服务。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3002 | 服务端口 |
| `DEEPSEEK_API_KEY` | — | DeepSeek API Key |
| `KIMI_API_KEY` | — | Kimi API Key（备用） |
| `BANYAN_URL` | http://localhost:3001 | Banyan 后端地址（Pull 数据用） |
| `KNOWLEDGE_URL` | http://localhost:3003 | 知识服务地址 |
| `INTERNAL_TOKEN` | — | 内部服务间认证 token |

---

## 在 Monorepo 中的位置

```
Banyan 后端(:3001) ──HTTP SSE──▶ XiangDi Server(:3002) ──HTTP──▶ Knowledge Server(:3003)
                                        │
                                        ▼
                               @banyuan/xiangdi-agent（AI 逻辑引擎）
```

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
