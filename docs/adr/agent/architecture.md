# Agent · 架构级决策

> 整体怎么组织——XiangDi 智能体 + 知识服务的顶层架构。

---

## 决策依赖图

```
┌──────────────────────────────────────┐
│  A1 Orchestrator + 领域 SubAgent      │
│      统一管线                          │
└───────────────┬──────────────────────┘
                │ enables
                ├─────────────────────────────────────┐
                │                                     │
┌───────────────▼──────────────────┐   ┌──────────────▼──────────────────┐
│  A2 多 Agent 上下文按需拉取架构   │   │  A3 LangGraph 图编排框架         │
└──────────────────────────────────┘   └─────────────────────────────────┘

                        ┌──────────────────────────────────────┐
                        │  A4 知识消费走 Tool 模式              │
                        │     （LLM 按需检索）                  │
                        └───────────────┬──────────────────────┘
                                        │ drives
                        ┌───────────────▼──────────────────────┐
                        │  A5 三领域 x 三层知识体系             │
                        └──────────────────────────────────────┘
```

关系说明：

- A1→A2：Orchestrator + SubAgent 管线确立后，多 Agent 场景需要从 Push 全量上下文改为 Pull 按需拉取
- A1→A3：统一管线的编排复杂度需要 LangGraph StateGraph 声明式基础设施支撑
- A4→A5：知识消费 Tool 模式确立后，需要设计三领域三层的知识体系来组织检索内容

---

## 管线编排

### A1. Orchestrator + 领域 SubAgent 统一管线

**✅ 已实施**

废弃 Plan/Execute 二阶段划分，改为扁平 Orchestrator + 五个领域 SubAgent 的统一管线。

**决策链：** Plan/Execute 二阶段假设"规划可以一次性完成"，但应用生成是迭代过程。Execute 阶段出现认知断裂（工具里藏 LLM）、刚性边界阻碍回退、前后端领域混杂三个结构性矛盾。参考 Supervisor 模式（LangGraph）、Orchestrator-Worker 模式（Anthropic）、SOP 流水线模式（MetaGPT）三种业界主流编排模式进行融合：Orchestrator 承担 Supervisor 集中路由，前后端 Worker 并行执行各自独立 context window（Orchestrator-Worker），规划型 SubAgent 串行流水线通过结构化中间产物通信（SOP）。

**约束：**

- SOP 内部严格单向流动（需求解析->UI设计->契约定义->前后端并行->审计），节点间不允许中途回退，回退统一由审计失败后 Orchestrator 仲裁触发
- 全流程自动执行无 humanGate，用户验收点在最终结果交付后（awaiting_confirm）
- intent 节点自由路由，不强制所有 task 从 requirements 开始；前提是前序工件已存在或不需要
- LLM 驱动路由，不用规则引擎
- 领域分离 context 精炼——前端 Worker 不理解 FlowSchema，后端 Worker 不理解 AIProjection
- 总回退次数硬上限 <= 3，超过直接终止流程报 failed

**反例：**

- Plan/Execute 二阶段划分——Execute 阶段认知断裂、刚性边界阻碍回退、领域混杂。被本决策取代
- 规划阶段 Multi-Agent 分层架构（四角色 PMAgent/ArchAgent/VisualAgent/TaskPlannerAgent）——被精简为需求解析/UI设计/契约定义三个规划型 SubAgent，角色从"Plan 阶段内部子步骤"提升为与 Worker 平级的一等 SubAgent

---

### A2. 多 Agent 上下文按需拉取架构

**未实施** · 由 A1 驱动

系统提示词按应用隔离（AppSystemPrompt）+ 按角色隔离（AgentRolePrompt），上下文从 Push 全量注入改为 Pull 按需拉取。

**决策链：** 五层上下文推送模型在多 SubAgent 场景下暴露问题——每个 SubAgent 收到全量上下文导致 context 膨胀、token 浪费、prompt cache 失效。核心矛盾是 Push 模式无法区分 SubAgent 的差异化信息需求。解决方案：将上下文解耦为"应用级别的全局约束"（所有 SubAgent 共享）和"角色级别的专属知识"（按 SubAgent 职责裁剪），运行时 SubAgent 通过 ContextProvider 接口按需拉取所需上下文切片。

**约束：**

- 系统提示词分两层：AppSystemPrompt（全局约束，不变部分）+ AgentRolePrompt（角色专属知识和工具说明）
- ContextProvider 是 SubAgent 统一的上下文消费接口，SubAgent 声明需要哪些上下文维度，Provider 只组装声明的部分
- Prompt Cache 友好——AppSystemPrompt 固定前缀保证缓存命中，AgentRolePrompt 按角色分别缓存
- 历史对话摘要走混合检索（embedding + BM25），不再全量注入

**反例：**

- 五层上下文全量 Push 模型——在多 SubAgent 场景下 context 膨胀严重，每个 SubAgent 不需要全部五层信息。Push->Pull 的转变使得 context 从"全给"变为"按需取"

---

### A3. LangGraph 图编排框架

**✅ 已实施** · 由 A1 驱动

从手写 AgentLoop 迁移到 LangGraph StateGraph 作为编排基础设施。

**决策链：** 手写 while 循环 + 条件分支在引入 human-in-the-loop、checkpoint/replay、多 Agent 并行后复杂度急剧上升，且缺乏可观测性。LangGraph 提供 StateGraph 声明式编排、Send 并行执行、Checkpointer 断点恢复、条件边路由等原语，将编排复杂度从业务代码中解耦。迁移策略：保持"自然语言 in -> 结构化操作 out"的顶层契约不变，内部用 StateGraph 重新组织节点和数据流。

**约束：**

- Orchestrator 主图拓扑用 StateGraph 声明，节点为 intent/respond/requirements/uiDesign/contract/frontend/backend/audit/rollback/summarize
- 所有 SubAgent（规划型和执行型）统一封装为子图（Subgraph），主图层面完全对称
- 前后端 Worker 并行通过 Send API 实现，各自拥有独立 state 和 checkpoint
- 回退是图拓扑的显式边（audit->rollback->目标节点），LangGraph checkpoint 完整记录回退历史
- 状态管理通过 Annotation reducer 模式（artifactsReducer 支持增量写入和回退清空）

**反例：**

- 手写 AgentLoop（while + 条件分支）——在 checkpoint/replay、并行执行、精确回退等场景下复杂度不可控

---

## 知识架构

### A4. 知识消费走 Tool 模式（LLM 按需检索）

**✅ 已实施**

KnowledgeStore 作为 Tool 暴露给 LLM，由 LLM 自主决定何时检索、检索什么。不在管线中自动注入知识到 system prompt。

**决策链：** 管线自动注入模式下每次请求都拉取全量知识导致 token 浪费严重（大部分知识与当前任务无关）。Tool 模式让 LLM 按需调用 knowledge_search，只在需要时检索相关片段，token 成本可控，Prompt Cache 命中率高（system prompt 稳定不变）。

**约束：**

- system prompt 不注入应用特定信息，保持跨请求稳定
- 知识检索由 LLM 主动触发（通过 tool_use），不由管线自动触发
- 检索结果注入到当前对话上下文中（作为 tool_result 返回），不缓存到后续轮次

**反例：**

- 管线自动注入全量知识——每次请求 system prompt 巨大，token 成本线性增长，Prompt Cache 失效
- 知识硬编码在 system prompt——无法热更新，引擎升级后知识过期

---

### A5. 三领域 x 三层知识体系

**✅ 已实施** · 由 A4 驱动

XiangDi 的知识覆盖三个领域（UI / Flow / Data），每个领域按三层递进组织：Primitive（原子能力认知）-> Composition（组合模式）-> Convention（惯例约定）。第二层新增跨领域子类：bindflow（UI<->Flow 绑定模式）和 fullstack（全栈拆解）。

**决策链：** XiangDi 生成完整应用需要三类制品（AI Projection / FlowSchema / CollectionSchema），每类制品的生成都需要"是什么 + 怎么搭配 + 怎么写好"三层认知。三层递进自然形成：Primitive 解决"用什么"、Composition 解决"怎么搭"、Convention 解决"搭得好不好"。跨领域连接知识（bindflow/fullstack）填补"UI 和 Flow 如何协同"的缺口。

**约束：**

- 知识归属分两类：系统级知识存 knowledge-server（公共，按版本隔离），应用级知识 = 应用数据本身（无额外存储）
- 系统级知识不存储任何用户/应用特定信息
- 应用上下文通过程序化工具提取摘要（analyze_app_style / read_schema / read_cloud_functions），不存入知识库
- 知识种子按 BanvasGL 版本隔离向量表

**反例：**

- 只覆盖 UI 领域——Flow 和 Data 生成质量依赖 LLM 预训练知识，不了解系统特有约束
- 独立的"应用级知识存储层"——额外维护成本，且应用数据本身已包含全部上下文
