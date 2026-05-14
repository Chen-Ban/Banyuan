# ADR-002: XiangDi 将 Spec 作为架构一等公民

**状态**: 已采纳
**日期**: 2026-05-14
**决策者**: 陈班

## 背景

主流 AI Agent 框架（LangGraph、CrewAI、AutoGen）的核心抽象是图节点、角色、工具调用。如果用户想引入 Spec 驱动的工作流，需要自己在框架外层套一层，框架本身对 Spec 毫无感知。这导致 Spec 与执行之间存在信息断层——Guard/Checkpoint 无法直接读取 Spec 字段做守卫。

XiangDi 需要一种方式让「意图对齐」和「执行验证」紧密耦合。

## 决策

将 Spec 内置为 XiangDi 引擎的一等公民数据结构，采用两层 Spec 分离：

- **ProjectSpec**（项目级宪法）：跨任务持久，从 `AGENTS.md` 文件加载，自动注入 system prompt。包含编码惯例、禁止事项、Agent 行为指引。
- **ChangeSpec**（变更级施工图）：单次任务，包含 proposal（做什么）、specs（约束）、tasks（执行步骤）三段式结构，附带状态机（draft → approved → running → completed/failed）。

Spec 贯穿全链路：SpecPlanner 产出 → HarnessRunner 消费 → Guard/Checkpoint 直接读取字段。

## 考虑过的方案

**方案 A：纯 Prompt 模式** — 把所有约束写进 system prompt，不做结构化。问题：不可验证，LLM 忽略约束时无法通过代码检测。

**方案 B：外挂 Spec 层** — 类似 Amazon Kiro，Spec 是 Markdown 文件，Agent 框架不感知。问题：Guard/Checkpoint 无法读取 Spec 字段做自动化守卫。

**方案 C（采纳）：Spec 内置** — Spec 是强类型 TypeScript 数据结构，Guard/Checkpoint 直接 import 类型并读取字段。问题：增加了引擎复杂度，但换来的是 Spec ↔ 执行的紧密耦合。

## 后果

- Guard 可直接判断 `spec.status === 'approved'` 来阻断未审批的执行
- Checkpoint 可读取 `spec.tasks` 检查是否所有任务都完成
- HumanGate 可展示 `spec.proposal` 让人类审核
- SpecPlanner 和 AgentLoop 职责清晰分离：一个规划，一个执行
- 新增的业务约束只需添加对应的 Guard/Checkpoint，不用修改 AgentLoop 核心代码
