# @banyuan/xiangdi-agent

> 相地 —— 造园之始，先察山川形势。

XiangDi 是 Banyuan 的 AI Agent 引擎，负责将用户的自然语言意图转化为精确的画布操作。它不是一个通用聊天框架——它专门解决"如何让 LLM 生成有严格数据结构约束的可视化应用"这个问题。

---

## 它做什么

当用户对 Banyuan 说"帮我做一个登录页面"时，XiangDi 负责：

1. **理解意图**：判断用户要创建新页面、修改现有页面、还是只是闲聊（`task` / `chat` 双模式）
2. **结构化需求**：将模糊的自然语言转化为精确的功能需求和 UI 规格
3. **生成前后端产物**：分别生成 UI 结构（AI Projection 格式）和后端逻辑（云函数/数据模型），通过 LangGraph `Send` API 并行执行
4. **验证正确性**：审计生成结果是否满足引用完整性和结构约束，不满足则回退重来
5. **提交结果**：将验证通过的产物写入画布

整个过程对用户来说就是"说一句话，页面就出来了"。

---

## 核心架构：OrchestratorGraph

XiangDi 基于 LangGraph（`@langchain/langgraph`）StateGraph 编排，采用多 Agent 协作架构。一次 task 模式的 AI 对话按以下拓扑流转：

```
START → [mode router]
            ├─ chat ──▶ respond ──▶ END
            └─ task ──▶ intent ──▶ requirements ──▶ ui_design ──▶ contract
                              │
                              ▼
                        parallel_build ──▶ audit ──▶ [router]
                     (frontend ‖ backend)              ├─ commit ──▶ summarize ──▶ END
                                                       └─ rollback ──▶ [router]
                                                                         ├─ requirements
                                                                         ├─ ui_design
                                                                         ├─ contract
                                                                         └─ parallel_build
```

关键设计：

- **双模式入口**：`mode='chat'` 走 `respond` 节点纯对话直达 END；`mode='task'` 走完整构建管线
- **规划阶段串行**：`requirements → ui_design → contract`，每一步是下下一步的前置
- **构建阶段并行**：`frontend` 与 `backend` 通过 LangGraph `Send` API 并行执行，`parallel_build` 为汇聚点
- **审计门禁**：`audit` 节点验证产物引用完整性和结构正确性，失败则触发 `rollback`
- **回退路径**：`rollback` 可退回任意规划或构建节点重新执行，而非从头再来
- **Worker SubGraph**：每个 SubAgent 内部是 think↔tools 多轮 Agentic Loop（`workerGraph.ts`），默认 `maxIterations=15`

### Dialogue Phase 状态机

SSE 事件由 8 个对话阶段驱动：

```
start → requirements → ui_design → contract → building → awaiting_confirm → committing → done
```

`awaiting_confirm` 可回退到 `requirements` / `ui_design` / `contract` / `building`（用户不满意时 rollback），状态转移由 `PHASE_TRANSITIONS` map 严格控制。

### 5 个 SubAgent

| SubAgent       | 职责                                             | 节点               |
| -------------- | ------------------------------------------------ | ------------------ |
| `requirements` | 将自然语言需求结构化                             | `requirementsNode` |
| `uiDesign`     | 产出 UI 设计规格（页面/组件/布局）               | `uiDesignNode`     |
| `contract`     | 定义前后端接口契约（数据模型/云函数签名）        | `contractNode`     |
| `frontend`     | 生成前端产物（AIProjection 格式页面）            | `frontendNode`     |
| `backend`      | 生成后端产物（CollectionSchema + CloudFunction） | `backendNode`      |

每个 SubAgent 的输出都经过 Zod Schema 验证，确保结构正确后才进入下一阶段。

---

## 与画布的连接：AI Projection

LLM 不直接操作 BanvasGL 的内部数据结构。中间有一层 **AI Projection**——一种对 LLM 友好的精简格式：

- `toAIProjection()`：将完整的画布数据转为 LLM 可读的精简结构
- `fromAIProjection()`：将 LLM 输出反序列化为画布对象
- `patchProjection()`：增量更新（ADR-041），只修改变化的部分，避免全量重写

这层转换屏蔽了引擎内部的复杂性（addon、缓存、渲染状态），让 LLM 只关注语义层面的结构。

---

## LLM 支持

内置 DeepSeek（主）和 Kimi（备）两个 LLM 客户端，通过 `LLMRouter` 做健康检测 + 信号系统自动切换。对外暴露统一的 `LLMClient` 接口，接入方也可以实现自己的客户端。

---

## 知识检索

XiangDi 通过 Tool 模式按需检索 BanvasGL 的组件能力知识。知识按三层递进组织（ADR-040）：Primitive（原子能力认知）→ Composition（组合模式，含跨领域绑定）→ Convention（惯例约定）。知识检索由独立的 Knowledge Server 提供 HTTP 服务，XiangDi 通过 `RemoteKnowledgeStore` 按需查询。

---

## SSE 事件协议

Orchestrator 通过 6 类细粒度 SSE 事件向前端推送进度：

| 事件类型         | 说明                                                     |
| ---------------- | -------------------------------------------------------- |
| `phase_change`   | Phase 转移（from → to）                                  |
| `agent_progress` | SubAgent 运行进度（planning/executing/completed/failed） |
| `tool_activity`  | 工具调用活动（calling/success/error）                    |
| `audit_progress` | 审计进度                                                 |
| `text_delta`     | 文本增量（流式输出）                                     |
| `done`           | 任务完成，携带产物概览（`DoneArtifactsOverview`）        |

---

## 在 Monorepo 中的位置

```
apps/xiangdi-server  ──调用──▶  @banyuan/xiangdi-agent  ──类型依赖──▶  @banyuan/banvasgl
（HTTP 服务壳）               （AI 逻辑引擎）                      （图形引擎类型）
```

XiangDi Agent 是纯逻辑库，不含 HTTP 服务器。HTTP 层由 `apps/xiangdi-server` 提供。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
