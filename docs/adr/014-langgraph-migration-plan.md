# ADR-014: XiangDi 后续迁移到 LangGraph

## 状态

已批准（Accepted） · 2026-05-19

## 背景

XiangDi 当前的核心引擎（AgentLoop + ToolRegistry + HarnessRunner + Orchestration）本质上是 LangGraph 图编排模式的手动 TypeScript 实现。LangGraph 作为低级别编排框架，其 State + Node + Edge 模型与我们的架构高度吻合。

讨论中确认：
- LangGraph 不是 "高级抽象框架"，而是低级别编排基础设施
- XiangDi 的信息三层架构（ProjectSpec / KnowledgeStore / 工具调用）完全可以在 LangGraph 自定义节点中实现
- 重构成本可控——核心是将 while 循环替换为图定义，工具注册方式适配，信息三层注入点不变

## 决策

**当前阶段保持自研实现不变**，后续待条件成熟时迁移到 LangGraph。

## 迁移映射关系

| XiangDi 当前实现 | LangGraph 对应 | 备注 |
|---|---|---|
| `AgentLoop`（while 循环 + tool_use） | `create_react_agent` 预构建 / 自定义 think→act 节点循环 | 核心替换点 |
| `ContextManager`（消息历史裁剪） | State.messages + Checkpointer 持久化 | Checkpointer 还额外提供断点续跑 |
| `ToolRegistry`（注册 + 调度） | ToolNode / 直接传 tools 数组 | API 形式变化，语义不变 |
| `AgentLifecycle`（7 态状态机） | 图节点天然对应状态，LangGraph Studio 可视化 | 可观测性大幅提升 |
| `StreamBridge`（事件流） | LangGraph 内置 streaming（astream_events） | 零自研 |
| `HarnessRunner`（Guard→Execute→Checkpoint） | 自定义节点链：guard_node → agent_node → checkpoint_node | 条件边做 guard 失败回退 |
| `SpecPlanner` → `HarnessRunner` 串行 | 顺序节点 + 条件边（是否需要人工审批） | interrupt_before 做 human-in-the-loop |
| `Orchestration`（并行 SubAgent） | `Send()` API 做 map-reduce 并行 + Subgraph 隔离子 Agent | 替代手写 Semaphore 和 AbortController |
| `ConflictDetector` + `DisambiguationHandler` | 条件边 + `interrupt_before` 人工介入 | 内置机制替代手写 Promise 挂起 |
| `ProjectSpec` 注入 | State 初始化时填充 / system prompt 注入节点 | 作为图的起始节点逻辑 |
| `KnowledgeStore`（按需 RAG） | 作为 Tool 节点，Agent 需要时调用 | 不变 |
| `LLMRouter`（多 Provider 健康检测） | 保留自研，作为 LangGraph 节点内部的 LLM 调用层 | LangGraph 不管 LLM 路由 |
| `Memory` 层（Episode + Fact） | 可复用现有实现作为 Tool，或迁移到 LangGraph 的 long-term memory | 待评估 |

## 迁移前提条件

1. `@langchain/langgraph` TypeScript SDK API 稳定（目前还在快速迭代）
2. 确认 `Send()` 并行 + Subgraph 在 JS 版本中的成熟度和性能
3. 评估 LangGraph Cloud/Platform 对自部署场景的支持（vs 纯本地运行）
4. 当前自研模块功能冻结，不再大幅新增（避免迁移负担加重）

## 迁移策略（预案）

1. **渐进式替换**：从最简单的模块开始（AgentLoop → create_react_agent），逐步替换
2. **保持接口兼容**：外部调用方（apps/xiangdi 路由层）不感知内部变化
3. **双轨验证期**：新旧实现并存，通过 feature flag 切换，比对结果一致性
4. **领域层不动**：AISchema、converters、BanvasToolProtocol 等领域代码不迁移，只是被新的 LangGraph 节点调用

## 保留不迁移的部分

- `AISchema` + `converters`（BanvasGL 特有的领域转换）
- `BanvasToolProtocol`（工具定义和 Handler 实现）
- `LLMRouter`（多 Provider 路由，LangGraph 不提供）
- `KnowledgeStore` 实现（LanceDB + graphology，作为 Tool 被调用）
- `prompts/`（系统提示词，注入方式变化但内容不变）

## 后果

- 短期：无变化，继续迭代当前实现
- 中期：减少基础设施自研投入（并发、持久化、流式），聚焦领域逻辑
- 长期：获得 LangGraph 生态的可观测性（Studio）、部署基础设施（Platform）、社区最佳实践
