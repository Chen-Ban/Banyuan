# Agent · 协议级决策

> 模块间怎么通信——XiangDi 智能体 + 知识服务的模块间通信协议与数据格式。

---

## 会话模型：Dialogue 作为唯一权威状态机

**未实施**

Dialogue 升格为 Agent 系统的核心数据实体，phase 字段是唯一权威状态机，SSE 事件流是 phase 的实时投影。

**决策链：** 早期设计中状态分散在多处（threadStatus、planningSteps、各种 flag），导致状态不一致和前后端对齐困难。核心洞察：Agent 系统的所有行为都围绕一次对话展开，Dialogue 天然是状态的载体。将 phase 作为唯一状态机后，所有 SSE 事件都可映射为"当前处于哪个 phase + 该 phase 内的增量"，前端消费变得可预测。SSE 不再是"什么都往里塞"的混乱流，而是 phase 状态机的结构化投影。

**约束：**

- Phase 严格单向推进不回退（内部回退在 building phase 内消化，对用户不可见）
- 合法 phase 转移通过显式 PHASE_TRANSITIONS map 校验
- 终态为 done/discarded/failed，不可逆
- Dialogue 链天然形成版本历史（每个 done 的 Dialogue 的 appJSON 是该轮完成后的快照）
- 去掉 baseAppJSON 概念——回退靠 Dialogue 链，不靠快照对比

**反例：**

- "打断恢复"机制（ResumeClassifier + 失效传播）——打断即新对话：用户打断不恢复旧 Dialogue，而是创建新 Dialogue，intent 节点判断从哪续接。彻底消除复杂的中断恢复状态机和过期检测

---

## SSE 事件协议

**未实施**

SSE 事件分 Phase 层（必须处理）和 Detail 层（可选展示），Phase 层驱动进度 UI，Detail 层丰富体验。

**决策链：** 新架构的 phase 以 SubAgent 粒度暴露，前端需要展示"数字员工协作进度"。事件设计需要精简可控——太多事件增加前端复杂度，太少则无法展示进度。分层解决：Phase 层（phase_change/text/done/error）是前端必须处理的核心事件，Detail 层（agent_progress/tool_activity/audit_progress）按展示粒度可选消费。

**约束：**

- Phase 层事件：phase_change（进度推进）、text（流式文本，仅 chat/responding 和 summarize）、done（终态 + artifacts 概览）、error（错误 + recoverable 标记）
- Detail 层事件：agent_progress（SubAgent 开始/完成/失败）、tool_activity（think<->tools 循环细节）、audit_progress（审计状态）
- app_snapshot 保留——前端 Worker 每次 patchProjection 后推送画布快照，用户看到画布逐步成型
- 退役事件：tool_call/tool_result（替换为 tool_activity 高层抽象）、app_snapshot 的旧语义（不再是全量覆盖，而是 patch 后的当前状态）、disambiguation（无消歧事件）

---

## Spec 协议：ProjectSpec + ChangeSpec 作为引擎一等公民

**✅ 已实施**

Spec 是 Agent 系统的一等架构概念——ProjectSpec 描述全局约束，ChangeSpec 描述本轮变更意图，两者驱动整个执行流程。

**决策链：** Agent 需要一种结构化的方式描述"用户想要什么"和"系统应该做什么"。自然语言太模糊、代码太具体，Spec 处于两者之间——结构化但可读。ProjectSpec 是持久的全局约束（品牌色、业务领域、技术偏好），ChangeSpec 是本轮对话的变更描述（新增哪些功能、修改哪些页面）。在新架构中，Spec 的角色演化为：ProjectSpec 信息融入 AppSystemPrompt，ChangeSpec 的功能被 StructuredRequirements + UIDesignSpec + IntegrationContract 三个规划产物替代（粒度更细、可校验性更强）。

**约束：**

- ProjectSpec 随应用持久化，跨对话有效
- ChangeSpec / 规划产物（requirements/uiDesign/contract）是本轮对话产物，存储在 Dialogue.planningEntries 中
- 规划产物全部经过 Zod schema 验证，格式错误在 SubAgent 内部重试修复

---

## SubAgent 统一协议

**✅ 已实施**

所有 SubAgent（规划型和执行型）遵循统一的输入/输出/注册协议，Orchestrator 的调度逻辑完全通用。

**决策链：** 统一管线要求 Orchestrator 用相同方式调度不同类型的 SubAgent。设计 SubAgentDescriptor 声明式注册（name/role/mode/dependencies/outputSchema/tools），统一输入接口（SubAgentInput：userMessage + artifacts + agentMemory + conversationContext + auditFeedback），统一输出接口（SubAgentOutput：artifact + reasoning + metadata）。Orchestrator 根据 dependencies 自动从 ArtifactStore 提取前序工件组装输入，收到输出后验证 Zod schema 并写入 ArtifactStore。

**约束：**

- SubAgent 只能读取 dependencies 声明的前序工件
- SubAgent 只能写入自己的工件槽
- 规划型 mode='planning'：0~2 轮只读工具调用 + 结构化输出，验证失败内部重试 <= 3 次
- 执行型 mode='execution'：多轮 think<->tools 循环（<= maxIterations），通过写入工具产生副作用
- 错误分层处理：output_validation/tool_execution(幂等)/llm_call 在 SubAgent 内部消化，tool_execution(非幂等)/硬超时上报 Orchestrator

---

## 多 Agent 上下文拉取 API

**未实施**

ContextProvider 接口是 SubAgent 消费上下文的统一入口，SubAgent 声明需要哪些上下文维度，Provider 按需组装。

**决策链：** Push 模式下所有 SubAgent 收到相同的全量上下文，导致 context 膨胀。Pull 模式：SubAgent 通过 ContextProvider.get(dimensions) 声明需要哪些切片（如 requirements SubAgent 需要 'userMessage' + 'agentMemory'，不需要 'existingPages' 和 'existingSchema'），Provider 只组装声明的部分。

**约束：**

- ContextProvider 是无状态接口，每次调用根据当前 ArtifactStore + 数据源实时组装
- 维度可用集合：userMessage / agentMemory / conversationContext / existingPages / existingSchema / existingFunctions / knowledge(query) / auditFeedback
- 每个 SubAgent 在 descriptor 中声明所需维度，Orchestrator 调度时自动调用 Provider

---

## 工具集协议（三层结构）

**✅ 已实施**

工具按职责分为三层：共享只读层（感知现状）、前端 Worker 写入层、后端 Worker 写入层。每个 SubAgent 只能使用白名单内的工具。

**决策链：** 旧工具集（21 个工具、6 个分组）为统一执行器设计，未映射新五 SubAgent 架构，存在冗余工具、命名不统一、工具里藏 LLM 等问题。新设计精简到 12 个工具，按领域严格隔离。前端 Worker 写入粒度为"整页"（write_page 一次写入完整 AIProjectionScene），后端 Schema 保持全量替换语义（write_schema 一次写入完整集合列表）。

**约束：**

- 共享只读工具：read_pages / read_schema / read_cloud_functions / knowledge_search / web_search
- 前端专属工具：write_page / create_page / delete_page / material_search / material_get_detail
- 后端专属工具：write_schema / write_cloud_function / delete_cloud_function
- 统一命名风格：动词_名词，去掉 banvas_ 前缀
- SubAgent<->工具白名单：requirements 仅 web_search；uiDesign 可用 web_search/knowledge_search/read_pages；contract 可用 knowledge_search/read_schema/read_cloud_functions；frontend/backend 各自的只读+写入工具
- respond 路径（chat 类型）：全部只读工具，不做任何写入

**反例：**

- 节点级写入工具（add_node/update_node/delete_node/resize_node/move_node）——整页写入减少工具调用轮次（从 20+ 次降到 1 次/页），与 patchProjection 语义对齐，幂等性天然保证
- banvas_apply_patch 事务——新架构每页独立 patchProjection 已是原子写入，不存在跨页面中间状态
- generate_cloud_function/update_cloud_function——工具里藏 LLM 的反模式，后端 Worker 自身生成 FlowSchema

---

## 知识种子数据格式协议

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

## knowledge-server HTTP 检索协议

**✅ 已实施**

knowledge-server 暴露 POST /api/knowledge/search 接口。请求体包含 query（检索文本）、version（BanvasGL 版本号）、可选的 domain 过滤。返回 Top-K 结果列表（content + score + metadata）。

**决策链：** XiangDi 通过 Tool 调用检索知识 -> 需要 HTTP 接口 -> POST 因为 query 可能较长 -> version 必填确保版本隔离 -> domain 过滤让 LLM 可以精准检索特定领域知识。

**约束：**

- 写入接口（POST /api/knowledge/upsert）需要 KNOWLEDGE_INTERNAL_TOKEN 认证
- 读取接口无需认证（knowledge-server 仅内网可达）
- 返回结果按相关性 score 降序排列
- 单次检索最多返回 5 条结果（避免上下文过载）

---

## CI knowledge-guard 验证协议

**未实施**

CI 中 knowledge-guard job 执行两个检查：check-knowledge-freshness（重新生成 Primitive Seeds 并 diff，有差异则 fail）和 check-knowledge-impact（分析变更的 Primitive 影响哪些 Composition Seeds，输出 PR comment）。

**决策链：** 开发者可能忘了提交种子更新 -> CI 自动检测是最后防线 -> Primitive 过期是 blocking（直接影响 AI 生成正确性）-> Composition 影响是 non-blocking（需要人工判断是否需要更新）。

**约束：**

- freshness 检查：重新执行所有 Primitive 生成器 -> 输出到临时目录 -> diff 与 seeds/ 目录 -> 有差异则 exit 1
- impact 检查：读取所有 Composition Seeds 的 metadata.dependencies -> 匹配变更的 Primitive ID -> 输出影响列表到 PR comment
- 两个检查独立执行，freshness 失败会 block PR，impact 永远 non-blocking
