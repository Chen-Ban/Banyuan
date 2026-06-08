# Agent · 协议级决策

> 模块间怎么通信——XiangDi 智能体 + 知识服务的模块间通信协议与数据格式。

---

## 决策依赖图

```
┌──────────────────────────────────┐
│  C1 会话模型：Dialogue            │
│     作为唯一权威状态机            │
└───────────────┬──────────────────┘
                │ enables
     ┌──────────┼───────────────────────────────────────┐
     │                                                  │
┌────▼──────────────────────────────┐     ┌─────────────▼────────────────────┐
│  C2 SSE 事件协议                  │     │  C10 xiangdi-server 内部 API      │
│     （6 类 Discriminated Union）  │     │      Pull-based 数据拉取协议      │
└──────────────────────────────────┘     └──────────────────────────────────┘

┌──────────────────────────────────┐
│  C3 Spec 协议：ProjectSpec +      │
│     ChangeSpec                    │
└───────────────┬──────────────────┘
                │ enables
┌───────────────▼──────────────────┐      ┌──────────────────────────────────┐
│  C4 SubAgent 统一协议             │◀─────│  C5 多 Agent 上下文拉取 API       │
└───────────────┬──────────────────┘      └──────────────────────────────────┘
                │ refines                            complements
┌───────────────▼──────────────────┐
│  C6 工具集协议（三层结构）         │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  C7 知识种子数据格式协议          │
└───────────────┬──────────────────┘
                │ enables
┌───────────────▼──────────────────┐
│  C8 knowledge-server              │
│     HTTP 检索协议                 │
└───────────────┬──────────────────┘
                │ enables
     ┌──────────┼───────────────────────────────────────┐
     │                                                  │
┌────▼──────────────────────────────┐     ┌─────────────▼────────────────────┐
│  C9 CI knowledge-guard            │     │  C11 GraphKnowledgeStore +        │
│     验证协议                      │     │      RetrievalRouter 接口协议     │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

关系说明：

- C1→C2：Dialogue 状态机确立后，SSE 事件流成为 phase 的实时投影
- C3→C4：Spec 协议定义了 SubAgent 的输入来源（ProjectSpec 注入全局约束，ChangeSpec 驱动规划产物），SubAgent 统一协议在此基础上标准化输入输出格式
- C5⇄C4：上下文拉取 API 为 SubAgent 统一协议提供上下文消费能力，两者互补
- C4→C6：SubAgent 统一协议确立后，工具集按 SubAgent 角色分层白名单化（C6 同时 refines engine:A0——工具消费运行时机制层 API）
- C7→C8：种子数据格式定义了知识的存储结构，HTTP 检索协议基于此结构提供查询接口
- C8→C9：检索协议确立后，CI 验证协议确保种子内容与代码同步
- C10⇄C1：内部 API 协议是 Pull-based 架构的具象化，与 Dialogue 状态机互补（请求前拉取、请求后写回）
- C11⊃C8：GraphKnowledgeStore 是 HTTP 检索协议的能力扩展，预留 Graph 检索路径

---

## 会话与事件

### C1. 会话模型：Dialogue 作为唯一权威状态机

**✅ 已实施**

Dialogue 升格为 Agent 系统的核心数据实体，phase 字段是唯一权威状态机，SSE 事件流是 phase 的实时投影。

**决策链：** 早期设计中状态分散在多处（threadStatus、planningSteps、各种 flag），导致状态不一致和前后端对齐困难。核心洞察：Agent 系统的所有行为都围绕一次对话展开，Dialogue 天然是状态的载体。将 phase 作为唯一状态机后，所有 SSE 事件都可映射为"当前处于哪个 phase + 该 phase 内的增量"，前端消费变得可预测。SSE 不再是"什么都往里塞"的混乱流，而是 phase 状态机的结构化投影。

**实现：** `packages/xiangdi-agent/src/orchestration/phases.ts`

- 8 个阶段：start → requirements → ui_design → contract → building → awaiting_confirm → committing → done
- 合法转移通过 `PHASE_TRANSITIONS` 静态表声明，`canTransition(from, to)` 程序化校验
- 线性主路径单向推进；awaiting_confirm 可回退到 requirements/ui_design/contract/building
- 终态判断：`isTerminal(phase)` — done 的 PHASE_TRANSITIONS 为空数组
- PhaseMetadata 提供中文显示名 + 描述 + requiresConfirmation 标记，供前端进度 UI 消费

**Dialogue Phase 完整状态机：**

| Phase | 用户感知 | 内部动作 |
|-------|---------|---------|
| start | 准备中 | 组装上下文、调用 intent 判断起始节点 |
| requirements | 需求分析中 | 需求解析 SubAgent 执行 |
| ui_design | 设计中 | UI 设计 SubAgent 执行 |
| contract | 架构中 | 契约定义 SubAgent 执行 |
| building | 构建中 | 前后端 Worker 并行 + 审计 + 可能的内部回退重跑 |
| awaiting_confirm | 待验收 | 结果已生成，等待用户确认应用 |
| committing | 提交中 | 总结节点 + 数据持久化 |
| done | 完成 | 终态 |
| responding | 回答中 | chat 路径：LLM + 只读工具 + 总结 |
| discarded | 已放弃 | 用户打断或拒绝验收 |
| failed | 失败 | 不可恢复错误（含回退次数耗尽） |

**合法转移矩阵：**

```
start:             ['requirements', 'ui_design', 'contract', 'building', 'responding', 'failed']
requirements:      ['ui_design', 'failed', 'discarded']
ui_design:         ['contract', 'failed', 'discarded']
contract:          ['building', 'failed', 'discarded']
building:          ['awaiting_confirm', 'failed', 'discarded']
awaiting_confirm:  ['committing', 'discarded']
committing:        ['done', 'failed']
responding:        ['done', 'failed', 'discarded']
done:              []
discarded:         []
failed:            []
```

**关键设计决策：** (1) Phase 严格单向推进不回退——审计失败导致的内部回退全部在 building phase 内部消化，用户感知到的是"构建中"持续了较长时间，而非"出错了在重跑"，这是刻意的体验设计。(2) building phase 封装了执行层的全部复杂性——包含前后端 Worker 并行执行、审计校验、回退仲裁、重跑，对外只暴露最终结果。(3) awaiting_confirm 是唯一用户验收关卡——全流程自动执行完毕后结果暂存在 Dialogue 中，用户查看预览效果后一次性验收。(4) start 可跳到任意工作 phase——intent 节点可能判断从任意位置续接/回退。

**去掉 baseAppJSON 概念：** Dialogue 不再存储 baseAppJSON（执行前基线快照）。理由：每个 done 状态的 Dialogue 的 appJSON 字段本身就是该轮对话完成后的应用状态快照。Dialogue 链天然形成版本历史。用户拒绝验收时当前 Dialogue 产出被丢弃、Application 表不变（等同于什么都没发生）。

**约束：**

- Phase 在主路径上严格单向推进不回退（内部回退在 building phase 内消化，对用户不可见）
- 合法 phase 转移通过显式 PHASE_TRANSITIONS map 校验，非法转移立即抛错
- 终态为 done，不可逆（discarded/failed 作为 done 的子分类在 DoneSSEEvent.finalPhase 中区分）
- Dialogue 链天然形成版本历史（每个 done 的 Dialogue 的 appJSON 是该轮完成后的快照）
- Application 表只在 committing 阶段被写入且仅当用户确认后——任何时刻 Application 表中的数据都是用户验收过的最新版本

**反例：**

- "打断恢复"机制（ResumeClassifier + 失效传播）——打断即新对话：用户打断不恢复旧 Dialogue，而是创建新 Dialogue，intent 节点判断从哪续接。彻底消除复杂的中断恢复状态机和过期检测

---

### C2. SSE 事件协议（6 类 Discriminated Union）

**✅ 已实施** · 依赖 C1

SSE 事件通过 `OrchestratorSSEEvent` discriminated union 定义 6 类事件，前端按 `type` 字段区分处理。

**设计动机：** SSE 是会话模型的实时投影——每个 SSE 事件必须能映射到"当前处于哪个 phase + 该 phase 内的增量"。Phase 以 SubAgent 粒度暴露（start/requirements/ui_design/contract/building/awaiting_confirm/committing/done），用户感知到的是"数字员工"协作进度。SSE 事件需要让前端能展示每个阶段的实时状态，同时保持事件集精简可控。

**两层设计原则：** SSE 事件分两层——**phase 层**（用户可见进度，前端必须处理）和 **detail 层**（细粒度信息，前端可选择展示或忽略）。Phase 层事件驱动进度 UI，detail 层事件丰富体验但不影响核心流程。实际实现为 6 类平等 discriminated union，前端根据功能区域按需消费——phase 层语义对应 phase_change / text_delta / done 三类，detail 层语义对应 agent_progress / tool_activity / audit_progress 三类。

**实现：** `packages/xiangdi-agent/src/orchestration/events.ts`

6 类事件定义：

- `phase_change` — Phase 转移事件（from + to + timestamp），驱动前端进度条
- `agent_progress` — SubAgent 运行进度（agent + status:planning|executing|completed|failed + message），展示"哪个数字员工在做什么"
- `tool_activity` — 工具调用通知（agent + tool + status:calling|success|error + inputSummary/outputSummary/error），可选展示细节
- `audit_progress` — 审计进度（status:checking|passed|failed_retrying + message），building 内部可视化
- `text_delta` — 文本流式输出（delta 文本片段），respond 子图使用
- `done` — 流结束信号（finalPhase + summary + artifacts:DoneArtifactsOverview），标记请求完成

**与旧事件的对应关系：**

| 旧事件（早期事件协议） | 新对应 | 处理方式 |
|---|---|---|
| `text` | `text_delta` | 保留，用于 respond 路径和 summarize 流式输出 |
| `tool_call` / `tool_result` | `tool_activity` | 替换为更高层抽象（不暴露原始 tool_call JSON） |
| `app_snapshot` | 退役 | 不再需要——产出暂存在 Dialogue，confirm 后才写入 |
| `schema_update` | 退役 | 同上 |
| `disambiguation` | 退役 | 新架构无 humanGate，不需要消歧事件 |
| `done` | `done` | 保留，增加 `artifacts` 概览字段 |
| `error` | `done(finalPhase='failed')` | 合并至 done 的 finalPhase 区分 |
| — | `phase_change` | 新增，核心进度事件 |
| — | `agent_progress` | 新增，SubAgent 粒度进度 |
| — | `audit_progress` | 新增，审计进度（building 内部） |

**前端消费策略：** 前端可以根据产品需求选择展示粒度：

- **最简模式**：只监听 `phase_change`，展示"需求分析中/设计中/构建中/待验收"四步进度条
- **标准模式**：监听 `phase_change` + `agent_progress`，展示每个 SubAgent 的开始/完成状态
- **详细模式**：全部监听，展示 Worker 的每一步工具调用（适合开发者/调试场景）

产品初期推荐标准模式——用户能感知到"多个数字员工在协作"，但不被过多细节干扰。

**约束：**

- 所有事件通过 `OrchestratorSSECallback = (event: OrchestratorSSEEvent) => void` 回调推送
- 上游（xiangdi-server HTTP handler）序列化为 `data: JSON\n\n` 格式写入 SSE 响应流
- `app_state` 保留为独立事件（在 xiangdi-server 层注入，不在 Orchestrator 图内），用于请求结束时向 banyan 后端推送最终 appJSON/schema/cloudFunctions
- 前端必须处理：phase_change（进度）、text_delta（流式文本）、done（终止）
- 前端可选展示：agent_progress、tool_activity、audit_progress

**反例：**

- 旧 tool_call/tool_result 事件——替换为 tool_activity 高层抽象，减少前端处理复杂度（前端不需要知道原始工具输入/输出 JSON 结构，只需显示"正在调用 write_page"即可）

---

## Agent 协议

### C3. Spec 协议：ProjectSpec + ChangeSpec 作为引擎一等公民

**✅ 已实施**

Spec 是 Agent 系统的一等架构概念——ProjectSpec 描述全局约束，ChangeSpec 描述本轮变更意图，两者驱动整个执行流程。

**决策链：** Agent 需要一种结构化的方式描述"用户想要什么"和"系统应该做什么"。自然语言太模糊、代码太具体，Spec 处于两者之间——结构化但可读。ProjectSpec 是持久的全局约束（品牌色、业务领域、技术偏好），ChangeSpec 是本轮对话的变更描述（新增哪些功能、修改哪些页面）。在新架构中，Spec 的角色演化为：ProjectSpec 信息融入 AppSystemPrompt，ChangeSpec 的功能被 StructuredRequirements + UIDesignSpec + IntegrationContract 三个规划产物替代（粒度更细、可校验性更强）。

**约束：**

- ProjectSpec 随应用持久化，跨对话有效
- ChangeSpec / 规划产物（requirements/uiDesign/contract）是本轮对话产物，存储在 Dialogue.planningEntries 中
- 规划产物全部经过 Zod schema 验证，格式错误在 SubAgent 内部重试修复

---

### C4. SubAgent 统一协议

**✅ 已实施** · 依赖 C3

所有 SubAgent（规划型和执行型）遵循统一的输入/输出/注册协议，Orchestrator 的调度逻辑完全通用。

**实现：** `packages/xiangdi-agent/src/orchestration/protocol.ts`

核心数据结构：

- `SubAgentDescriptor<TOutput>` — 声明式注册（name/role/mode/dependencies/outputSchema/tools/maxIterations/timeoutMs）
- `SubAgentInput` — 统一输入（userMessage + artifacts + agentMemory + conversationContext + auditFeedback?）
- `SubAgentOutput<TOutput>` — 统一输出（artifact + reasoning + metadata:iterations/durationMs/toolCalls）
- `SubAgentError` — 错误协议（agentName + phase:llm_call|tool_execution|output_validation|timeout + retriable + partialOutput?）
- `SUBAGENT_DEPENDENCIES` — 静态依赖图
- `SUBAGENT_TOPO_ORDER` — SOP 拓扑序
- `getDependents(target)` — BFS 计算下游依赖（回退时清空工件用）
- `canRunInParallel(a, b)` — 互不依赖则可并行

**约束：**

- SubAgent 只能读取 dependencies 声明的前序工件
- SubAgent 只能写入自己的工件槽
- 规划型 mode='planning'：0~2 轮只读工具调用 + 结构化输出，验证失败内部重试 <= 3 次
- 执行型 mode='execution'：多轮 think↔tools 循环（<= maxIterations），通过写入工具产生副作用
- 错误分层处理：output_validation/tool_execution(幂等)/llm_call 在 SubAgent 内部消化，tool_execution(非幂等)/硬超时上报 Orchestrator

---

### C5. 多 Agent 上下文拉取 API

**📋 已规划** · 补充 C4

ContextProvider 接口是 SubAgent 消费上下文的统一入口，SubAgent 声明需要哪些上下文维度，Provider 按需组装。

**决策链：** Push 模式下所有 SubAgent 收到相同的全量上下文，导致 context 膨胀。Pull 模式：SubAgent 通过 ContextProvider.get(dimensions) 声明需要哪些切片（如 requirements SubAgent 需要 'userMessage' + 'agentMemory'，不需要 'existingPages' 和 'existingSchema'），Provider 只组装声明的部分。

**约束：**

- ContextProvider 是无状态接口，每次调用根据当前 ArtifactStore + 数据源实时组装
- 维度可用集合：userMessage / agentMemory / conversationContext / existingPages / existingSchema / existingFunctions / knowledge(query) / auditFeedback
- 每个 SubAgent 在 descriptor 中声明所需维度，Orchestrator 调度时自动调用 Provider

---

### C6. 工具集协议（三层结构）

**✅ 已实施** · 细化 C4 · refines engine:A0

工具按职责分为三层：共享只读层（感知现状）、前端 Worker 写入层、后端 Worker 写入层。每个 SubAgent 只能使用白名单内的工具。

> **A0 机制/策略定位：** Agent 工具集本质上是对 banvasgl 图形运行时**机制层 API** 的消费封装。write_page 消费序列化机制（fromAIProjection/patchProjection），write_cloud_function 消费 FlowSchema 执行机制，read_pages 消费 toAIProjection 序列化机制。工具不涉及策略层（编辑状态机、运行态高级交互识别），因为策略归上层注入，Agent 生成的是声明式数据结构而非交互行为。

**设计动机（工具集整体重新设计）：** 旧工具集（21 个工具，6 个分组）存在以下结构性问题：(1) 为旧 MasterGraph 设计，未映射新五 SubAgent 架构——旧架构只有一个统一执行阶段，所有工具混在一起由同一个 Agent 调用；新架构需要按 SubAgent 职责精确划分工具边界。(2) 冗余工具浪费 LLM 选择注意力——`banvas_resize_node`（= `update_node` 的 patch size）、`banvas_move_node`（= `update_node` 的 patch transform）是快捷别名，增加工具列表认知噪音。(3) `banvas_apply_patch` 事务语义在新架构下无意义——新架构每页独立操作（patchProjection 已是原子写入），不存在跨页面中间状态不一致。(4) 工具里藏 LLM 的反模式——`generate_cloud_function` / `update_cloud_function` 内部发起独立 LLM 调用，违背"工具=确定性操作"原则。(5) 缺乏后端 Worker 必需的工具——没有读取已有云函数的工具、没有绑定事件的工具。(6) 工具命名风格不统一——`banvas_` 前缀 vs 无前缀混用。

**退役工具：**

| 工具 | 退役原因 |
|------|---------|
| `banvas_resize_node` | `update_node({ patch: { size } })` 的纯语法糖，增加工具列表噪音 |
| `banvas_move_node` | `update_node({ patch: { transform: { x, y } } })` 的纯语法糖 |
| `banvas_apply_patch` | 新架构每页独立 patchProjection，不需要跨操作事务 |
| `generate_cloud_function` | 工具里藏 LLM 的反模式；后端 Worker 自身生成 FlowSchema |
| `update_cloud_function` | 同上 |
| `explain_cloud_function` | 无读取工具配套，且 LLM 自身可读懂 FlowSchema JSON |

**新工具集设计——三层结构：** 从 21 个精简为 12 个。LLM 单次决策面对的工具列表从 11 个精简到 3~7 个，显著降低选择复杂度。

**`web_search` 定位说明：** `knowledge_search` 获取 BanvasGL 底层能力边界和格式知识（"怎么在我们平台上实现"），`web_search` 获取业界产品/设计/交互领域知识（"业界是怎么做的"）。两者正交互补：需求 SubAgent 用 web_search 调研竞品交互模式，设计 SubAgent 用 web_search 搜索设计趋势和参考，契约 SubAgent 用 knowledge_search 确认平台能力边界。

**核心决策——前端 Worker 写入粒度为"整页"：** 不再提供 add_node / update_node / delete_node 节点级工具。前端 Worker 在 think 阶段构思完一整页的视图结构，通过 write_page 一次性写入完整 AIProjectionScene。理由：(1) 减少工具调用轮次——节点级操作一个表单页要 20+ 次工具调用（每个控件一次），整页写入只需 1 次。(2) 与 patchProjection 语义对齐——底层实现就是 `patchProjection([{ pageId, operation: 'upsert', scene }])`。(3) context 更可控——Worker 每次只需读取当前页面的 AIProjection，修改后整页写回。(4) 幂等性天然保证——同一页面重复写入 = 覆盖，不会产生重复节点。修改已有页面的场景：Worker 先 read_pages 获取当前结构，在 think 阶段修改 JSON，再 write_page 写回（对 LLM 来说，修改 JSON 对象比决定调用哪些原子工具更自然）。

**核心决策——Schema 保持全量替换：** 后端 Worker 拿到契约后应一次性生成完整 Schema，而非增量添加。理由：Agent 上下文中已有完整的 CollectionContract 列表，全量写入避免了 Agent 需要记忆"哪些已写、哪些未写"的状态跟踪负担。后端 diff 更新已经是 banyan 后端的实现细节。

**核心决策——`write_cloud_function` 是纯写入工具：** 后端 Worker 自身在 think 阶段生成 FlowSchema（利用 system prompt 中注入的 FlowSchema 节点规范 + knowledge_search 按需检索），然后通过此工具将结果写入。工具内部不调用 LLM——彻底消除"工具里藏 LLM"的反模式。

**实现：** `packages/xiangdi-agent/src/orchestration/nodes/workerTools.ts`（工具接口定义）+ `apps/xiangdi-server/src/routes/orchestrateHandlers.ts`（工具处理器适配层）

工具处理器通过依赖注入模式桥接：xiangdi-agent 定义 `FrontendToolHandlers` / `BackendToolHandlers` 接口（纯函数签名），xiangdi-server 提供实际实现（连接 BanyanClient + RemoteKnowledgeStore + AppRuntimeState）。

**SubAgent↔工具白名单：**

| SubAgent | 角色 | 可用工具 | 用途说明 |
|----------|------|---------|---------|
| requirements | 产品经理 | web_search | 调研竞品/行业惯例/用户习惯 |
| uiDesign | 视觉设计师 | web_search, knowledge_search, read_pages | web 搜参考设计，knowledge 查能力边界，read_pages 看现有页面结构 |
| contract | 全栈架构师 | knowledge_search, read_schema, read_cloud_functions | knowledge 查 FlowSchema 节点类型规范，read 感知现有数据模型和云函数 |
| frontend | 前端工程师 | knowledge_search, read_pages, write_page, create_page, delete_page, material_search, material_get_detail | knowledge 查 BanvasGL 实现，read 感知 → write 写入 |
| backend | 后端工程师 | knowledge_search, read_schema, read_cloud_functions, write_schema, write_cloud_function, delete_cloud_function | knowledge 查 FlowSchema 规范，read 感知 → write 写入 |
| respond (chat) | — | read_pages, read_schema, read_cloud_functions, knowledge_search, web_search | 全部只读，不做任何写入 |

**约束：**

- 共享只读工具：read_pages / read_schema / read_cloud_functions / knowledge_search / web_search
- 前端专属工具：write_page / create_page / delete_page / material_search / material_get_detail
- 后端专属工具：write_schema / write_cloud_function / delete_cloud_function
- 统一命名风格：动词_名词，去掉 banvas_ 前缀（不再需要区分画布工具和其他工具）
- 所有写入操作在 AppRuntimeState（内存对象）上完成，不直接访问 MongoDB

**反例：**

- 节点级写入工具（add_node/update_node/delete_node/resize_node/move_node）——整页写入减少工具调用轮次（从 20+ 次降到 1 次/页），与 patchProjection 语义对齐，幂等性天然保证
- banvas_apply_patch 事务——新架构每页独立 patchProjection 已是原子写入，不存在跨页面中间状态
- generate_cloud_function/update_cloud_function——工具里藏 LLM 的反模式，后端 Worker 自身生成 FlowSchema

---

## 知识服务协议

### C7. 知识种子数据格式协议

**✅ 已实施**

每个知识种子是一个 JSON 文件，结构为 { id, content, source, metadata }。content 为 Markdown 格式的知识描述，metadata 包含 category（层级）、domain（领域）、version（包版本号）等分类信息。

**决策链：** 知识需要结构化存储以支持分类检索 -> JSON 是自然选择 -> content 用 Markdown 因为 LLM 对 Markdown 的理解最好 -> metadata 支撑检索过滤和影响分析。

**约束：**

- id 格式：{category}-{domain}-{name}，如 primitive-ui-combinedview
- source 标识来源：auto-generated:{hook-name} 或 manual
- Composition Seeds 的 metadata 必须包含 dependencies 字段（声明依赖的 Primitive ID 列表）
- category 枚举：primitive / composition / convention
- domain 枚举：ui / flow / data / bindflow / fullstack

---

### C8. knowledge-server HTTP 检索协议

**✅ 已实施** · 依赖 C7

knowledge-server 暴露 5 个 HTTP 端点，核心为混合检索接口。

**实现：** `apps/knowledge-server/src/routes/knowledge.ts`

端点清单：

- `POST /knowledge/search` — 语义检索（query + version + 可选 category 过滤 + rerank 开关 + rerankFactor 扩展因子）
- `POST /knowledge/upsert` — 写入/更新知识条目（需 X-Internal-Token 认证）
- `POST /knowledge/embed` — 文本向量化（区分 query/passage 模式，限 32 条/次）
- `DELETE /knowledge/entries` — 删除知识条目（需认证）
- `GET /knowledge/stats` — 知识库统计（条目数 + 表名）

**约束：**

- 写入接口（upsert/delete）需要 `X-Internal-Token` 认证（生产环境必须配置，开发环境可跳过）
- 读取接口（search/embed/stats）无需认证（knowledge-server 仅内网可达）
- 返回结果按相关性 score 降序排列
- 单次检索最多返回 5 条结果（避免上下文过载）
- embed 端点限 32 条/次（ONNX 推理内存与 batch size 线性相关）
- 版本号来源优先级：`process.env.BANVASGL_VERSION` > 包导出 version

---

### C9. CI knowledge-guard 验证协议

**📋 已规划** · 依赖 C8

CI 中 knowledge-guard job 执行两个检查：check-knowledge-freshness（重新生成 Primitive Seeds 并 diff，有差异则 fail）和 check-knowledge-impact（分析变更的 Primitive 影响哪些 Composition Seeds，输出 PR comment）。

**决策链：** 开发者可能忘了提交种子更新 -> CI 自动检测是最后防线 -> Primitive 过期是 blocking（直接影响 AI 生成正确性）-> Composition 影响是 non-blocking（需要人工判断是否需要更新）。

**约束：**

- freshness 检查：重新执行所有 Primitive 生成器 -> 输出到临时目录 -> diff 与 seeds/ 目录 -> 有差异则 exit 1
- impact 检查：读取所有 Composition Seeds 的 metadata.dependencies -> 匹配变更的 Primitive ID -> 输出影响列表到 PR comment
- 两个检查独立执行，freshness 失败会 block PR，impact 永远 non-blocking

---

## 服务间通信协议

### C10. xiangdi-server 内部 API 协议（Pull-based 数据拉取）

**✅ 已实施** · 补充 C1

xiangdi-server 通过 BanyanClient 以 HTTP 方式拉取应用数据，请求结束时通过 SSE app_state 事件写回变更。

**实现：** `apps/xiangdi-server/src/banyan/BanyanClient.ts` + `apps/xiangdi-server/src/routes/ai.ts`

请求生命周期：

1. banyan 后端 → xiangdi-server `POST /ai/run`（appId + prompt + previousMessages + images）
2. xiangdi-server 通过 BanyanClient 并行拉取：`GET /internal/apps/:appId/json`（appJSON）、`GET /internal/apps/:appId/schema`（CollectionSchema）、`GET /internal/apps/:appId/functions`（CloudFunctions）
3. 数据加载到 AppRuntimeState（内存对象），Worker 工具在其上读写
4. Orchestrator 图执行完毕后，xiangdi-server 推送 `app_state` SSE 事件（含最终 appJSON + schema + cloudFunctions）
5. banyan 后端收到 app_state 事件后写入 MongoDB

**约束：**

- 认证：BanyanClient 请求携带 `X-Internal-Token` 共享密钥
- 使用原生 `http/https` 模块（无第三方 HTTP 库依赖）
- xiangdi-server 不持有任何业务数据（appJSON 随请求进出，不落盘）
- AppRuntimeState 生命周期 = 单次 HTTP 请求，请求结束即销毁
- banyan 后端是唯一的 MongoDB 写入者（单写者模型，避免分布式一致性问题）

**反例：**

- Push-based 模型（banyan 主动推送全量数据到 xiangdi-server）——context 膨胀，xiangdi-server 可能收到不需要的数据
- xiangdi-server 直连 MongoDB——违反无状态约束，增加部署复杂度，引入分布式写入一致性问题

---

### C11. GraphKnowledgeStore + RetrievalRouter 接口协议

**⚠️ 部分实施** · 扩展 C8

知识检索能力的预留扩展接口：GraphKnowledgeStore 支持基于图关系的知识检索，RetrievalRouter 支持 vector/graph/hybrid 三种策略路由。

**实现：** `packages/xiangdi-agent/src/knowledge/types.ts`（纯接口定义，无运行时实现）

接口设计：

- `GraphKnowledgeStore` — 基于实体-关系图的知识存储（GraphEntity + GraphRelation + SubGraph），支持 getRelated/getSubGraph/analyzeImpact 等图遍历操作
- `RetrievalRouter` — 检索策略路由器，根据 query 特征（精确术语/语义描述/关系查询）选择最优检索路径（vector/graph/hybrid）
- `ImpactAnalysisOptions` — 知识影响分析参数（当某个 Primitive 变更时，哪些 Composition/Convention 受影响）

**约束：**

- 当前仅有接口定义，运行时实现（GraphDB 后端选型、图索引构建、策略路由规则）待后续迭代
- 现阶段 knowledge_search 工具走 C8 的向量+BM25 混合检索路径
- GraphKnowledgeStore 设计目标：支持"CombinedView 有哪些相关的 Composition 知识？"类型的关联查询
- RetrievalRouter 设计目标：LLM 的 knowledge_search 调用不关心底层是向量还是图，Router 根据 query 特征自动选择

**反例：**

- 始终走向量检索——对"某个 ViewType 关联了哪些绑定模式"类型的结构化查询，向量检索召回不稳定
- 手动指定检索策略——增加 LLM 的决策负担，应由 Router 自动路由
