# ADR-003: KnowledgeStore 从管线模式迁移为 Tool 模式

**状态**: 已采纳
**日期**: 2026-05-14
**决策者**: 陈班

## 背景

XiangDi 的信息注入最初设计为三层：ProjectSpec（全局管线注入）、KnowledgeStore（管线注入 top-K 知识）、工具调用（实时状态）。其中 KnowledgeStore 在 HarnessRunner.run() 时自动检索并注入 system prompt。

问题出现在 SpecPlanner 完善后：SpecPlanner 在规划阶段已经明确了当前任务涉及哪些组件和图形类型。如果继续无脑注入"可能相关"的知识片段，既浪费 token，又可能注入噪声。

## 决策

将 KnowledgeStore 从管线模式迁移为 Tool 模式：

- **保留管线**：ProjectSpec（全局约束，量小且稳定，每次必须注入）
- **改为 Tool**：KnowledgeStore 包装为 `knowledge_search` 工具，注册到 ToolRegistry，由 LLM 在 AgentLoop 中按需主动调用

LLM 看到 ChangeSpec 中已明确需要 "Button + Card"，主动调用 `knowledge_search({ query: "Button 组件 JSON Schema" })` 获取精确知识。

## 考虑过的方案

**方案 A：维持管线模式** — 继续在 HarnessRunner 中自动检索注入。优点：简单，LLM 不需要"知道"有知识库。缺点：token 浪费、噪声知识干扰、不可观测。

**方案 B（采纳）：Tool 模式** — 注册为 `knowledge_search` 工具。优点：按需加载节省 token、行为通过 tool_call 事件可观测、LLM 可构造精确查询。缺点：依赖 LLM 的工具调用能力，如果 LLM 不调用则获取不到知识。

**方案 C：混合模式** — 管线注入少量"一定需要"的知识 + Tool 提供深度检索。保留作为未来优化方向，当前 MVP 采用纯 Tool 模式。

## 后果

- HarnessRunner 不再持有 `knowledgeStore` 引用，构造函数简化
- 调用方在构造 AgentLoop 时通过 `registerKnowledgeSearchTool(registry, store)` 注册
- 底层 KnowledgeStore 接口（query/add/remove）不变，已有实现（MemoryKnowledgeStore、HybridKnowledgeStore）无需修改
- LLM 的 tool description 中需清晰指导何时该调用、如何构造查询
- 所有知识检索行为变为显式的 tool_call 事件，便于调试和审计
