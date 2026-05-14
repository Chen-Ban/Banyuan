# ADR-004: 采用 Agentic Loop 而非经典 ReAct 模式

**状态**: 已采纳
**日期**: 2026-05-14
**决策者**: 陈班

## 背景

AI Agent 的执行模式有多种选择。经典 ReAct（Reasoning + Acting）要求模型在每个步骤显式输出 Thought 文本，然后选择 Action，再 Observe 结果。这在早期 LLM 能力不足时有效，但现代 LLM（Claude、GPT-4、DeepSeek）已将推理内化到 tool_use 机制中。

## 决策

采用 Anthropic 文档中定义的 Agentic Loop 模式：

- LLM 直接返回 tool_use block（不强制输出 Thought 文本）
- AgentLoop 循环：发送消息 → 解析响应 → 若有 tool_use 则执行工具 → 将 tool_result 追加回消息 → 继续循环
- 循环终止条件：LLM 返回 `stop_reason: "end_turn"`（不再请求工具调用）

不要求也不鼓励 LLM 输出结构化的 "Thought: ..." 前缀。推理过程可能体现在 LLM 的文本回复中，但这是模型的自由而非协议要求。

## 考虑过的方案

**方案 A：经典 ReAct** — 强制 `Thought → Action → Observation` 三步循环。问题：现代 LLM 在 tool_use 模式下被强制输出 Thought 反而会降低效率和准确性（额外 token、可能产生幻觉推理）。

**方案 B（采纳）：Agentic Loop** — 信任 LLM 的 tool_use 机制，不强加外部推理结构。简洁，与 Anthropic/OpenAI 的 API 设计哲学一致。

**方案 C：Plan-and-Execute** — 先让 LLM 生成完整计划，再逐步执行。问题：与 Spec 体系重复——SpecPlanner 已经完成了规划，AgentLoop 只需执行。

## 后果

- AgentLoop 代码简洁：核心是一个 while 循环 + switch(stop_reason)
- 不需要解析/验证 Thought 文本格式
- 生命周期状态机（AgentLifecycle）中 thinking/acting/observing 是语义标记，不是协议强制的步骤
- 与 Anthropic Claude、OpenAI、DeepSeek 的 API 都兼容
- 调试时若需看到 LLM 的推理过程，可查看 text_delta 事件中的自然语言输出
