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
- A5⤴engine:A0：知识体系的范畴严格对应 banvasgl 运行时机制层能力（refines engine:A0 机制/策略分离契约）

---

## 管线编排

### A1. Orchestrator + 领域 SubAgent 统一管线

**✅ 已实施**

废弃 Plan/Execute 二阶段划分，改为扁平 Orchestrator + 五个领域 SubAgent 的统一管线。

**决策链：** Plan/Execute 二阶段假设"规划可以一次性完成"，但应用生成是迭代过程。Execute 阶段出现认知断裂（工具里藏 LLM）、刚性边界阻碍回退、前后端领域混杂三个结构性矛盾。参考 Supervisor 模式（LangGraph）、Orchestrator-Worker 模式（Anthropic）、SOP 流水线模式（MetaGPT）三种业界主流编排模式进行融合：Orchestrator 承担 Supervisor 集中路由，前后端 Worker 并行执行各自独立 context window（Orchestrator-Worker），规划型 SubAgent 串行流水线通过结构化中间产物通信（SOP）。核心设计原则来自 Anthropic *Building Effective Agents*："最成功的实现都用了简单、可组合的模式，而不是复杂的框架。"

**管线拓扑：**

```
START → intent(LLM) → chat → respond(LLM+只读工具) → 总结 → END
                     → task → Orchestrator(工件管理 + 回退仲裁LLM)
                                    │
                                    ▼ 从目标节点开始执行
                              ┌─────────────┐
                              │  需求解析     │ 规划型 SubAgent
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │  UI 设计     │ 规划型 SubAgent
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │  契约定义     │ 规划型 SubAgent
                              └──────┬──────┘
                                     ▼
                              ┌──────┴──────┐
                              ▼             ▼
                        ┌──────────┐  ┌──────────┐
                        │前端 Worker│  │后端 Worker│ 执行型 SubAgent
                        └─────┬────┘  └────┬─────┘
                              ▼             ▼
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │    审计      │ 程序化 + LLM
                              └──────┬──────┘
                                pass │    │ fail
                                     ▼    └──→ Orchestrator(LLM仲裁退到哪)
                              ┌─────────────┐
                              │    总结      │ LLM
                              └─────────────┘
```

**五个 SubAgent 角色定义：**

1. **需求解析（规划型）** — 角色：产品经理。输入：用户原始诉求 + 对话历史 + Agent 记忆。输出：StructuredRequirements（功能列表 + 用户故事 + 约束条件）。工具：web_search（调研竞品交互模式、行业惯例）。回退触发条件：审计发现需求本身有歧义或矛盾。

2. **UI 设计（规划型）** — 角色：视觉设计师。输入：StructuredRequirements + 应用已有风格摘要。输出：UIDesignSpec（页面结构草案 + 交互流程 + 视觉规格）。工具：web_search + knowledge_search + read_pages。回退触发条件：审计发现交互模式与 BanvasGL 能力不兼容。

3. **契约定义（规划型）** — 角色：全栈架构师。输入：StructuredRequirements + UIDesignSpec。输出：IntegrationContract（数据表 Schema + 云函数签名 + 事件绑定映射）。工具：knowledge_search + read_schema + read_cloud_functions。回退触发条件：审计发现前后端契约不一致、字段类型不匹配、函数签名缺失。在 BanvasGL 的固定技术栈约束下，"架构设计"和"契约定义"是同一件事——没有技术选型空间，真正需要决策的是数据怎么组织、云函数怎么划分、前端怎么调用后端。

4. **前端 Worker（执行型）** — 角色：前端工程师。输入：IntegrationContract + UIDesignSpec。输出：FrontendArtifacts（按页面粒度的视图结构 + 客户端 FlowSchema）。工具：knowledge_search + read_pages + write_page + create_page + delete_page + material_search + material_get_detail。执行粒度为页面级逐一处理（context 控制 + 跨页一致性）。回退触发条件：审计发现前端 callFlow 引用不存在的函数 ID、或视觉实现与 UIDesignSpec 偏差过大。

5. **后端 Worker（执行型）** — 角色：后端工程师。输入：IntegrationContract + StructuredRequirements。输出：BackendArtifacts（CollectionSchema + CloudFunctionEntry[]）。工具：knowledge_search + read_schema + read_cloud_functions + write_schema + write_cloud_function + delete_cloud_function。回退触发条件：审计发现数据模型与契约不匹配。

**前后端并行执行模型：** 契约定义完成后，前端 Worker 和后端 Worker 并行启动，双方依赖的是契约中的接口定义（函数签名 + 数据表结构），不依赖对方的实现细节。如果其中一个 Worker 失败，仍然等待另一个完成，统一进入审计。审计结果中会说明哪个 Worker 失败，Orchestrator 据此决定只重跑失败的 Worker。两个都失败时优先退到 contract（通常是契约不够清晰导致两边都无法执行）。

**Orchestrator 职责：** Orchestrator 是管线中枢，负责两件事：(1) 工件管理——所有 SubAgent 的产出存储在 Orchestrator 管理的共享状态中，每个 SubAgent 可读取前序工件但只能写入自己的工件槽，回退时目标节点及其后续节点的工件被清空。(2) 回退仲裁——审计失败时用 LLM 判断应退到哪个节点，根据结构化失败原因 + 工件摘要 + 历史回退记录，选择最小回退目标，注入修正指令后从目标节点重跑后续全链。

**回退触发的两个来源：** (1) 审计失败——审计节点输出 fail，由 Orchestrator LLM 仲裁退到哪；(2) 用户反馈——用户在结果交付后发新消息表达不满，由 intent 节点 LLM 判断回退目标。两者最终都通过 Orchestrator 执行回退——清空工件、注入修正信息、从目标节点重跑。

**审计校验内容：** 前端 callFlow 引用的函数 ID 在后端产出中是否存在；后端 dbCRUD 引用的集合和字段在 CollectionSchema 中是否存在；AIProjection 是否通过 fromAIProjection() 验证；FlowSchema 结构是否合法（节点连接完整性、无孤立节点）；需求完整性（用户要求的功能是否都已体现）；Worker 执行状态（是否有 Worker 失败未产出）。执行方式：程序化校验（零 token）+ LLM 校验（语义层面），程序化校验能覆盖的不消耗 token。

**chat 与 task 的关系：** chat 和 task 由前端 UI 在发起请求时通过 type 字段定死。chat → respond 节点（LLM + 只读工具）→ 总结/记忆；task → intent → Orchestrator → SOP 流水线。两条路径共享同一个会话上下文（对话历史、Agent 记忆、应用状态），用户在 chat 中积累的信息会进入记忆，后续 task 时可以被引用。

**intent 节点职责边界：** intent 只做一件事——判断从流水线哪个位置开始执行。不做 chat/task 分类（前端 type 字段已决定），不做需求解析（那是 requirements SubAgent 的事），不做工件生成。

**intent 场景决策表：**

| 场景 | intent 输出 |
|------|------------|
| 无历史流程状态，新任务 | → 从 requirements 开始 |
| 有历史状态，用户说"继续"/带补充信息 | → 从中断点续接 |
| 有历史状态，用户说"重来"/完全不同的新需求 | → 从 requirements 重跑 |
| 有历史状态，用户说"数据表设计不对" | → 从 contract 回退重跑 |
| 有历史状态，用户说"UI 布局换一种" | → 从 ui_design 回退重跑 |
| 有历史状态，用户说"需求理解错了" | → 从 requirements 回退重跑 |
| 有历史状态，纯样式/布局调整，无数据/云函数变动，且历史工件完整 | → 直接从 frontend 开始 |
| 有历史状态，仅后端逻辑修改，且历史契约仍有效 | → 直接从 backend 开始 |

直接路由到 Worker 的前提条件：①历史 Dialogue 中存在完整的前序工件（requirements/uiDesign/contract 均 done）；②用户诉求明确不涉及需求变更或契约变更。若两个条件有一个不满足，intent 应回退到相应上游节点起始，不得跳过。

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
- Checkpointer 在 compile 层注入、恢复键用 invoke 的 thread_id，断点持久化对节点透明（节点不感知存储，详见 M3）

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

**✅ 已实施** · 由 A4 驱动 · refines engine:A0

XiangDi 的知识覆盖三个领域（UI / Flow / Data），每个领域按三层递进组织：Primitive（原子能力认知）-> Composition（组合模式）-> Convention（惯例约定）。第二层新增跨领域子类：bindflow（UI<->Flow 绑定模式）和 fullstack（全栈拆解）。

> **A0 机制/策略定位：** banvasgl 定位为图形运行时，只提供机制（mechanism）不内置策略（policy）。知识体系的范畴严格对应运行时暴露的**机制层能力**——ViewType 的渲染与布局机制、FlowNode 的执行机制、序列化/反序列化机制（fromAIProjection/toAIProjection）。策略层（编辑状态机、运行态高级交互识别、三态切换规则）归上层注入，不属于知识库范畴。

**核心定义：** XiangDi 的知识 = BanvasGL 图形运行时机制层能力的完整认知。它与传统 RAG 本质不同：传统 RAG 的知识是"LLM 读了之后转述给用户"，XiangDi 的知识是"LLM 读了之后用来决策（选什么组件）和生成（写出合法 JSON）"。知识质量的衡量标准是"用了这条知识后生成结果的验证通过率"。

**知识认知链路：** 当用户说"帮我做一个商品详情页"时，LLM 的认知链路是：用户意图（商品详情页）→ 语义知识（知道详情页通常包含大图/标题/价格/描述/按钮）→ 语义知识（知道 CombinedView(flex) 适合做纵向排列容器）→ 语义知识（知道 ImageView 适合展示商品图）→ 格式知识（知道 flex 容器的 JSON 怎么写）→ 格式知识（知道子节点的 transform/size/decoration 格式）→ 合法的 AI Projection JSON。关键洞察：LLM 对通用 UI 世界的理解（什么是详情页）来自预训练不需要教，需要教的是 BanvasGL 特有的能力体系——哪些是 BanvasGL 能表达的、每种表达方式的能力边界和适用场景。

**与业界 RAG 知识的对比：**

| 维度 | 传统 RAG 知识 | XiangDi 知识 |
|------|------|------|
| 目的 | 让 LLM 回答它不知道的事实 | 让 LLM 理解能力体系后正确决策和生成 |
| 消费方式 | LLM 读取后用自然语言转述 | LLM 读取后用于选型决策 + JSON 格式产出 |
| 认知链路 | 检索 → 转述 | 检索 → 理解能力 → 选型决策 → 格式化输出 |
| 正确性验证 | 人工判断是否回答准确 | 程序化验证（fromAIProjection() 反序列化成功）+ 视觉合理性 |
| 知识来源 | 外部文档、数据库 | 代码类型系统 + 能力说明 + 设计规范 + 人工 curated 模式 |
| 更新频率 | 业务驱动，不可预测 | 版本驱动，随 BanvasGL 发版同步 |
| 切片粒度 | 段落/句子级 | 以"一个 ViewType 的完整描述（语义+格式）"为原子单位 |
| 应用特定知识 | 通常需要独立知识库 | uiJSON 本身 + 程序化提取，无需额外存储层 |

**三层递进关系：** 三层是"能力 → 结构 → 表现"的层层递进。Primitive（第一层）："我有哪些积木，每块积木能做什么"→ 选型决策；Composition（第二层）："积木怎么搭成用户要的结构"→ 视觉决策；Convention（第三层）："搭出来的结构用什么视觉表现"。每一层解决上一层留下的问题：Primitive 解决"用什么"，Composition 解决"怎么搭"，Convention 解决"搭得好不好"。缺任何一层，LLM 的输出都不完整。

**知识归属——系统级 vs 应用级：** 不存在独立的"应用级知识"层。uiJSON 本身就是应用的全部知识——设计风格、布局偏好、颜色体系、间距规范全都隐含在页面结构中。LLM 理解当前应用风格的方式是：通过程序化工具从 uiJSON 中提取视觉参数摘要（结构匹配 + 统计分析），零 token 消耗地建立映射关系，然后把精炼后的摘要给 LLM 推理。这遵循 P1（工程化优先）：用工程手段代替 token 消耗。

**决策链：** XiangDi 生成完整应用需要三类制品（AI Projection / FlowSchema / CollectionSchema），每类制品的生成都需要"是什么 + 怎么搭配 + 怎么写好"三层认知。三层递进自然形成：Primitive 解决"用什么"、Composition 解决"怎么搭"、Convention 解决"搭得好不好"。跨领域连接知识（bindflow/fullstack）填补"UI 和 Flow 如何协同"的缺口。

**约束：**

- 知识归属分两类：系统级知识存 knowledge-server（公共，按版本隔离），应用级知识 = 应用数据本身（无额外存储）
- 系统级知识不存储任何用户/应用特定信息
- 应用上下文通过程序化工具提取摘要（analyze_app_style / read_schema / read_cloud_functions），不存入知识库
- 知识种子按 BanvasGL 版本隔离向量表
- 知识质量按维度分责：CI 验证格式维度（自动生成 → diff 对比），Code Review 验证语义维度（人工判断"选型指南是否合理"）

**反例：**

- 只覆盖 UI 领域——Flow 和 Data 生成质量依赖 LLM 预训练知识，不了解系统特有约束
- 独立的"应用级知识存储层"——额外维护成本，且应用数据本身已包含全部上下文
- 把整篇 API 文档原文塞入知识库——传统 RAG 思路，对结构化生成无效（太散、太冗余、无选型指导）
- 只有格式没有语义——LLM 知道参数怎么填，但不知道什么场景该选哪个组件
