# ADR-041：Orchestrator + 领域 SubAgent 统一管线

**状态**：已决策  
**决策日期**：2026-06  
**决策者**：Banyuan 核心团队  
**取代**：ADR-032（规划阶段 Multi-Agent 分层架构）  
**影响**：ADR-039（会话模型 phase 状态机需要相应调整）

---

## 背景

### 当前架构的结构性矛盾

ADR-032 将 Agent 管线划分为"规划阶段（Plan）"和"执行阶段（Execute）"两大区段：

```
当前：Plan 阶段四个 Subagent → ChangeSpec → Execute 阶段统一执行器 → 工具调用
```

这个"先全想清楚再动手"的假设在引入云函数和数据表生成后暴露出三个结构性问题：

**问题一：Execute 阶段认知断裂。**

云函数生成当前被实现为一个"工具里藏了小 Agent"的模式——`generate_cloud_function` 工具内部发起独立 LLM 调用，用一个 170 行的内嵌 system prompt（`FLOW_SCHEMA_SYSTEM_PROMPT`）指导子 LLM 生成 FlowSchema。这导致：

- 主 Agent 在 execute 阶段积累的完整上下文（用户意图、已生成的视图结构、已有数据表、前面的修改历史）全部丢失，子 LLM 只拿到一句 description + appSchema
- 前端视图的 callFlow 绑定点和后端云函数的实现之间缺乏认知连续性——它们本应是同一个决策过程的两个产物
- 违背了工具的本质定位：工具应该是确定性操作（执行 Agent 已决策好的动作），而非再做一次决策

**问题二：Plan 与 Execute 的刚性边界阻碍回退。**

当 Execute 阶段的前端 Agent 发现数据契约不合理，或后端 Agent 发现需求有歧义时，当前架构只能在 audit 节点做"重试 execute"。无法精确回退到"契约定义有问题，需要返回架构设计重来"——因为 Plan 阶段已经结束了，它的上下文已经丢失。

**问题三：前后端生成混在统一执行器中。**

Execute 阶段的 HarnessRunner 逐个执行 ChangeSpec 任务，不区分任务的领域属性。前端视图生成和后端云函数生成有本质不同的知识需求、验证标准和上下文依赖，混在一起执行导致：

- 前端 Agent 不需要理解 FlowSchema 节点规范，但它的 context window 里可能塞了这些信息
- 后端 Agent 不需要理解 AIProjection 的 decoration 格式，但它共享相同的执行环境
- 两者之间的数据依赖（前端的 callFlow 引用后端的函数 ID、后端的 dbCRUD 引用数据表字段）缺乏显式管理

### 根本原因

Plan/Execute 的二阶段划分假设"规划可以一次性完成"——但实际的应用生成是一个迭代过程，每个领域 Agent 在执行时都可能发现前序阶段的决策有问题。需要一个更灵活的流程控制模型，允许精确回退到任意前序节点。

### 业界参考

本决策参考了三种业界主流多智能体编排模式的优势并进行融合：

- **Supervisor 模式**（LangGraph）：集中协调者统一路由，流程可预测、可观测。Orchestrator 承担此角色。
- **Orchestrator-Worker 模式**（Anthropic Research 系统）：Lead Agent 协调，Worker 并行执行各自独立 context window。前后端 Worker 并行执行采用此模式。Anthropic 的数据表明 token 使用量解释了 80% 的性能方差，多 Agent 的核心价值是扩展 token 预算让每个 Agent 在精炼的 context 中深度推理。
- **SOP 流水线模式**（MetaGPT）：角色间通过结构化中间产物通信，大幅减少幻觉和信息丢失。规划型 SubAgent 的串行流水线采用此模式。

核心设计原则来自 Anthropic *Building Effective Agents*："最成功的实现都用了简单、可组合的模式，而不是复杂的框架。"

---

## 决策

### 废弃 Plan/Execute 二阶段划分，改为 Orchestrator + 领域 SubAgent 统一管线

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
                              └──────┬──────┘
                                     ▼
                                    END
```

### 核心原则

1. **统一 SubAgent 协议**：所有节点（规划型和执行型）都是 SubAgent，遵循统一的输入/输出协议。区别仅在于执行型 SubAgent 内部有 Agentic Loop（多轮 think↔tools），规划型通常单次 LLM 调用产出结构化文档。
2. **全流程自动执行，无 humanGate**：Banyuan 是零代码平台，用户不是开发者，给用户看契约和方案没有意义。全程自动执行，用户的验收点在最终结果交付之后。
3. **intent 节点自由路由，无强制起始点**：不强制所有 task 从 requirements 开始。intent 节点根据用户消息语义和当前流程状态，决定从流水线的哪个位置开始执行——可以是任意 SubAgent，包括直接从 frontend 或 backend 开始（适用于"把按钮改成蓝色"这类纯执行型修改，无需经过三个规划节点）。SOP 流水线是能力的全集，intent 是使用多少能力的路由决策者。**注意**：前提是相应的前序工件必须已存在（从历史 Dialogue 恢复）或不需要（如用户明确指定纯样式修改，无数据/云函数变动）；若缺少前序工件，intent 应回退到相应上游节点起始。
4. **SOP 内部严格单向流动**：需求解析 → UI 设计 → 契约定义 → 前后端并行 → 审计。节点之间不允许中途回退，回退统一由审计失败后 Orchestrator 仲裁触发。
5. **LLM 驱动路由，不用规则引擎**：用户 prompt 千变万化，规则覆盖率低且极容易出错。intent 和 Orchestrator 的路由判断统一用 LLM，简单干净。
6. **领域分离，context 精炼**：前端 Worker 不需要理解 FlowSchema，后端 Worker 不需要理解 AIProjection。各自在独立 context window 中深度推理。

### chat 与 task 的关系

chat 和 task 由前端 UI 在发起请求时通过 `type` 字段定死：

```
前端请求 type=chat → respond 节点（LLM + 只读工具）→ 总结/记忆
前端请求 type=task → intent → Orchestrator → SOP 流水线
```

两条路径共享同一个会话上下文（对话历史、Agent 记忆、应用状态），用户在 chat 中积累的信息（如"我想做一个蓝色主题的应用"）会进入记忆，后续 task 时可以被引用。

### intent 节点：流程续接判断

intent 节点的职责不是判断"这是 chat 还是 task"（这由前端 type 字段决定），而是在 task 路径上判断：**这条消息相对于当前流程状态，应该从流水线的哪个位置开始执行？**

| 场景 | intent 输出 |
|------|------------|
| 无历史流程状态，新任务 | → Orchestrator，从 requirements 开始 |
| 有历史状态，用户说"继续" / 带补充信息 | → Orchestrator，从中断点续接 |
| 有历史状态，用户说"重来" / 完全不同的新需求 | → Orchestrator，从 requirements 重跑 |
| 有历史状态，用户说"数据表设计不对" | → Orchestrator，从 contract 回退重跑 |
| 有历史状态，用户说"UI 布局换一种" | → Orchestrator，从 ui_design 回退重跑 |
| 有历史状态，用户说"需求理解错了" | → Orchestrator，从 requirements 回退重跑 |
| 有历史状态，纯样式/布局调整，无数据/云函数变动，且历史工件完整 | → Orchestrator，直接从 frontend 开始 |
| 有历史状态，仅后端逻辑修改（如查询条件调整），且历史契约仍有效 | → Orchestrator，直接从 backend 开始 |

**直接路由到 Worker 的前提条件**：intent 判断可以跳过规划节点，当且仅当：①历史 Dialogue 中存在完整的前序工件（requirements / uiDesign / contract 均 done）；②用户诉求明确不涉及需求变更或契约变更。若两个条件有一个不满足，intent 应回退到相应上游节点起始，不得跳过。

intent 的 LLM 判断依据：当前流程状态（哪些节点已完成、各阶段产出摘要）+ 用户新消息。输出：目标起始节点 + 用户消息中的修正要点（如有）。

### 五个 SubAgent 的职责定义

所有 SubAgent 遵循统一协议，分为规划型和执行型两种执行模式：

- **规划型**：单次 LLM 调用 → 结构化输出（Zod schema 验证）
- **执行型**：多轮 think↔tools 循环 → 工具调用产生副作用 → 结构化输出

#### 1. 需求解析（规划型）

**角色**：产品经理  
**输入**：用户原始诉求 + 对话历史 + Agent 记忆  
**输出**：`StructuredRequirements`（功能列表 + 用户故事 + 约束条件）  
**工具**：`web_search`（调研竞品交互模式、行业惯例、用户习惯）  
**回退到此的触发条件**：审计发现需求本身有歧义或矛盾

#### 2. UI 设计（规划型）

**角色**：视觉设计师  
**输入**：StructuredRequirements + 应用已有风格摘要  
**输出**：`UIDesignSpec`（页面结构草案 + 交互流程 + 视觉规格）  
**工具**：`web_search`（搜索设计趋势、参考 UI、对标产品设计）、`knowledge_search`（BanvasGL 能力边界）、`read_pages`（现有页面结构）  
**回退到此的触发条件**：审计发现交互模式与 BanvasGL 能力不兼容

#### 3. 契约定义（规划型）

**角色**：全栈架构师  
**输入**：StructuredRequirements + UIDesignSpec  
**输出**：`IntegrationContract`（数据表 Schema + 云函数签名 + 事件绑定映射）  
**工具**：`knowledge_search`（FlowSchema 节点类型规范）、`read_schema`（现有数据模型）、`read_cloud_functions`（现有云函数）  
**回退到此的触发条件**：审计发现前后端契约不一致、字段类型不匹配、函数签名缺失

在 BanvasGL 的固定技术栈约束下（视图层 = AIProjection，逻辑层 = FlowSchema，数据层 = 动态集合），"架构设计"和"契约定义"是同一件事——没有技术选型空间，真正需要决策的就是数据怎么组织、云函数怎么划分、前端怎么调用后端。这些决策的产物就是契约本身。

契约是前后端 Worker 并行执行的前提——双方的对齐基准。

#### 4. 前端 Worker（执行型）

**角色**：前端工程师  
**输入**：IntegrationContract + UIDesignSpec  
**输出**：`FrontendArtifacts`（按页面粒度的视图结构 + 客户端 FlowSchema）  
**知识需求**：BanvasGL 能力体系（知识种子检索）  
**工具**：`knowledge_search`、`read_pages`、`write_page`、`create_page`、`delete_page`、`material_search`、`material_get_detail`  
**执行模式**：多轮 think↔tools 循环，独立 context window

**执行粒度：页面级逐一处理**

前端 Worker 虽然是单一 Agent 实例，但内部按页面粒度逐一执行：先完成 page A 的视图生成并写入，再处理 page B。这一设计基于以下考量：

- **Context 控制**：每次工具读取只加载当前操作页面的 AIProjection（而非全量 scenes），避免大应用的 context 膨胀
- **数据兼容**：`FrontendArtifacts.pages` 按页面独立组织，未来如果拆为多个 Page Worker 并行，数据结构无需变更
- **跨页一致性**：单一 Agent 内部处理天然保证跨页面风格一致，无需额外的 Coordinator Agent

前端 Worker 的工具操作是 **patch 语义**——只写入当前操作页面的 AIProjectionScene，不覆盖其他页面，也不覆盖 App 级元数据（lifetimes 等）。具体机制见下方「Projection 层 patch 语义」章节。

**回退到此的触发条件**：审计发现前端视图与契约不匹配（如 callFlow 引用不存在的函数 ID）、或视觉实现与 UIDesignSpec 偏差过大

#### 5. 后端 Worker（执行型）

**角色**：后端工程师  
**输入**：IntegrationContract + StructuredRequirements  
**输出**：`BackendArtifacts`（CollectionSchema + CloudFunctionEntry[]）  
**知识需求**：FlowSchema 节点类型规范 + 数据建模规范  
**工具**：`knowledge_search`、`read_schema`、`read_cloud_functions`、`write_schema`、`write_cloud_function`、`delete_cloud_function`  
**执行模式**：多轮 think↔tools 循环，独立 context window

### 前后端并行执行

契约定义完成后，前端 Worker 和后端 Worker 并行启动。双方依赖的是契约中的接口定义（函数签名 + 数据表结构），不依赖对方的实现细节。

```
契约定义完成
    ├──▶ 前端 Worker（并行，独立 context）
    └──▶ 后端 Worker（并行，独立 context）
              ├──▶ 双方完成后 → 汇合 → 审计
```

如果其中一个 Worker 失败（如 LLM 超时），仍然等待另一个完成，统一进入审计。审计结果中会说明哪个 Worker 失败，Orchestrator 据此决定只重跑失败的 Worker。

### 审计节点

**角色**：质量检查  
**输入**：前端产出 + 后端产出 + IntegrationContract  
**输出**：pass / fail（含 failReason + 建议回退目标）

**校验内容**：

- 前端 callFlow 引用的函数 ID 在后端产出中是否存在
- 后端 dbCRUD 引用的集合和字段在 CollectionSchema 中是否存在
- AIProjection 是否通过 `fromAIProjection()` 验证
- FlowSchema 结构是否合法（节点连接完整性、无孤立节点）
- 需求完整性：用户要求的功能是否都已体现
- Worker 执行状态：是否有 Worker 失败未产出

**执行方式**：程序化校验（零 token）+ LLM 校验（语义层面）。程序化校验能覆盖的不消耗 token。

### Orchestrator 的职责

Orchestrator 是管线的中枢，负责两件事：

**1. 工件管理**

所有 SubAgent 的产出（工件/artifacts）存储在 Orchestrator 管理的共享状态中。每个 SubAgent 可以读取所有前序节点的工件，但只能写入自己的工件槽。回退时，目标节点及其后续节点的工件被清空。

```typescript
interface OrchestratorState {
  artifacts: {
    requirements?: StructuredRequirements
    uiDesign?: UIDesignSpec
    contract?: IntegrationContract
    frontendOutput?: FrontendArtifacts
    backendOutput?: BackendArtifacts
    auditResult?: AuditResult
  }
  currentNode: string
  history: NodeExecution[]
  rollbackCount: number
}
```

**2. 回退仲裁（审计失败时）**

审计失败时，Orchestrator 用 LLM 判断应该退到哪个节点：

```
输入：audit failReason + 当前工件快照摘要
输出：目标回退节点（requirements / ui_design / contract / frontend / backend）
```

回退后的行为：
- 清空目标节点及其后续所有节点的工件
- 将 audit 的 failReason + hint 注入目标节点的输入（作为增量修正依据）
- 从目标节点开始重跑后续全链

**硬上限**：总回退次数 ≤ 3，超过直接终止流程报 failed。

### 回退触发的两个来源

| 来源 | 触发方式 | 仲裁者 |
|------|---------|--------|
| 审计失败 | 审计节点输出 fail | Orchestrator LLM 仲裁 |
| 用户反馈 | 用户在结果交付后发新消息表达不满 | intent 节点 LLM 判断 |

两者最终都通过 Orchestrator 执行回退——清空工件、注入修正信息、从目标节点重跑。

### 总结节点

**角色**：摘要生成  
**输入**：全部节点产出  
**输出**：用户可读的变更摘要 + 记忆提取  
**归属**：committing 阶段的内部动作，不作为独立 phase 暴露给用户

---

## 对 ADR-039 会话模型的影响

### Dialogue Phase 状态机重新设计

新架构下 Dialogue 的 phase 状态机以 SubAgent 为粒度，对用户呈现为"数字员工"的工作进度：

```
task 路径:
  start → requirements → ui_design → contract → building → awaiting_confirm → committing(含总结) → done

chat 路径:
  start → responding(含总结) → done

终态: done / discarded / failed
```

**Phase 语义**：

| Phase | 用户感知 | 内部动作 |
|-------|---------|---------|
| `start` | 准备中 | 组装上下文、调用 intent 判断起始节点 |
| `requirements` | 需求分析中 | 需求解析 SubAgent 执行 |
| `ui_design` | 设计中 | UI 设计 SubAgent 执行 |
| `contract` | 架构中 | 契约定义 SubAgent 执行 |
| `building` | 构建中 | 前后端 Worker 并行 + 审计 + 可能的内部回退重跑 |
| `awaiting_confirm` | 待验收 | 结果已生成，等待用户确认应用 |
| `committing` | 提交中 | 总结节点 + 数据持久化（appJSON/collections/cloudFunctions → Application 表） |
| `done` | 完成 | 终态 |
| `responding` | 回答中 | chat 路径：LLM + 只读工具 + 总结 |
| `discarded` | 已放弃 | 用户打断或拒绝验收 |
| `failed` | 失败 | 不可恢复错误（含回退次数耗尽） |

**合法转移矩阵**：

```typescript
const PHASE_TRANSITIONS = {
  // start 可跳到任意工作 phase——intent 节点可能判断从任意位置续接/回退
  start:             ['requirements', 'ui_design', 'contract', 'building', 'responding', 'failed'],
  requirements:      ['ui_design', 'failed', 'discarded'],
  ui_design:         ['contract', 'failed', 'discarded'],
  contract:          ['building', 'failed', 'discarded'],
  building:          ['awaiting_confirm', 'failed', 'discarded'],
  awaiting_confirm:  ['committing', 'discarded'],
  committing:        ['done', 'failed'],
  responding:        ['done', 'failed', 'discarded'],
  done:              [],
  discarded:         [],
  failed:            [],
}
```

**关键设计决策**：

1. **Phase 严格单向推进，不回退。** 审计失败导致的内部回退（如从 building 退回 contract 重跑）全部在 `building` phase 内部消化。用户感知到的是"构建中"持续了较长时间，而非"出错了在重跑"。这是刻意的体验设计——用户不需要知道系统内部的纠错过程。

2. **`building` phase 封装了执行层的全部复杂性。** 包含：前后端 Worker 并行执行、审计校验、回退仲裁、重跑。对外只暴露最终结果（pass 进入 awaiting_confirm，或回退次数耗尽进入 failed）。

3. **`awaiting_confirm` 是用户验收关卡。** 全流程自动执行完毕后，结果暂存在 Dialogue 中（appJSON/collections/cloudFunctions），用户在前端看到预览效果，确认"应用变更"后才触发 committing 持久化到 Application 表。用户也可以拒绝（→ discarded），然后发新消息触发修正。

### 去掉 baseAppJSON 概念

**决策**：Dialogue 不再存储 `baseAppJSON`（执行前基线快照）。

**理由**：每个 done 状态的 Dialogue 的 `appJSON` 字段本身就是该轮对话完成后的应用状态快照。如果用户需要回退到某个历史版本，直接取对应 Dialogue 的 appJSON 即可——Dialogue 链天然形成版本历史。

**回退机制**：
- 用户拒绝验收（awaiting_confirm → discarded）：当前 Dialogue 的产出被丢弃，Application 表不变，等同于"什么都没发生"
- 用户想回退到更早的版本：通过新一轮对话表达意图（如"回到上一个版本"），intent 节点识别后从最近的 done Dialogue 恢复 appJSON

### Dialogue 字段变更

```typescript
interface IDialogueDoc {
  // ─── 身份 ───
  appId: string
  conversationId: ObjectId
  type: 'chat' | 'task'
  phase: DialoguePhase              // 唯一权威状态机

  // ─── 消息流 ───
  messages: IMessage[]

  // ─── 应用快照（本轮产出，未持久化到 Application 表）───
  appJSON?: string                  // 前端 Worker 产出的视图结构
  collections?: ICollectionSnapshot[]  // 后端 Worker 产出的数据表
  cloudFunctions?: ICloudFunctionSnapshot[]  // 后端 Worker 产出的云函数

  // ─── 规划产物（三个规划型 SubAgent 的结构化输出）───
  planningEntries: IPlanningEntry[]  // requirements / uiDesign / contract

  // ─── Agent 记忆暂存 ───
  memoryUpdates?: MemoryUpdateInput

  // ─── 摘要（ContextBuilder 检索锚点）───
  summary?: IDialogueSummary
  embedding?: number[]

  // ─── 中断归因 ───
  interruptMetadata?: IInterruptMetadata

  createdAt: Date
  updatedAt: Date
}
```

**去掉的字段**：
- `baseAppJSON`：不再需要，回退靠 Dialogue 链
- `planningFailedAgent`：回退不暴露给用户，失败信息在 phase=failed 时通过 messages 传达

**保留的字段**：
- `planningEntries`：存储三个规划型 SubAgent 的结构化产出（StructuredRequirements / UIDesignSpec / IntegrationContract），供 ContextBuilder 在后续对话中检索使用
- `appJSON/collections/cloudFunctions`：暂存本轮产出，confirm 后才写入 Application 表

### 数据流转（事前验收模型）

```
1. 用户发 task 消息 → 创建 Dialogue(phase=start)
2. ContextBuilder 从历史 Dialogues 构建五层上下文 → 传给 XiangDi
3. XiangDi SOP 流水线执行（phase 随 SubAgent 推进：requirements → ui_design → contract → building）
4. 执行完毕 → phase=awaiting_confirm，产出暂存在 Dialogue 中
5. 前端展示预览效果，用户验收：
   - 确认 → phase=committing → 总结节点 + 持久化到 Application 表 → phase=done
   - 拒绝 → phase=discarded，Application 表不变
6. 用户不满意发新消息 → 新 Dialogue，intent 判断从哪个节点开始修正
```

**关键不变量**：Application 表只在 committing 阶段被写入，且仅当用户确认后。任何时刻 Application 表中的数据都是用户验收过的最新版本。

### ContextBuilder 的适配

ContextBuilder 的核心逻辑不变（混合检索 + token 预算），但检索单元从"整个 Dialogue 的 summary"扩展为可以检索 `planningEntries` 中的结构化产物。这使得后续对话可以引用前序对话的需求分析、设计方案、契约定义——而不仅仅是一句自然语言摘要。

---

## 对 ADR-032 的取代

ADR-032 的核心决策（将规划拆分为 PMAgent/ArchAgent/VisualAgent/TaskPlannerAgent 四个角色）被精简重组：

- PMAgent → 需求解析 SubAgent
- VisualAgent → UI 设计 SubAgent
- ArchAgent + TaskPlannerAgent → 契约定义 SubAgent

**本质变化**：

1. 这些角色从"Plan 阶段的内部子步骤"提升为"与 Worker 平级的一等 SubAgent"，可以被审计回退触达
2. 架构设计不再作为独立阶段存在——在固定技术栈下，架构决策的产物就是契约本身
3. 去掉了 humanGate——全流程自动执行，验收点后移到最终结果交付

### 对 intent 节点的重新定位

当前 intent 节点做 chat/task 分类（规则优先 + LLM fallback）。新架构中：

- chat/task 分类由前端 `type` 字段决定，不需要 intent 判断
- intent 节点重新定位为**流程续接判断**：在 task 路径上，判断用户消息应该从流水线的哪个位置开始执行（新任务/续接/回退到某节点/重跑）
- 实现方式：纯 LLM 判断（不用规则引擎，因为用户 prompt 千变万化，规则覆盖率低且容易出错）

### Projection 层 patch 语义（修复 App 级 lifetimes 丢失）

**问题**：当前 `projectionToAppJSON(scenes, version)` 在还原 appJSON 时硬编码 `lifetimes: { onLaunch: null, onUnlaunch: null }`。这意味着如果应用已设置了 App 级生命周期（如"启动时初始化数据"），经过 AI 操作一轮 roundtrip 后，App 级 lifetimes 会被清空——数据丢失。

**根因**：`AIProjectionScene[]` 只建模了 Scene（页面）级别数据，没有建模 App 级元数据。当 `projectionToAppJSON` 从 scenes 数组重建 appJSON 时，缺少 App 级 lifetimes 的来源。

**决策**：引入 patch 语义的写入接口，替代当前的全量覆盖。

```typescript
/**
 * Patch 语义写入：只更新指定页面的 AIProjection，保留其他页面和 App 级元数据不变。
 *
 * 这是前端 Worker 工具操作的核心写入方式。
 */
export async function patchProjection(
  adapter: BanvasHostAdapter,
  patches: PagePatch[],
  version: string,
): Promise<void> {
  // 1. 读取当前完整 appJSON
  const currentAppJSON = await adapter.getAppJSON()
  const appSerialized: SerializedData = currentAppJSON
    ? JSON.parse(currentAppJSON)
    : { type: 'APP', version, data: { lifetimes: { onLaunch: null, onUnlaunch: null }, scenes: [] }, metadata: {} }

  // 2. 按 pageId patch 指定页面，保留其他页面和 App 级字段（lifetimes 等）不变
  for (const patch of patches) {
    if (patch.operation === 'upsert') {
      const sceneData = fromAIProjection(patch.scene, version).data
      const idx = findSceneIndex(appSerialized.data.scenes, patch.pageId)
      if (idx >= 0) {
        appSerialized.data.scenes[idx] = sceneData    // 更新已有页面
      } else {
        appSerialized.data.scenes.push(sceneData)     // 新增页面
      }
    } else if (patch.operation === 'delete') {
      appSerialized.data.scenes = appSerialized.data.scenes.filter(
        (s: any) => s.$value?.id !== patch.pageId
      )
    }
  }

  // 3. App 级 lifetimes 原样保留（不覆盖）
  // appSerialized.data.lifetimes 保持读取时的值

  // 4. 写回
  appSerialized.metadata = { timestamp: Date.now(), source: 'AI Projection (patch)' }
  await adapter.setAppJSON(JSON.stringify(appSerialized))
}

interface PagePatch {
  pageId: string
  operation: 'upsert' | 'delete'
  scene?: AIProjectionScene             // upsert 时必填
}
```

**对现有接口的影响**：

- `readProjection(adapter)` 保持不变——仍返回 `AIProjectionScene[]`，供 Agent 读取
- `writeProjection(adapter, scenes, version)` 保留但标记为**仅用于全新应用创建**（从空 appJSON 开始）
- `patchProjection(adapter, patches, version)` 为新增接口，前端 Worker 的写入工具统一使用此接口

**与页面级执行的配合**：前端 Worker 按页面逐一处理，每完成一个页面调用 `patchProjection([{ pageId, operation: 'upsert', scene }])` 写入。这与未来拆为多个 Page Worker 的写入方式完全一致——每个 Worker 独立 patch 自己负责的页面。

### 对知识体系的影响（ADR-040）

后端 Worker 直接生成 FlowSchema 和 CollectionSchema（不再委托给工具内的子 LLM），意味着：

- 后端 Worker 需要通过知识检索获取 FlowSchema 节点类型规范和 CollectionSchema 字段类型规范
- 当前 `FLOW_SCHEMA_SYSTEM_PROMPT`（170 行内嵌 prompt）应迁移为后端 Worker 的 system prompt 组成部分或独立知识种子
- 知识消费统一走 Tool 模式（`knowledge_search`），保持 Prompt Cache 命中率

### 对工具层的影响（工具集整体重新设计）

#### 设计动机

当前工具集（21 个工具，6 个分组）存在以下结构性问题：

1. **为旧 MasterGraph 设计，未映射新五 SubAgent 架构**：旧架构只有一个统一执行阶段，所有工具混在一起由同一个 Agent 调用；新架构需要按 SubAgent 职责精确划分工具边界
2. **冗余工具浪费 LLM 选择注意力**：`banvas_resize_node`（= `update_node` 的 patch size）、`banvas_move_node`（= `update_node` 的 patch transform）是快捷别名，增加工具列表认知噪音
3. **`banvas_apply_patch` 事务语义在新架构下无意义**：新架构每页独立操作（`patchProjection` 已是原子写入），不存在跨页面中间状态不一致
4. **工具里藏 LLM 的反模式**：`generate_cloud_function` / `update_cloud_function` 内部发起独立 LLM 调用，违背"工具=确定性操作"原则
5. **缺乏后端 Worker 必需的工具**：没有读取已有云函数的工具、没有绑定事件的工具
6. **`explain_cloud_function` 无法使用**：没有对应的读取工具，Agent 拿不到 FlowSchema 来解释
7. **工具命名风格不统一**：`banvas_` 前缀 vs 无前缀混用

#### 退役工具

| 工具 | 退役原因 |
|------|---------|
| `banvas_resize_node` | `update_node({ patch: { size } })` 的纯语法糖，增加工具列表噪音 |
| `banvas_move_node` | `update_node({ patch: { transform: { x, y } } })` 的纯语法糖 |
| `banvas_apply_patch` | 新架构每页独立 patchProjection，不需要跨操作事务 |
| `generate_cloud_function` | 工具里藏 LLM 的反模式；后端 Worker 自身生成 FlowSchema |
| `update_cloud_function` | 同上 |
| `explain_cloud_function` | 无读取工具配套，且 LLM 自身可读懂 FlowSchema JSON |

#### 新工具集设计（三层结构）

按职责分为三层：共享只读层（感知现状）、前端 Worker 写入层、后端 Worker 写入层。

**Layer 1：共享只读工具（所有 SubAgent 可按需使用）**

| 工具 | 用途 | 输入 | 输出 | 合并来源 |
|------|------|------|------|---------|
| `read_pages` | 读取页面结构 | `pageId?`, `detail: 'tree'│'full'` | tree 模式=精简层级，full 模式=完整 AIProjection | 合并 `banvas_get_app_state` + `get_pages` + `get_page_tree` |
| `read_schema` | 读取数据模型 | `collectionName?` | 集合+字段定义 | 合并 `schema_get` + `get_existing_schema` |
| `read_cloud_functions` | 读取已有云函数 | `functionName?` | 函数列表含 FlowSchema | **新增**（修复旧工具体系缺失） |
| `knowledge_search` | 检索 BanvasGL 知识库 | `query`, `category?`, `topK?` | 知识块 | 保留不变 |
| `web_search` | 搜索互联网获取业界知识 | `query`, `maxResults?` | 搜索结果 | 保留不变 |

**`web_search` 定位说明**：`knowledge_search` 获取 BanvasGL 底层能力边界和格式知识（"怎么在我们平台上实现"），`web_search` 获取业界产品/设计/交互领域知识（"业界是怎么做的"）。两者正交互补：需求 SubAgent 用 `web_search` 调研竞品交互模式，设计 SubAgent 用 `web_search` 搜索设计趋势和参考，契约 SubAgent 用 `knowledge_search` 确认平台能力边界。

**Layer 2：前端 Worker 专属工具**

| 工具 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `write_page` | 写入一个页面的完整 AIProjection | `pageId`, `scene: AIProjectionScene` | `{ success, message }` |
| `create_page` | 新建空白页面 | `name`, `width?`, `height?`, `backgroundColor?` | `{ pageId, message }` |
| `delete_page` | 删除页面 | `pageId` | `{ success, message }` |
| `material_search` | 搜索可复用 UI 物料 | `query`, `limit?` | 物料摘要列表 |
| `material_get_detail` | 获取物料完整参数 | `material_id` | 物料详情 |

**核心决策——前端 Worker 写入粒度为"整页"**：

不再提供 `add_node` / `update_node` / `delete_node` 节点级工具。前端 Worker 在 think 阶段构思完一整页的视图结构，通过 `write_page` 一次性写入完整 `AIProjectionScene`。理由：

1. **减少工具调用轮次**：节点级操作一个表单页要 20+ 次工具调用（每个控件一次），整页写入只需 1 次
2. **与 patchProjection 语义对齐**：底层实现就是 `patchProjection([{ pageId, operation: 'upsert', scene }])`
3. **context 更可控**：Worker 每次只需读取当前页面的 AIProjection（通过 `read_pages(pageId, 'full')`），修改后整页写回
4. **幂等性天然保证**：同一页面重复写入 = 覆盖，不会产生重复节点

对于**修改已有页面**的场景：Worker 先 `read_pages(pageId, 'full')` 获取当前结构，在 think 阶段修改 JSON，再 `write_page` 写回。这比 `update_node` 逐个 patch 更简洁（对 LLM 来说，修改 JSON 对象比决定调用哪些原子工具更自然）。

**Layer 3：后端 Worker 专属工具**

| 工具 | 用途 | 输入 | 输出 |
|------|------|------|------|
| `write_schema` | 整体写入数据模型 Schema | `collections: CollectionDef[]` | `{ success, collectionCount }` |
| `write_cloud_function` | 创建/更新云函数 | `name`, `displayName`, `description`, `flowSchema` | `{ success, message }` |
| `delete_cloud_function` | 删除云函数 | `name` | `{ success, message }` |

**设计决策——Schema 保持全量替换**：后端 Worker 拿到契约（IntegrationContract）后应一次性生成完整 Schema，而非增量添加。理由：Agent 上下文中已有完整的 CollectionContract 列表，全量写入避免了 Agent 需要记忆"哪些已写、哪些未写"的状态跟踪负担。后端 diff 更新已经是 banyan 后端的实现细节。

**设计决策——`write_cloud_function` 是纯写入工具**：后端 Worker 自身在 think 阶段生成 FlowSchema（利用 system prompt 中注入的 FlowSchema 节点规范 + `knowledge_search` 按需检索），然后通过此工具将结果写入。工具内部不调用 LLM。

#### SubAgent ↔ 工具白名单（新架构）

| SubAgent | 角色 | 可用工具 | 用途说明 |
|----------|------|---------|---------|
| requirements | 产品经理 | `web_search` | 调研竞品/行业惯例/用户习惯 |
| uiDesign | 视觉设计师 | `web_search`, `knowledge_search`, `read_pages` | web 搜参考设计，knowledge 查能力边界，read_pages 看现有页面结构 |
| contract | 全栈架构师 | `knowledge_search`, `read_schema`, `read_cloud_functions` | knowledge 查 FlowSchema 节点类型规范，read 感知现有数据模型和云函数 |
| frontend | 前端工程师 | `knowledge_search`, `read_pages`, `write_page`, `create_page`, `delete_page`, `material_search`, `material_get_detail` | knowledge 查 BanvasGL 实现，read 感知 → write 写入 |
| backend | 后端工程师 | `knowledge_search`, `read_schema`, `read_cloud_functions`, `write_schema`, `write_cloud_function`, `delete_cloud_function` | knowledge 查 FlowSchema 规范，read 感知 → write 写入 |

**respond 路径（chat 类型）**：`read_pages`, `read_schema`, `read_cloud_functions`, `knowledge_search`, `web_search`（全部只读，不做任何写入）

#### 工具总数对比

| | 旧架构 | 新架构 |
|---|---|---|
| 总工具数 | 21 | 12 |
| 前端 Worker 可用 | 8（画布） + 2（物料） + 1（knowledge） = 11 | 7 |
| 后端 Worker 可用 | 2（schema） + 3（云函数） + 1（knowledge） = 6 | 6 |
| 规划型 SubAgent 最多可用 | 6（planning readonly） | 3（requirements 最少，contract 最多） |

LLM 单次决策面对的工具列表从 11 个精简到 3~7 个，显著降低选择复杂度。

#### 工具命名规范

统一采用 `动词_名词` 风格，去掉 `banvas_` 前缀（不再需要区分画布工具和其他工具）：

- 只读：`read_pages`, `read_schema`, `read_cloud_functions`, `knowledge_search`, `web_search`
- 写入：`write_page`, `create_page`, `delete_page`, `write_schema`, `write_cloud_function`, `delete_cloud_function`
- 辅助：`material_search`, `material_get_detail`

---

## LLM 调用点汇总

| 节点 | LLM 调用时机 | 用途 |
|------|-------------|------|
| intent | 每次 task 进入 | 判断从流水线哪个位置开始 |
| Orchestrator | 仅审计失败时 | 仲裁退到哪个节点 |
| 需求解析 | 每次执行 | 生成结构化需求 |
| UI 设计 | 每次执行 | 生成设计规格 |
| 契约定义 | 每次执行 | 生成前后端契约 |
| 前端 Worker | 多轮 think↔tools | 生成 AIProjection + 客户端 FlowSchema |
| 后端 Worker | 多轮 think↔tools | 生成 CollectionSchema + ServerFlowSchema |
| 审计 | 每次执行 | 程序化校验 + LLM 语义校验 |
| 总结 | 每次执行 | 摘要 + 记忆提取 |

---

## 细化：SubAgent 统一协议

### 设计动机

当前存在两套不兼容的 SubAgent 体系（规划管线的 `SubAgentRunResult<T>` 和编排层的 `SubAgentResult`），且各 Agent 的 Input 类型是硬编码的独立接口，没有"从前序工件中读取"的统一抽象。新架构需要一套覆盖规划型和执行型的统一协议，使 Orchestrator 的调度逻辑完全通用。

### SubAgent 声明式注册

```typescript
/** SubAgent 描述符——声明式注册，Orchestrator 据此调度 */
interface SubAgentDescriptor<TOutput> {
  name: SubAgentName
  role: string                          // 角色描述（"产品经理"/"前端工程师"等）
  mode: 'planning' | 'execution'        // 规划型=单次LLM，执行型=多轮think↔tools
  dependencies: SubAgentName[]          // 声明需要哪些前序工件
  outputSchema: ZodSchema<TOutput>      // Zod 验证 schema
  tools?: string[]                      // 工具白名单（执行型必填）
  maxIterations?: number                // 执行型的循环上限
}

type SubAgentName = 'requirements' | 'uiDesign' | 'contract' | 'frontend' | 'backend'
```

### 统一输入

```typescript
/** Orchestrator 根据 dependencies 自动从 ArtifactStore 中提取并组装 */
interface SubAgentInput {
  userMessage: string                   // 原始用户诉求
  artifacts: Partial<ArtifactStore>     // 前序工件（只包含 dependencies 声明的）
  agentMemory: string                   // L2 记忆
  conversationContext: string           // L3 上下文摘要
  auditFeedback?: string                // 回退时注入的审计反馈
}
```

### 统一输出

```typescript
interface SubAgentOutput<TOutput> {
  artifact: TOutput                     // 结构化产出（Zod 验证通过）
  reasoning: string                     // 推理过程摘要
  metadata: {
    iterations: number                  // 实际循环次数（规划型为1）
    durationMs: number
    toolCalls: number                   // 工具调用次数（规划型为0）
  }
}
```

### 工件仓库

```typescript
/** Orchestrator 管理的共享工件表 */
interface ArtifactStore {
  requirements: StructuredRequirements
  uiDesign: UIDesignSpec
  contract: IntegrationContract
  frontend: FrontendArtifacts
  backend: BackendArtifacts
}
```

### 依赖图

```
requirements: []                        → StructuredRequirements
uiDesign:     [requirements]            → UIDesignSpec
contract:     [requirements, uiDesign]  → IntegrationContract
frontend:     [contract, uiDesign]      → FrontendArtifacts { pages: PageArtifact[] }
backend:      [contract, requirements]  → BackendArtifacts
```

Orchestrator 根据依赖图决定执行顺序。frontend 和 backend 的依赖集无交叉（除了 contract），因此可以并行。回退时，清空目标节点及所有依赖它的下游节点的工件。

### 两种执行模式

协议层不区分规划型和执行型，区别在 SubAgentRunner 的内部实现：

- **规划型**（mode='planning'）：构造 system prompt + user prompt → LLM 调用（可选 0~2 轮工具调用做信息采集）→ 结构化输出 → Zod 验证 → 验证失败则重试（≤3次）。核心特征是产出为结构化文档，工具调用仅用于信息采集（只读），不产生副作用。
- **执行型**（mode='execution'）：构造 system prompt → think↔tools 循环（≤maxIterations）→ 最终输出 Zod 验证。核心特征是通过写入工具产生副作用（修改画布/Schema/云函数）。

### 错误处理

```typescript
interface SubAgentError {
  agentName: SubAgentName
  phase: 'llm_call' | 'tool_execution' | 'output_validation' | 'timeout'
  message: string
  partialOutput?: unknown               // 部分产出（如有）
  retriable: boolean
  toolName?: string                     // tool_execution 时记录是哪个工具
}
```

**按 error phase 分层处理——不同错误原因有不同处理策略，避免所有失败都走 Orchestrator 仲裁：**

| error phase | 处置层级 | 策略 |
|---|---|---|
| `output_validation` | **SubAgent 内部消化** | Zod 验证失败，在 Agent 内部追加修正 prompt 重试（≤3次），全部失败才上报 Orchestrator。不触发 rollback。 |
| `tool_execution`（幂等工具） | **SubAgent 内部消化** | 写操作工具（如 banvas_patch）失败，在 Agent 内部重试（≤2次）。幂等工具重试安全。全部失败才上报。 |
| `tool_execution`（非幂等工具） | **上报 Orchestrator** | 非幂等写操作失败（如 save_cloud_function 写入一半失败），立即上报，Orchestrator 决定是否需要回退或补偿操作。 |
| `llm_call` | **SubAgent 内部消化** | 网络抖动/超时，在 Agent 内部原地重试（≤2次，指数退避）。全部失败才上报。 |
| `timeout`（软超时） | **SubAgent 内部消化** | think↔tools 循环达到 maxIterations，视为部分完成，携带 partialOutput 上报审计，由审计决定是否可接受。 |
| `timeout`（硬超时） | **上报 Orchestrator** | 整个 SubAgent 超过全局时间预算（如 90s），上报 Orchestrator，Orchestrator 决策是否重跑或进入 failed。 |

**关键原则**：能在 SubAgent 内部消化的错误不上浮。上报 Orchestrator 的错误进入审计节点，由审计决定是 pass（partialOutput 可接受）还是 fail（触发 rollback 仲裁）。这样把真正需要 Orchestrator 决策的情况控制到最少，避免每次小错误都触发 LLM 仲裁。

**两个 Worker 并行时的失败组合处理**：

| 状态 | Orchestrator 策略 |
|---|---|
| 仅 frontend 上报失败 | 等 backend 完成 → 进审计 → 审计报告 frontend 失败 → rollback 仲裁只重跑 frontend |
| 仅 backend 上报失败 | 等 frontend 完成 → 进审计 → 审计报告 backend 失败 → rollback 仲裁只重跑 backend |
| 两个都上报失败 | 进审计 → 审计大概率报告 contract 问题（两边都失败通常是契约不清晰）→ rollback 仲裁退到 contract |
| 一个超时（硬超时）另一个完成 | 超时 Worker 标记 failed，另一个的产出暂存 → 进审计 → 审计报告哪个 Worker 失败 → rollback 仲裁只重跑失败的 Worker |

---

## 细化：各 SubAgent 结构化输出 Schema

### 需求解析（StructuredRequirements）

```typescript
interface StructuredRequirements {
  features: Feature[]
  constraints: string[]                 // 技术/业务约束
  outOfScope?: string[]                 // 明确不做的
}

interface Feature {
  id: string                            // 如 "feat-login"
  title: string
  description: string
  userStory?: string                    // As a...I want...So that...
  priority: 'must' | 'should' | 'could'
}
```

### UI 设计（UIDesignSpec）

```typescript
interface UIDesignSpec {
  pages: PageSpec[]
  navigation: NavigationFlow[]          // 页面间导航关系
  designTokens?: DesignTokenOverrides   // 视觉规格覆盖（主题色等）
}

interface PageSpec {
  id: string                            // 对应 Scene ID
  name: string
  layout: string                        // 布局描述（自然语言）
  components: ComponentSpec[]
  interactions: InteractionSpec[]
}

interface ComponentSpec {
  id: string
  type: string                          // BanvasGL ViewType
  description: string
  dataBinding?: string                  // 绑定的数据字段描述
}

interface InteractionSpec {
  trigger: string                       // 如 "点击提交按钮"
  action: string                        // 如 "调用创建订单云函数"
  targetComponent: string               // 触发组件 ID
}

interface NavigationFlow {
  from: string                          // 页面 ID
  to: string                            // 页面 ID
  trigger: string                       // 触发条件
}
```

### 契约定义（IntegrationContract）

```typescript
interface IntegrationContract {
  collections: CollectionContract[]
  cloudFunctions: FunctionContract[]
  bindings: BindingContract[]
}

// ─── 数据表契约 ───
interface CollectionContract {
  name: string                          // 集合英文标识符（camelCase）
  displayName: string                   // 集合中文显示名
  description: string                   // 用途描述
  fields: FieldContract[]
}

interface FieldContract {
  name: string                          // 字段英文名（camelCase）
  displayName: string                   // 字段中文显示名
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'ref' | 'array' | 'object'
  required: boolean
  defaultValue?: unknown
  refCollection?: string                // type='ref' 时，关联的集合 name
  enumValues?: string[]                 // type='enum' 时的可选值列表
}

// ─── 云函数签名契约 ───
interface FunctionContract {
  functionId: string                    // UUID，契约定义时预分配，前端 callFlow.flowId 引用此值
  name: string                          // 函数英文标识符（camelCase，同 app 内唯一）
  displayName: string                   // 中文显示名
  description: string                   // 功能描述
  input: ParamContract[]                // 入参定义
  output: ParamContract[]               // 出参定义
  sideEffects: SideEffect[]             // 副作用声明（操作哪些集合）
}

interface ParamContract {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
  required: boolean
  description: string
}

interface SideEffect {
  collection: string                    // 操作的集合 name（必须在 CollectionContract 中存在）
  operation: 'create' | 'read' | 'update' | 'delete'
}

// ─── 绑定映射（前端事件→云函数的"接线图"）───
interface BindingContract {
  id: string                            // 绑定唯一标识
  description: string                   // 如 "用户点击提交按钮时创建订单"
  frontend: {
    pageId: string                      // 哪个页面（对应 UIDesignSpec.pages[].id）
    componentId: string                 // 哪个组件（对应 ComponentSpec.id）
    event: string                       // 什么事件（onClick/onSubmit 等）
  }
  backend: {
    functionId: string                  // 调用哪个云函数（对应 FunctionContract.functionId）
    paramMapping: ParamMapping[]        // 参数映射
  }
}

interface ParamMapping {
  source: string                        // 数据来源描述（如 "表单字段 username"）
  target: string                        // 对应函数入参 name
}
```

**设计要点**：

1. **字段类型与 banyan 后端 `IFieldDef` 完全对齐**：8 种类型（string/number/boolean/date/enum/ref/array/object），含 displayName、refCollection、enumValues 等条件属性。
2. **functionId 预分配机制**：契约定义 SubAgent 在生成 FunctionContract 时预分配 UUID 作为 `functionId`。前端 Worker 据此构造 callFlow 节点的 `flowId` 字段，后端 Worker 据此创建云函数时使用同一个 `functionId`。这是前后端并行执行能对齐的核心机制。
3. **引用完整性可程序化校验**：`BindingContract.backend.functionId` → `FunctionContract.functionId`；`SideEffect.collection` → `CollectionContract.name`；`BindingContract.frontend.componentId` → `UIDesignSpec.ComponentSpec.id`。审计节点可零 token 校验这些引用。
4. **契约是接口定义而非实现细节**：FunctionContract 只定义签名（入参/出参/副作用），不定义内部逻辑（FlowSchema 节点图）。后端 Worker 据此自由决定实现方式。

### 前端产出（FrontendArtifacts）

```typescript
interface FrontendArtifacts {
  pages: PageArtifact[]                 // 按页面组织的产出（每页独立，未来可并行）
}

interface PageArtifact {
  pageId: string                        // 对应 UIDesignSpec.pages[].id / Scene ID
  scene: AIProjectionScene              // 该页面的完整视图结构（可直接 fromAIProjection）
  clientFlows: ClientFlowBinding[]      // 该页面内的事件绑定
}

interface ClientFlowBinding {
  viewId: string                        // 绑定到哪个 View
  event: string                         // 事件名（onClick/onSubmit 等）
  flowSchema: FlowSchema                // 客户端 FlowSchema（含 callFlow 节点）
}
```

**设计要点**：产出按页面独立组织（`PageArtifact[]`），而非一个 flat 的 `AIProjectionScene[]`。这使得：
1. 审计可以按页粒度校验（某一页的 callFlow 引用完整性）
2. 回退可以只重跑有问题的页面（未来优化，当前仍重跑整个 frontend Worker）
3. 未来拆为 Page Worker 并行时，每个 Worker 的输出直接是一个 `PageArtifact`，无需结构变更

### 后端产出（BackendArtifacts）

```typescript
interface BackendArtifacts {
  collections: CollectionDefinition[]   // 数据表完整定义
  cloudFunctions: CloudFunctionEntry[]  // 云函数
}

interface CollectionDefinition {
  name: string
  fields: CollectionField[]
  indexes?: IndexDefinition[]
}

interface CloudFunctionEntry {
  name: string                          // 函数名（唯一标识）
  description: string
  flowSchema: FlowSchema                // 服务端 FlowSchema（节点图）
}
```

---

## 细化：LangGraph 实现方案

### 设计动机

当前 PlanningOrchestrator 是普通 class（不是 Subgraph），内部执行对 LangGraph 的 checkpoint/replay 不可见；并行执行用 `Promise.all` 在单节点内实现，LangGraph 无法感知独立 Worker 状态；回退只能重跑整个 execute 节点，无法精确回退到前序节点。

### 主图拓扑

```typescript
const orchestratorGraph = new StateGraph(OrchestratorState)
  // 节点
  .addNode('intent', intentNode)
  .addNode('respond', respondSubgraph)
  .addNode('requirements', requirementsSubgraph)
  .addNode('uiDesign', uiDesignSubgraph)
  .addNode('contract', contractSubgraph)
  .addNode('frontend', frontendSubgraph)
  .addNode('backend', backendSubgraph)
  .addNode('audit', auditNode)
  .addNode('rollback', rollbackNode)
  .addNode('summarize', summarizeNode)
  // 边
  .addConditionalEdges(START, routeFromStart)       // → intent
  .addConditionalEdges('intent', routeAfterIntent)  // → respond | requirements | uiDesign | contract | building
  .addEdge('respond', 'summarize')
  .addEdge('requirements', 'uiDesign')
  .addEdge('uiDesign', 'contract')
  .addConditionalEdges('contract', fanOutWorkers)   // → Send(['frontend', 'backend'])
  .addEdge(['frontend', 'backend'], 'audit')        // 汇合
  .addConditionalEdges('audit', routeAfterAudit)    // → summarize | rollback
  .addConditionalEdges('rollback', routeAfterRollback) // → requirements | uiDesign | contract | frontend
  .addEdge('summarize', END)
```

### OrchestratorState（主图状态）

```typescript
const OrchestratorState = Annotation.Root({
  // 五层上下文（从 banyan 后端注入）
  messages: Annotation<BaseMessage[]>({ reducer: messagesReducer }),
  systemPrompt: Annotation<string>(),
  agentMemory: Annotation<string>(),
  conversationContext: Annotation<string>(),

  // intent 产出
  intentResult: Annotation<IntentResult | null>(),

  // 工件仓库（核心！）
  artifacts: Annotation<Partial<ArtifactStore>>({ reducer: artifactsReducer }),

  // 流程控制
  currentNode: Annotation<SubAgentName | null>(),
  startFrom: Annotation<SubAgentName>(),            // intent 决定的起始节点
  rollbackCount: Annotation<number>(),
  auditResult: Annotation<AuditResult | null>(),
  auditFeedback: Annotation<string>(),              // 回退时注入的修正信息

  // 最终产出
  finalSummary: Annotation<string>(),
})
```

### artifacts reducer（增量写入 + 回退清空）

```typescript
function artifactsReducer(current: Partial<ArtifactStore>, update: ArtifactUpdate): Partial<ArtifactStore> {
  if (update.type === 'set') {
    return { ...current, [update.key]: update.value }
  }
  if (update.type === 'clearFrom') {
    // 根据依赖图清空目标节点及其下游的所有工件
    const toClear = getDependents(update.target)
    const result = { ...current }
    for (const key of toClear) delete result[key]
    return result
  }
  return current
}
```

### 并行执行（Send API）

```typescript
function fanOutWorkers(state: OrchestratorState): Send[] {
  return [
    new Send('frontend', { artifacts: state.artifacts, auditFeedback: state.auditFeedback }),
    new Send('backend', { artifacts: state.artifacts, auditFeedback: state.auditFeedback }),
  ]
}
```

LangGraph 的 `Send` 并行执行两个子图，各自拥有独立 state 和 checkpoint，完成后自动汇合到 `audit` 节点。

### 回退路由

```typescript
function routeAfterRollback(state: OrchestratorState): string {
  // rollbackNode 已用 LLM 判断目标节点，并通过 artifactsReducer 清空工件
  return state.startFrom  // 直接路由到目标节点
}
```

### SubAgent 子图（执行型示例）

```typescript
// 前端 Worker 子图——think↔tools 循环
const frontendSubgraph = new StateGraph(WorkerState)
  .addNode('think', thinkNode)
  .addNode('tools', toolsNode)
  .addConditionalEdges('think', shouldContinue)  // → tools | end
  .addEdge('tools', 'think')                     // 循环
  .compile()
```

规划型 SubAgent 是"单节点子图"——虽然只有一次 LLM 调用，但封装为子图使其拥有独立的 input/output 映射和 checkpoint，与执行型在主图层面完全对称。

### 关键设计点

1. **intent 路由直接跳到目标节点**。`routeAfterIntent` 返回 `state.startFrom`（requirements/uiDesign/contract/frontend 中任一），实现"start 可跳到任意工作 phase"。
2. **回退是图拓扑的显式边**。`audit → rollback → 目标节点` 是一条显式路径，LangGraph checkpoint 完整记录回退历史。
3. **Send 实现真正并行**。两个 Worker 各自有独立 state 和 checkpoint，一个失败不影响另一个继续。
4. **所有 SubAgent 统一为子图**。主图只关心"调用哪个子图、传什么输入、收什么输出"，不关心子图内部是单次调用还是多轮循环。

---

## 细化：intent 节点与 Orchestrator 回退仲裁的 Prompt 设计

### 设计动机

intent 和 rollback 是整个管线中仅有的两个"路由决策"LLM 调用点——它们不产出业务工件，只决定流程走向。两者的判断准确性直接影响 token 效率（错误路由 = 浪费一整轮 SubAgent 执行）。需要精确定义输入/输出 schema 和 prompt 结构，使路由判断可预测、可调试。

### intent 节点

#### 职责边界

intent 只做一件事：**判断从流水线哪个位置开始执行**。它不做 chat/task 分类（前端 `type` 字段已决定），不做需求解析（那是 requirements SubAgent 的事），不做工件生成。

#### 输入 Schema

```typescript
interface IntentInput {
  userMessage: string                    // 用户本轮消息
  previousDialogue?: {                   // 最近一轮 done/discarded 的 Dialogue 摘要（ContextBuilder 提供）
    phase: DialoguePhase                 // 终态时的 phase
    summary: string                      // 结构化摘要
    completedStages: SubAgentName[]      // 已完成的阶段
    interruptMetadata?: IInterruptMetadata  // 如果是 discarded，中断归因
  }
  existingArtifactsSummary?: string      // 从历史 planningEntries 提取的工件摘要（一段自然语言）
}
```

#### 输出 Schema

```typescript
interface IntentResult {
  startFrom: SubAgentName                    // 从哪个节点开始（requirements | uiDesign | contract | frontend | backend）
  reasoning: string                          // 判断理由（一句话，用于调试日志）
  correctionHint?: string                    // 用户消息中的修正要点（注入目标节点的 auditFeedback）
  contextStrategy: 'fresh' | 'inherit'       // fresh=不复用历史工件，inherit=从历史 Dialogue 恢复工件到 ArtifactStore
}
```

#### System Prompt

```
你是一个流程路由器。你的唯一任务是判断用户的新消息应该从 SOP 流水线的哪个位置开始执行。

## 决策规则

1. 如果没有历史对话状态（previousDialogue 为空），一律输出 startFrom="requirements"，contextStrategy="fresh"。
2. 如果有历史状态，根据用户消息判断：
   - 用户表达"继续"/"接着做"且无修正意图 → 从中断点续接（startFrom = 中断阶段或下一个未完成阶段），contextStrategy="inherit"
   - 用户表达对某个阶段产出的不满（如"数据表设计不对"/"UI 布局换一种"/"需求理解错了"）→ 从对应阶段回退重跑，contextStrategy="inherit"，correctionHint 提取用户的修正要点
   - 用户表达全新需求（与历史无关）→ startFrom="requirements"，contextStrategy="fresh"
   - 用户在历史基础上追加新功能 → startFrom="requirements"，contextStrategy="inherit"（保留已有工件作为增量基础）

## 阶段对应关系（用户意图 → 起始节点）

**修正场景（有历史状态，出了问题要改）**：
- requirements：需求理解有误、功能遗漏、需求变更、"你理解错了"
- uiDesign：布局不满意、交互方式要改、视觉风格要调、"换个设计"
- contract：数据表设计不对、云函数划分不合理、接口定义有问题、"后端架构不对"
- frontend：前端实现有 bug、样式不对但设计方案没问题、"按钮位置不对"
- backend：后端逻辑有误、数据操作不对但契约没问题、"查询逻辑写错了"

**跳过规划直接执行（有历史状态，前序工件完整，修改范围不涉及需求/契约变更）**：
- 直接 frontend：纯样式调整、颜色修改、布局微调、文案变更，确认无数据表/云函数改动
- 直接 backend：仅后端逻辑调整（查询条件、排序、过滤），确认契约签名不变

**注意**：直接路由到 Worker 要求历史工件完整（requirements/uiDesign/contract 均存在），否则回退到缺失工件的上游节点。

## 输出

严格输出 JSON，不要解释。
```

#### 工程约束

- 使用轻量模型（DeepSeek-V3），这是路由判断不是深度推理
- Structured output（Zod schema 约束），不依赖 LLM 自觉遵守格式
- Token 预算：≤1K input + ≤200 output
- 无历史状态时可跳过 LLM 调用，程序化直接返回 `{ startFrom: 'requirements', contextStrategy: 'fresh' }`

### Orchestrator 回退仲裁（rollbackNode）

#### 职责边界

rollback 只在审计失败时触发，判断应该退到哪个节点重新执行。它不做需求理解，不做工件生成，只做根因定位 + 回退目标选择。

#### 输入 Schema

```typescript
interface RollbackInput {
  auditResult: {
    passed: false
    failReasons: AuditFailReason[]       // 结构化失败原因列表
    suggestedTarget?: SubAgentName       // 审计节点的程序化推断建议（参考但不盲从）
  }
  artifactsSummary: {                    // 各工件的一句话摘要（由 Orchestrator 从 ArtifactStore 提取）
    requirements: string
    uiDesign: string
    contract: string
    frontend?: string                    // 可能为空（Worker 失败未产出）
    backend?: string
  }
  rollbackCount: number                  // 当前已回退次数
  previousRollbacks?: {                  // 之前的回退记录（避免循环）
    target: SubAgentName
    reason: string
  }[]
}

interface AuditFailReason {
  category: 'reference_integrity' | 'schema_validation' | 'requirement_coverage' | 'worker_failure' | 'semantic_inconsistency'
  description: string
  involvedArtifacts: SubAgentName[]      // 涉及哪些工件
}
```

#### 输出 Schema

```typescript
interface RollbackResult {
  target: SubAgentName                   // 退到哪个节点
  reasoning: string                      // 判断理由（调试日志）
  feedbackForTarget: string              // 注入目标节点的修正指令（作为 auditFeedback）
}
```

#### System Prompt

```
你是一个回退仲裁器。审计发现了问题，你需要判断应该退回到哪个节点重新执行。

## 决策原则

1. 最小回退原则：退到能修复问题的最近节点，不要过度回退。退到 contract 能解决的问题不要退到 requirements。
2. 根因追溯：表面问题可能源于上游。如"前端引用了不存在的函数 ID"，根因在 contract（没定义该函数）而非 frontend。
3. 避免循环：检查 previousRollbacks，如果之前已退回某节点且同类问题再次出现，说明该节点无法自行修复，应退到更上游。

## 失败类别 → 典型回退目标

- reference_integrity（引用完整性）：通常退到 contract（契约定义不完整或 ID 不匹配）
- schema_validation（结构校验失败）：退到对应 Worker（frontend 或 backend 的产出格式有误）
- requirement_coverage（需求覆盖不足）：退到 requirements（需求遗漏）或 uiDesign（设计遗漏了功能入口）
- worker_failure（Worker 执行失败/超时）：退到对应 Worker 重跑（frontend 或 backend）
- semantic_inconsistency（语义不一致）：根据 description 判断根因在哪一层

## 特殊规则

- 如果 suggestedTarget 存在且与你的判断一致，直接采用
- 如果两个 Worker 都失败，优先退到 contract（可能是契约不够清晰导致两边都无法执行）
- feedbackForTarget 必须具体、可操作（不要写"请修复问题"，要写"函数 createOrder 缺少 userId 入参定义"）

## 输出

严格输出 JSON，不要解释。
```

### intent 与 rollback 的关键差异

| 维度 | intent | rollback |
|------|--------|----------|
| 触发时机 | 用户发新消息（每轮 task 必经） | 审计失败（系统自动，可能不触发） |
| 信息来源 | 用户自然语言 + 历史摘要 | 结构化审计报告 + 工件摘要 |
| 判断难度 | 高（需理解用户模糊意图） | 中（有结构化失败原因 + 程序化建议） |
| 额外输出 | correctionHint（从用户话中提取修正要点） | feedbackForTarget（从审计报告中提炼修正指令） |
| contextStrategy | 需判断 fresh/inherit | 一律 inherit（在已有工件基础上修正） |
| 可跳过 LLM | 是（无历史时程序化直出） | 否（必须 LLM 判断根因） |

### 与 LangGraph 实现的对应关系

```typescript
// intent 节点实现
async function intentNode(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  // 无历史状态 → 程序化快速路径
  if (!state.conversationContext || !hasPreviousDialogue(state)) {
    return { intentResult: { startFrom: 'requirements', reasoning: 'no history', contextStrategy: 'fresh' } }
  }
  // 有历史 → LLM 判断
  const input: IntentInput = buildIntentInput(state)
  const result = await llm.structured(intentSystemPrompt, input, IntentResultSchema)
  return {
    intentResult: result,
    startFrom: result.startFrom,
    auditFeedback: result.correctionHint ?? '',
    artifacts: result.contextStrategy === 'fresh'
      ? { type: 'clearFrom', target: 'requirements' }  // 清空所有工件
      : restoreArtifactsFromHistory(state)              // 从历史 Dialogue 恢复
  }
}

// rollback 节点实现
async function rollbackNode(state: OrchestratorState): Promise<Partial<OrchestratorState>> {
  const input: RollbackInput = buildRollbackInput(state)
  const result = await llm.structured(rollbackSystemPrompt, input, RollbackResultSchema)
  return {
    startFrom: result.target,
    auditFeedback: result.feedbackForTarget,
    artifacts: { type: 'clearFrom', target: result.target },  // 清空目标及下游工件
    rollbackCount: state.rollbackCount + 1,
  }
}
```

---

## 细化：SSE 事件设计

### 设计动机

ADR-039 确立"SSE 是会话模型的实时投影"原则——每个 SSE 事件必须能映射到"当前处于哪个 phase + 该 phase 内的增量"。新架构的 phase 以 SubAgent 粒度暴露（start/requirements/ui_design/contract/building/awaiting_confirm/committing/done），用户感知到的是"数字员工"协作进度。SSE 事件需要让前端能展示每个阶段的实时状态，同时保持事件集精简可控。

### 设计原则

SSE 事件分两层：**phase 层**（用户可见进度，前端必须处理）和 **detail 层**（细粒度信息，前端可选择展示或忽略）。phase 层事件驱动进度 UI，detail 层事件丰富体验但不影响核心流程。

### Phase 层事件（必须处理）

```typescript
/** phase 变更——前端据此切换进度 UI */
interface PhaseChangeEvent {
  type: 'phase_change'
  phase: DialoguePhase                   // 新 phase
  metadata?: {
    agent?: SubAgentName                 // 当前执行的 SubAgent（building 时为 'frontend'|'backend'）
    message?: string                     // 用户可读的一句话描述（如"正在分析您的需求..."）
  }
}

/** 文本流（respond 路径 + summarize 节点的流式输出） */
interface TextStreamEvent {
  type: 'text'
  content: string                        // 增量文本片段
  role: 'assistant'
}

/** 最终完成 */
interface DoneEvent {
  type: 'done'
  summary: string                        // 变更摘要
  artifacts?: {                          // 产出概览（前端据此决定展示什么）
    pagesModified: string[]
    collectionsModified: string[]
    functionsModified: string[]
  }
}

/** 错误 */
interface ErrorEvent {
  type: 'error'
  message: string
  recoverable: boolean                   // true=前端可提示用户重试，false=终态
}
```

### Detail 层事件（可选展示）

```typescript
/** SubAgent 开始/完成 */
interface AgentProgressEvent {
  type: 'agent_progress'
  agent: SubAgentName
  status: 'started' | 'completed' | 'failed' | 'retrying'
  output?: unknown                       // completed 时携带结构化产出摘要（非完整工件）
}

/** 执行型 SubAgent 的 think↔tools 循环进度 */
interface ToolActivityEvent {
  type: 'tool_activity'
  agent: SubAgentName                    // frontend | backend
  iteration: number                      // 当前第几轮
  action: 'thinking' | 'calling_tool' | 'tool_result'
  toolName?: string                      // calling_tool 时
  summary?: string                       // 一句话描述当前在做什么
}

/** 审计进度（building 内部，用户不可见 phase 回退） */
interface AuditEvent {
  type: 'audit_progress'
  status: 'checking' | 'passed' | 'failed_retrying'
  message?: string                       // failed_retrying 时："发现问题，正在优化..."
}
```

### 事件流时序示例（完整 task）

```
→ phase_change { phase: 'start' }
→ phase_change { phase: 'requirements', metadata: { message: '正在分析您的需求...' } }
→ agent_progress { agent: 'requirements', status: 'started' }
→ agent_progress { agent: 'requirements', status: 'completed' }
→ phase_change { phase: 'ui_design', metadata: { message: '正在设计界面...' } }
→ agent_progress { agent: 'uiDesign', status: 'started' }
→ agent_progress { agent: 'uiDesign', status: 'completed' }
→ phase_change { phase: 'contract', metadata: { message: '正在规划数据架构...' } }
→ agent_progress { agent: 'contract', status: 'started' }
→ agent_progress { agent: 'contract', status: 'completed' }
→ phase_change { phase: 'building', metadata: { message: '正在构建应用...' } }
→ agent_progress { agent: 'frontend', status: 'started' }
→ agent_progress { agent: 'backend', status: 'started' }
→ tool_activity { agent: 'frontend', iteration: 1, action: 'thinking' }
→ tool_activity { agent: 'frontend', iteration: 1, action: 'calling_tool', toolName: 'banvas_patch' }
→ tool_activity { agent: 'backend', iteration: 1, action: 'thinking' }
→ ...
→ agent_progress { agent: 'backend', status: 'completed' }
→ agent_progress { agent: 'frontend', status: 'completed' }
→ audit_progress { status: 'checking' }
→ audit_progress { status: 'passed' }
→ phase_change { phase: 'awaiting_confirm', metadata: { message: '构建完成，请查看效果' } }
→ [用户确认]
→ phase_change { phase: 'committing' }
→ text { content: '本次为您...' }  // 总结流式输出
→ phase_change { phase: 'done' }
→ done { summary: '...', artifacts: { pagesModified: [...], ... } }
```

### 与 ADR-039 现有事件的关系

| ADR-039 事件 | ADR-041 对应 | 处理方式 |
|---|---|---|
| `text` | `TextStreamEvent` | 保留，用于 respond 路径和 summarize 流式输出 |
| `tool_call` / `tool_result` | `ToolActivityEvent` | 替换为更高层抽象（不暴露原始 tool_call JSON） |
| `app_snapshot` | 退役 | 不再需要——产出暂存在 Dialogue，confirm 后才写入 |
| `schema_update` | 退役 | 同上 |
| `disambiguation` | 退役 | 新架构无 humanGate，不需要消歧事件 |
| `done` | `DoneEvent` | 保留，增加 `artifacts` 概览字段 |
| `error` | `ErrorEvent` | 保留，增加 `recoverable` 字段 |
| — | `PhaseChangeEvent` | 新增，核心进度事件 |
| — | `AgentProgressEvent` | 新增，SubAgent 粒度进度 |
| — | `AuditEvent` | 新增，审计进度（building 内部） |

### 前端消费策略

前端可以根据产品需求选择展示粒度：

- **最简模式**：只监听 `phase_change`，展示"需求分析中/设计中/构建中/待验收"四步进度条
- **标准模式**：监听 `phase_change` + `agent_progress`，展示每个 SubAgent 的开始/完成状态
- **详细模式**：全部监听，展示 Worker 的每一步工具调用（适合开发者/调试场景）

产品初期推荐标准模式——用户能感知到"多个数字员工在协作"，但不被过多细节干扰。

---

## 细化：前端消费新架构 SSE 事件与会话模型

### 设计动机

新架构（ADR-041）对前端的影响集中在三个方面：

1. **SSE 事件变更**：旧事件集（text_delta / tool_call / tool_result / planning_progress / interrupt / disambiguation）替换为新事件集（phase_change / agent_progress / tool_activity / audit_progress / text / done / error）
2. **会话模型变更**：Dialogue 增加 `phase` 字段作为唯一权威状态机；去掉 `threadStatus`；新增 `planningEntries` 存储规划型 SubAgent 产出
3. **交互流程变更**：去掉 humanGate（无中间确认）、去掉 disambiguation（无消歧卡片）；用户验收点后移到 `awaiting_confirm`

### 当前前端架构（需要迁移的部分）

```
api/ai.ts          → SSE 事件类型定义 + 流解析
api/conversations.ts → Dialogue 数据模型 + 历史加载
hooks/useXiangDi.ts  → 核心状态管理 + 事件分发
components/AiBar/    → UI 组件树
  ├── ConversationPanel/    → 消息列表 + 流式渲染
  ├── PlanningCard/         → PM→Arch→Visual→Task 进度
  ├── PlanApprovalCard/     → humanGate 方案确认（退役）
  └── DisambiguationPanel/  → 消歧卡片（退役）
```

### 新 SSE 事件类型定义（`api/ai.ts`）

```typescript
// ─── Phase 层事件（必须处理）─────────────────────────────────────────────────

/** Phase 状态机类型 */
export type DialoguePhase =
  | 'start'
  | 'requirements'
  | 'ui_design'
  | 'contract'
  | 'building'
  | 'awaiting_confirm'
  | 'committing'
  | 'done'
  | 'responding'
  | 'discarded'
  | 'failed'

/** phase 变更——前端据此驱动进度 UI */
export interface AiPhaseChangeEvent {
  type: 'phase_change'
  phase: DialoguePhase
  metadata?: {
    agent?: SubAgentName
    message?: string                    // 用户可读描述（"正在分析您的需求..."）
  }
}

/** 文本流（respond 路径 + summarize 节点的流式输出） */
export interface AiTextEvent {
  type: 'text'
  content: string                       // 增量文本片段
}

/** 最终完成 */
export interface AiDoneEvent {
  type: 'done'
  summary: string
  artifacts?: {
    pagesModified: string[]
    collectionsModified: string[]
    functionsModified: string[]
  }
}

/** 错误 */
export interface AiErrorEvent {
  type: 'error'
  message: string
  recoverable: boolean
}

// ─── Detail 层事件（可选展示）───────────────────────────────────────────────

export type SubAgentName = 'requirements' | 'uiDesign' | 'contract' | 'frontend' | 'backend'

/** SubAgent 开始/完成 */
export interface AiAgentProgressEvent {
  type: 'agent_progress'
  agent: SubAgentName
  status: 'started' | 'completed' | 'failed' | 'retrying'
  output?: unknown                      // completed 时携带产出摘要
}

/** 执行型 SubAgent 的工具活动 */
export interface AiToolActivityEvent {
  type: 'tool_activity'
  agent: SubAgentName
  iteration: number
  action: 'thinking' | 'calling_tool' | 'tool_result'
  toolName?: string
  summary?: string                      // 一句话描述当前操作
}

/** 审计进度（building 内部） */
export interface AiAuditEvent {
  type: 'audit_progress'
  status: 'checking' | 'passed' | 'failed_retrying'
  message?: string
}

/** 画布实时快照（写操作后推送） */
export interface AiAppSnapshotEvent {
  type: 'app_snapshot'
  appJSON: string
}

/** 联合类型 */
export type AiStreamEvent =
  | AiPhaseChangeEvent
  | AiTextEvent
  | AiDoneEvent
  | AiErrorEvent
  | AiAgentProgressEvent
  | AiToolActivityEvent
  | AiAuditEvent
  | AiAppSnapshotEvent
```

### 新 Dialogue 数据模型（`api/conversations.ts`）

```typescript
export type DialoguePhase = /* 同上 */

/** 规划产物条目（三个规划型 SubAgent 的结构化输出） */
export interface PlanningEntry {
  agent: 'requirements' | 'uiDesign' | 'contract'
  status: 'pending' | 'completed' | 'failed'
  output?: unknown                      // StructuredRequirements | UIDesignSpec | IntegrationContract
  completedAt?: string
}

/** Dialogue 数据模型 V3 */
export interface Dialogue {
  _id: string
  type: DialogueType
  phase: DialoguePhase                  // ← 新增：唯一权威状态机

  // 消息流
  messages: Message[]

  // 应用快照（本轮产出，未持久化到 Application 表）
  appJSON?: string
  collections?: unknown[]
  cloudFunctions?: unknown[]

  // 规划产物
  planningEntries?: PlanningEntry[]

  // 摘要
  summary?: string

  // 变更概览（done 时由总结节点生成）
  artifacts?: {
    pagesModified: string[]
    collectionsModified: string[]
    functionsModified: string[]
  }

  createdAt: string
  updatedAt: string
}
```

**去掉的字段**：`threadId`、`threadStatus`（被 `phase` 取代）

### 核心 Hook 重构（`hooks/useXiangDi.ts`）

#### 状态模型变更

```typescript
// ─── 去掉的状态 ─────────────────────────────────────────────
// planningSteps: PlanningStep[]     → 被 phase + agentSteps 取代
// planApproval: PlanApprovalState   → 去掉 humanGate
// currentText / allTextRef          → 仅 chat 路径使用（task 路径无文字流）

// ─── 新增/变更的状态 ─────────────────────────────────────────
export interface UseXiangDiReturn {
  loading: boolean
  historyLoading: boolean
  dialogues: Dialogue[]

  // ─── task 路径：进度驱动 ───
  /** 当前 dialogue 的 phase（实时） */
  currentPhase: DialoguePhase | null
  /** phase 附带的用户可读消息（"正在分析您的需求..."） */
  phaseMessage: string
  /** 各 SubAgent 的执行状态（detail 层，可选展示） */
  agentSteps: AgentStep[]
  /** Worker 的工具活动日志（详细模式展示） */
  toolActivities: ToolActivity[]
  /** 审计状态 */
  auditStatus: 'idle' | 'checking' | 'passed' | 'failed_retrying'

  // ─── chat 路径：文字流 ───
  /** 流式文本（仅 chat/responding 时使用） */
  streamingText: string

  // ─── 共享 ───
  /** 是否有待验收的 task 对话 */
  hasPendingConfirm: boolean
  /** 待验收对话的变更概览 */
  pendingArtifacts: AiDoneEvent['artifacts'] | null

  // ─── 方法 ───
  sendPrompt: (prompt: string, type?: DialogueType, images?: ImageItem[]) => Promise<void>
  abort: () => void
  confirmTask: () => Promise<void>
  discardTask: () => Promise<void>
}

export interface AgentStep {
  agent: SubAgentName
  status: 'pending' | 'started' | 'completed' | 'failed' | 'retrying'
  output?: unknown
}

export interface ToolActivity {
  id: string
  agent: SubAgentName
  iteration: number
  action: 'thinking' | 'calling_tool' | 'tool_result'
  toolName?: string
  summary?: string
  timestamp: number
}
```

#### 事件分发逻辑

```typescript
const handleEvent = useCallback((event: AiStreamEvent) => {
  switch (event.type) {

    // ─── Phase 层（必须处理）───────────────────────────────────
    case 'phase_change': {
      setCurrentPhase(event.phase)
      setPhaseMessage(event.metadata?.message ?? '')

      // phase 驱动 agentSteps 状态推进
      if (event.metadata?.agent) {
        setAgentSteps(prev => prev.map(step =>
          step.agent === event.metadata!.agent
            ? { ...step, status: 'started' }
            : step
        ))
      }

      // 进入 awaiting_confirm → 设置 pending
      if (event.phase === 'awaiting_confirm') {
        setHasPendingConfirm(true)
      }
      break
    }

    case 'text': {
      // 仅 chat/responding 路径产生文字流
      setStreamingText(prev => prev + event.content)
      break
    }

    case 'done': {
      setCurrentPhase('done')
      setPendingArtifacts(event.artifacts ?? null)
      setStreamingText('')  // 清空流式文本
      break
    }

    case 'error': {
      setCurrentPhase('failed')
      // recoverable=true 时前端可提示用户重试
      break
    }

    // ─── Detail 层（可选展示）──────────────────────────────────
    case 'agent_progress': {
      setAgentSteps(prev => prev.map(step =>
        step.agent === event.agent
          ? { ...step, status: event.status, output: event.output }
          : step
      ))
      break
    }

    case 'tool_activity': {
      setToolActivities(prev => [...prev, {
        id: `ta_${Date.now()}`,
        agent: event.agent,
        iteration: event.iteration,
        action: event.action,
        toolName: event.toolName,
        summary: event.summary,
        timestamp: Date.now(),
      }])
      break
    }

    case 'audit_progress': {
      setAuditStatus(event.status)
      break
    }

    case 'app_snapshot': {
      onAppSnapshot?.(event.appJSON)
      break
    }
  }
}, [onAppSnapshot])
```

#### sendPrompt 变更

```typescript
const sendPrompt = useCallback(async (prompt, type = 'task', images = []) => {
  // ... 互斥锁 + 乐观追加 user 消息 ...

  // 重置状态
  setCurrentPhase('start')
  setPhaseMessage('')
  setStreamingText('')
  setToolActivities([])
  setAuditStatus('idle')

  // task 类型初始化 agentSteps（五个 SubAgent 全部 pending）
  if (type === 'task') {
    setAgentSteps(SUBAGENT_ORDER.map(agent => ({ agent, status: 'pending' })))
  }

  // ... onBeforeSend + aiChat + finally ...
}, [...])
```

**关键变更**：`sendPrompt` 不再硬编码 `AGENT_ORDER = ['pm', 'arch', 'visual', 'task']`（旧四步规划），改为 `SUBAGENT_ORDER = ['requirements', 'uiDesign', 'contract', 'frontend', 'backend']`（新五步 SOP）。但实际激活顺序由服务端 `phase_change` 事件驱动，前端不做假设。

### UI 组件适配

#### ConversationPanel 变更

旧模式：进度消息混排（text bubble + tool_call row + planning card）→ 用户需要阅读中间过程
新模式：**进度面板 + 结果面板** 分离

```
┌─────────────────────────────────────────┐
│  历史对话气泡（折叠，不变）              │
├─────────────────────────────────────────┤
│  当前轮次                                │
│  ┌───────────────────────────────────┐  │
│  │ [进度面板] PhaseProgressBar       │  │  ← task 路径
│  │  需求分析 ● → 设计 ● → 架构 ○ → │  │
│  │  构建 ○ → 验收 ○                  │  │
│  │                                   │  │
│  │ 当前：正在设计界面...              │  │  ← phaseMessage
│  │                                   │  │
│  │ [可选] 详细活动日志（折叠态）      │  │  ← toolActivities（详细模式）
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ [结果面板]                        │  │  ← awaiting_confirm 时展示
│  │ 本次为您：                        │  │
│  │ · 修改了 3 个页面                 │  │  ← artifacts 概览
│  │ · 新增了 2 个云函数               │  │
│  │ · 创建了 1 个数据表               │  │
│  │                                   │  │
│  │ [确认保存]  [撤销修改]            │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ [文字流面板]                      │  │  ← chat/responding 路径
│  │ streamingText + 光标动画 ▋        │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  输入框                                  │
└─────────────────────────────────────────┘
```

#### 组件映射

| 旧组件 | 新组件 | 变化 |
|--------|--------|------|
| `PlanningCard` | `PhaseProgressBar` | 从四步（PM→Arch→Visual→Task）改为五步 SOP 进度条，状态由 `phase_change` 驱动而非 `planning_progress` |
| `PlanApprovalCard` | **退役** | 无 humanGate，不再需要中间方案确认 |
| `DisambiguationPanel` | **退役** | 无消歧事件 |
| `ConversationPanel` 混排消息 | `TaskProgressPanel` + `ChatStreamPanel` | task 和 chat 路径分离渲染 |
| tool_call/tool_result ToolRow | `ActivityLog`（可选展示） | 详细模式下折叠展示工具调用，默认隐藏 |

#### PhaseProgressBar 设计

```typescript
interface PhaseProgressBarProps {
  agentSteps: AgentStep[]
  currentPhase: DialoguePhase | null
  phaseMessage: string
  auditStatus: string
}

// 五步进度映射
const PHASE_STEPS = [
  { key: 'requirements', label: '需求分析', icon: '📋' },
  { key: 'uiDesign',     label: '界面设计', icon: '🎨' },
  { key: 'contract',     label: '架构规划', icon: '📐' },
  { key: 'building',     label: '构建',     icon: '🔨' },  // frontend + backend + audit
  { key: 'confirm',      label: '验收',     icon: '✓'  },
]
```

**设计决策**：前后端 Worker + 审计合并为一个「构建」步骤对外展示（building phase 封装了内部复杂性），用户感知到的是五步而非七步。详细模式下可展开「构建」步骤看到前端/后端 Worker 的独立进度。

#### 结果验收面板

```typescript
interface ConfirmPanelProps {
  visible: boolean                      // phase === 'awaiting_confirm'
  artifacts: AiDoneEvent['artifacts']
  summary: string                       // done 事件的 summary
  onConfirm: () => void
  onDiscard: () => void
}
```

用户在画布上预览效果（`app_snapshot` 已实时更新画布），确认面板展示变更概览，确认后才持久化。

### API 变更

#### 请求接口不变

```typescript
// 发起对话（不变）
POST /ai/:appId/chat { prompt, type, images }

// 确认/撤销（不变）
POST /ai/:appId/confirm {}
POST /ai/:appId/discard {}
```

#### 恢复接口变更

```typescript
// 旧：resume interrupt（humanGate 确认后恢复）
POST /ai/:appId/resume { resumeValue: { approved: true/false, feedback? } }

// 新：去掉此接口。无 humanGate 则无 interrupt，无需 resume。
// 用户对结果不满意时，发新消息（新一轮 Dialogue），intent 节点判断从哪里修正。
```

#### 历史加载接口变更

```typescript
// 旧：
GET /applications/:appId/conversation/dialogues?limit=50
// 返回 { dialogues: Dialogue[] }，Dialogue 含 threadId/threadStatus

// 新：
GET /applications/:appId/dialogues?limit=50
// 返回 { dialogues: Dialogue[] }，Dialogue 含 phase/planningEntries/artifacts
```

#### 新增：获取 pending confirm 详情

```typescript
// 旧：
GET /ai/:appId/pending → { hasPending, pending: PendingDialogueInfo }

// 新（语义不变，字段对齐）：
GET /ai/:appId/pending → {
  hasPending: boolean
  dialogue?: {
    _id: string
    phase: 'awaiting_confirm'
    summary: string
    artifacts: { pagesModified, collectionsModified, functionsModified }
    createdAt: string
  }
}
```

### 交互流程对比

#### task 路径（旧）

```
用户输入 → SSE 开始
  → planning_progress (pm/arch/visual/task)  → PlanningCard 四步
  → interrupt (humanGate)                    → PlanApprovalCard
  → 用户确认 → resume SSE
  → tool_call/tool_result                    → ToolRow 混排
  → text_delta                               → 流式文字
  → app_snapshot                             → 画布实时更新
  → done                                     → hasPendingTask=true
  → 用户确认/撤销                            → confirm/discard API
```

#### task 路径（新）

```
用户输入 → SSE 开始
  → phase_change(start)                      → PhaseProgressBar 初始化
  → phase_change(requirements)               → 第1步点亮
  → agent_progress(requirements, completed)  → 第1步完成 ✓
  → phase_change(ui_design)                  → 第2步点亮
  → agent_progress(uiDesign, completed)      → 第2步完成 ✓
  → phase_change(contract)                   → 第3步点亮
  → agent_progress(contract, completed)      → 第3步完成 ✓
  → phase_change(building)                   → 第4步点亮
  → agent_progress(frontend, started)        → [详细] 前端开始
  → agent_progress(backend, started)         → [详细] 后端开始
  → tool_activity(frontend, 1, calling_tool) → [详细] 前端工具调用
  → app_snapshot                             → 画布实时更新
  → agent_progress(frontend, completed)      → [详细] 前端完成
  → agent_progress(backend, completed)       → [详细] 后端完成
  → audit_progress(checking)                 → [详细] 审计中
  → audit_progress(passed)                   → [详细] 审计通过
  → phase_change(awaiting_confirm)           → 第5步点亮 + ConfirmPanel 展示
  → 用户确认/撤销                            → confirm/discard API
  → phase_change(committing)                 → 提交中...
  → text(总结文字流)                         → 变更摘要展示
  → phase_change(done)                       → 全部完成
  → done { summary, artifacts }              → 终态
```

#### chat 路径（变化最小）

```
用户输入 → SSE 开始
  → phase_change(start)          → 无 UI 变化（瞬间）
  → phase_change(responding)     → loading 指示器
  → text(增量文字)               → 流式文字渲染 + 光标动画
  → app_snapshot（如有只读工具）  → 画布更新
  → phase_change(done)           → 终态
  → done { summary }             → 追加到历史
```

### 渐进迁移策略

前端迁移不需要一步到位，可以分三步：

**Phase 1：事件兼容层**

在 `api/ai.ts` 的 `parseSSEChunk` 中增加事件映射层，将新事件转为旧格式回调。这使得 `useXiangDi` hook 和所有 UI 组件不需要立即修改。

```typescript
// 临时兼容层：新事件 → 旧事件回调
function adaptEvent(rawEvent: NewAiStreamEvent): OldAiStreamEvent | null {
  switch (rawEvent.type) {
    case 'phase_change':
      // 映射为 planning_progress（只针对规划阶段）
      if (['requirements', 'ui_design', 'contract'].includes(rawEvent.phase)) {
        return { type: 'planning_progress', agent: mapPhaseToAgent(rawEvent.phase), ... }
      }
      return null  // 其他 phase 暂不处理
    case 'text':
      return { type: 'text_delta', text: rawEvent.content }
    // ...
  }
}
```

**Phase 2：Hook + 状态重构**

替换 `useXiangDi` 的状态模型和事件分发逻辑。此时 UI 组件可以逐步迁移：先替换 `PlanningCard` → `PhaseProgressBar`，再退役 `PlanApprovalCard` / `DisambiguationPanel`。

**Phase 3：UI 组件精细化**

实现「标准模式」UI（phase 进度条 + agent 进度 + 结果确认面板），可选实现「详细模式」（工具活动日志、审计过程展示）。

### 关键设计决策总结

| 决策 | 理由 |
|------|------|
| task 路径不再展示流式文字 | 用户是非开发者，看到 Agent 的思考过程没有价值，只需知道"到第几步了" |
| 前后端 Worker + 审计合并为一个「构建」步骤 | 简化心智模型；内部回退对用户不可见 |
| 去掉 humanGate/interrupt/resume | 零代码用户看不懂方案；验收点后移到最终结果 |
| 去掉 disambiguation 消歧卡片 | 新架构不再需要中间消歧，intent 节点一次性路由 |
| 画布实时更新保留 `app_snapshot` | building 阶段前端 Worker 每次 patchProjection 后仍推送快照，用户看到画布逐步成型 |
| chat 路径流式文字保留 | respond 节点仍然是流式 LLM 输出，用户体验不变 |
| `awaiting_confirm` 是唯一用户决策点 | 简洁：全自动执行 → 一次性验收；不满意发新消息修正 |

## 待细化项（全部完成）

1. ~~SubAgent 统一协议的精确定义~~ ✓
2. ~~IntegrationContract 的精确格式~~ ✓
3. ~~各 SubAgent 的结构化输出 schema~~ ✓
4. ~~intent 节点的 prompt 设计~~ ✓
5. ~~Orchestrator 回退仲裁的 prompt 设计~~ ✓
6. ~~LangGraph 实现方案~~ ✓
7. ~~SSE 事件设计~~ ✓
8. ~~前端消费新架构 SSE 事件与会话模型~~ ✓

---

## 后果

### 正面

- 前端 Worker 按页面粒度执行 + patch 语义写入，解决 App 级 lifetimes 丢失问题，且数据结构天然兼容未来拆为多 Page Worker 并行
- 消除了 Plan/Execute 刚性边界导致的回退困难
- 前后端领域分离，各自 Worker 的 context window 更精炼
- `awaiting_confirm` 永久保留（无 TTL 清理）：用户可以跨越时间间隔回来确认或拒绝历史变更，多个待验收的 Dialogue 构成版本选择列表，用户拥有完整的历史还原能力
- 云函数生成从"工具里藏 LLM"回归为"Agent 直接决策"，上下文完整
- 扁平结构使流程可观测——每个 SubAgent 的输入输出都可以作为 SSE 事件暴露给前端
- 契约机制使前后端的依赖关系显式化，审计有明确的校验基准
- 去掉中间 humanGate 简化了流程——零代码用户不需要理解中间产物
- 统一 SubAgent 协议使新增领域 Agent 的成本极低
- 全流程自动 + 审计回退机制保证了质量，同时不打断用户体验
- Phase 以 SubAgent 粒度暴露，用户可感知"数字员工"协作进度
- 去掉 baseAppJSON 概念，Dialogue 链本身就是版本历史，简化数据模型

### 负面

- intent 节点直接路由到 Worker 时，依赖历史工件完整性——若历史工件缺失，intent 仍需回退到上游节点，对用户不透明，需要通过前端展示当前流程状态来减少困惑
- 回退机制如果设计不当，可能导致循环（硬上限 3 次兜底）
- intent 节点的 LLM 判断准确性直接影响用户体验——判断错误会导致不必要的重跑或错误续接
- 契约定义的质量成为整个流程的瓶颈——契约不够精确则并行执行后审计大概率失败

### 风险

- 回退仲裁的准确性直接影响整体效率——错误的回退会浪费 token
- 简单任务的 token 开销上升需要通过各 SubAgent "薄产出"能力来缓解——如果 SubAgent 不够智能（对简单任务仍然产出冗长内容），成本会显著上升
- 前后端并行时，两边都失败的情况需要 Orchestrator 合理处理（不能简单重跑两次全链）
- 简单任务的 token 开销上升需要通过 intent 节点的自由路由能力缓解（直接路由到 Worker，跳过规划节点）
