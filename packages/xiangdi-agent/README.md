# 相地 · XiangDi（`@banyuan/xiangdi-agent`）

> 《园冶》有云："相地合宜，构园得体。"  
> 造园之始，先察山川形势，方能因地制宜，布局得当。

**XiangDi** 是 Banyuan 的 AI Agent 引擎。它感知设计意图（自然语言 + 设计稿），规划生成路径，驱动 BanvasGL 画布生长。作为独立 npm 包（`@banyuan/xiangdi-agent`），可被任何宿主（Electron、Web、CLI）集成。

---

## 架构

```
用户输入（自然语言）
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│                 MasterGraph V2（LangGraph）                  │
│                                                            │
│   START → plan ↔ humanGate → execute → assemble           │
│                              → audit ↔ execute（重试）      │
│              → summarize → extractMemory → END             │
│                                                            │
│  ─── 五层上下文模型 ───────────────────────────────────── │
│  L1: SystemPrompt     — 角色定义 + 工具定义 + 通用规则       │
│  L2: AgentMemory      — Agent 经验 + 事实（含用户偏好）      │
│  L3: ContextSummary   — 历史对话摘要（未选中 round 的        │
│                         roundSummary 拼接，由后端动态生成）   │
│  L4: RecentMessages   — 最近 N 轮对话                       │
│  L5: CurrentPrompt    — 当前用户输入                        │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│                    Core 层（基础设施）                        │
│                                                            │
│   ToolRegistry                  LLMClient 接口              │
│   工具注册与执行                   DeepSeek（主）/ Kimi（备） │
│   BanvasToolProtocol             LLMRouter 健康检测          │
│                                                            │
│   ConflictDetector              DisambiguationHandler       │
│   冲突检测                       歧义消解                    │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│                   Schema 转换层（AI Projection）              │
│                                                            │
│   toAIProjection / fromAIProjection                        │
│   BanvasGL 原生 JSON ↔ LLM 友好的投影格式（双向无损）       │
│   展平 $type/$value → 语义化 transform / decoration 等     │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│                  Knowledge 层（RAG）                         │
│                                                            │
│   LanceDBKnowledgeStore         MemoryKnowledgeStore        │
│   向量 + BM25 混合检索             内存检索（测试场景）       │
│                                                            │
│   EmbeddingService              GraphologyGraphStore        │
│   本地 ONNX 推理（384 维）         图结构知识库（GraphRAG）   │
│                                                            │
│   LLMRetrievalRouter / RuleBasedRouter                     │
│   LLM / 规则驱动的检索路由                                  │
└────────────────────────────────────────────────────────────┘
        │
        ▼
                  BanvasGL 画布操作
```

---

## MasterGraph V2 节点说明

XiangDi 的执行引擎是基于 LangGraph `StateGraph` 实现的 MasterGraph V2，不是手写 AgentLoop，也不是经典 ReAct。

| 节点 | 职责 |
|------|------|
| `plan` | 接收五层上下文（L1~L5），识别用户意图，生成结构化执行方案（`PlanOutput`），并按依赖关系拆分任务。支持两种模式：单 LLM 规划（默认）/ 多智能体规划（`enableMultiAgentPlanning=true`，调度 PlanningOrchestrator） |
| `humanGate` | Human-in-the-Loop 审批。`autoRun=true` 时直接通过；`autoRun=false` 时通过 LangGraph `interrupt()` 等待外部 resume 信号 |
| `execute` | 按任务拓扑序执行，无依赖任务 `Promise.all` 并行；每个 task 独立运行 think↔tools Agentic Loop |
| `assemble` | 组装多 task 执行结果（当前轻量实现，未来扩展用） |
| `audit` | 两阶段审计：Phase 1 硬性规则校验（零 token）+ Phase 2 LLM 风格/意图校验；不通过时携带错误信息路由回 `execute`；达到重试上限后进入 `summarize` |
| `summarize` | Phase 1 代码提取结构化改动信息（零 token）→ Phase 2 LLM 归纳为自然语言摘要，生成 `roundSummary` 并通过 SSE 推给 banyan 后端持久化 |
| `extractMemory` | 提取经验(Episode)、事实(Fact)和用户偏好，通过 SSE `memory_update` 事件推给 banyan 后端写入 AgentMemory |

---

## ChatGraph（轻量聊天管线）

除 MasterGraph 外，XiangDi 还提供 `ChatGraph`——一个不注册任何工具的轻量对话管线：

```
START → think → extractMemory → END
```

适用于用户闲聊、确认需求、讨论方案等非画布操作场景。仅做自然语言对话 + 偏好提取。

---

## 多智能体规划管线（ADR-032/033/034）

当 `enableMultiAgentPlanning=true` 时，plan 节点内部调度 `PlanningOrchestrator`，四个专业角色串行协作：

```
PM → Arch → Visual → TaskPlanner
```

| 角色 | 职责 | 可用工具 |
|------|------|----------|
| **PM Agent** | 需求分析，输出 FeatureList | 无 |
| **Arch Agent** | 技术架构，输出 TechPlan（ViewChanges + SchemaChanges） | knowledge_search, get_adr_constraints, get_existing_schema |
| **Visual Agent** | 视觉规格，输出 VisualSpec（页面布局 + 设计 Token） | get_page_tree, get_design_tokens |
| **TaskPlanner Agent** | 任务拆解，输出 ChangeSpec（可执行任务列表） | get_pages, get_page_tree, validate_change_spec |

每个 SubAgent 拥有独立的 ToolRegistry 子集（白名单隔离）和命名空间记忆注入。

支持中断恢复（Interrupt/Resume）：`ResumeClassifier` 分类用户意图为 continue/refine/restart/clarify 四种策略，按 DAG 依赖关系精准选择从哪个 Agent 重新执行，复用已有产物。

---

## 核心理念：Spec 是架构契约，不是外挂

大多数 AI Agent 框架（LangGraph、CrewAI、AutoGen）的核心抽象是图节点、角色、工具调用。如果你想在这些框架里引入"规范约束"，通常的做法是把约束文本塞进 system prompt，或者在外层自己写一个 planning 节点——框架本身对 Spec 毫无感知，Spec 只是用户的约定，不是引擎的契约。

XiangDi 的选择不同：**Spec 是引擎的一等公民数据结构，贯穿规划 → 执行 → 验证全链路。**

---

## 两层 Spec 架构

### ProjectSpec —— 项目级宪法

从 `AGENTS.md` 加载，与项目共存，跨越所有任务。在 `buildSystemPrompt()` 调用时自动注入 system prompt，无需手动处理。

```markdown
# Project: MyApp

## Conventions
- 所有节点 ID 必须使用 nanoid 生成
- 颜色值统一使用 hex 格式

## Prohibitions
- 不得直接修改 BanvasGL 内部状态，必须通过工具调用
- 不得删除用户未选中的节点

## Agent Guidelines
- 每次工具调用前先 get_app_state 确认当前状态
```

### ChangeSpec —— 变更级施工图

由用户输入触发，通过 `SpecPlanner` 或 `ChangeSpecBuilder` 生成，描述"这次要做什么"，是驱动 Harness 层执行的过程文件。

```ts
{
  id: "add-login-page",
  title: "添加登录页面",
  proposal: {
    why: "用户需要身份验证入口",
    what: "创建包含用户名、密码输入框和登录按钮的登录页面",
    successCriteria: ["页面尺寸 375×812px", "登录按钮全宽蓝色"]
  },
  tasks: [
    { id: "t1", description: "创建登录页面，尺寸 375×812px", done: false },
    { id: "t2", description: "添加用户名输入框", done: false },
    { id: "t3", description: "添加密码输入框", done: false },
    { id: "t4", description: "添加登录按钮，蓝色背景，全宽", done: false }
  ],
  status: "approved"
}
```

---

## 与行业方案的对比

| 维度 | LangGraph / CrewAI | AGENTS.md 标准 | Amazon Kiro | **XiangDi** |
|---|---|---|---|---|
| Spec 内置到引擎 | ❌ 用户自己套 | ❌ 只是文件格式 | ⚠️ 产品内部，不对外 | ✅ 架构一等公民 |
| 两层 Spec 分离 | ❌ | ❌ | ⚠️ 有类似概念 | ✅ ProjectSpec + ChangeSpec |
| Spec 驱动 Guard / Checkpoint | ❌ | ❌ | ❌ | ✅ 深度集成 |
| SpecPlanner（LLM 生成 ChangeSpec）| ❌ 需自己实现 | ❌ | ✅ | ✅ |
| 可嵌入的库（非 IDE 产品）| ✅ | ✅ | ❌ | ✅ |
| Spec 是强类型数据结构 | ❌ | ❌ 松散 Markdown | ❌ 松散 Markdown | ✅ TypeScript 类型化 |

---

## 快速上手

```bash
pnpm add @banyuan/xiangdi-agent
```

### 使用 MasterGraph V2（推荐）

```ts
import {
  createMasterGraph,
  createBanvasToolRegistry,
  buildSystemPrompt,
  generateAISchemaDoc,
  registerKnowledgeSearchTool,
  LLMRouter,
} from '@banyuan/xiangdi-agent'
import { HumanMessage } from '@langchain/core/messages'

// 1. 创建 LLM 客户端
const llmClient = new LLMRouter({
  primary: deepseekClient,
  onSignal: (signal) => console.log('LLM issue:', signal),
})

// 2. 创建画布工具注册表（传入 BanvasHostAdapter）
const registry = createBanvasToolRegistry(adapter)

// 可选：注册知识检索工具
registerKnowledgeSearchTool(registry, knowledgeStore)

// 3. 构建 System Prompt（注入 AI Projection 文档）
const aiSchemaDoc = generateAISchemaDoc()
const systemPrompt = buildSystemPrompt({ aiSchemaDoc })

// 4. 创建 MasterGraph V2
const masterGraph = createMasterGraph({
  llmClient,
  toolRegistry: registry,
  streamCallback: (event) => {
    // 处理 SSE 事件：text_delta / tool_call / tool_result / round_summary / memory_update 等
    console.log(event.type, event.data)
  },
  autoRun: true,                    // false 时启用 Human-in-the-Loop
  maxAuditRetries: 2,               // 审计失败最多重试次数
  enableMultiAgentPlanning: false,   // true 启用四 Agent 规划管线
})

// 5. 执行（注入五层上下文）
const result = await masterGraph.invoke({
  messages: [new HumanMessage('帮我创建一个登录页面，包含用户名、密码输入框和登录按钮')],
  systemPrompt,
  agentMemory: '',       // L2：由 banyan 后端从 MongoDB 检索相关记忆后格式化传入
  contextSummary: '',    // L3：历史对话摘要（未选中 round 的 roundSummary 拼接）
  maxIterations: 30,
  finalText: '',
  planOutput: null,
  planIterations: 0,
  humanApproved: true,
  subResults: [],
  assemblyPlan: null,
  auditResult: null,
  auditRetries: 0,
  auditErrorSummary: '',
  planPhaseSummary: '',
  executePhaseSummary: '',
  roundSummary: '',
  projectSpec: null,
  conflictPending: null,
  planningSnapshot: null,
  resumeIntent: null,
})
```

### 使用 ChatGraph（轻量对话）

```ts
import { createChatGraph } from '@banyuan/xiangdi-agent'

const chatGraph = createChatGraph({
  llmClient,
  streamCallback: (event) => console.log(event.type, event.data),
  enableMemoryExtraction: true,
})

const result = await chatGraph.invoke({
  messages: [new HumanMessage('你觉得蓝色按钮好还是绿色按钮好？')],
  agentMemory: '',
  contextSummary: '',
})
```

### 仅使用 SpecPlanner

```ts
import { SpecPlanner } from '@banyuan/xiangdi-agent'

const planner = new SpecPlanner({ client: llmClient, model: 'deepseek-chat' })
const { spec, parsed, rawOutput } = await planner.plan(
  '帮我创建一个登录页面，包含用户名、密码输入框和登录按钮'
)

if (!parsed) {
  // LLM 输出无法解析为 JSON 时，spec 是 fromText 的降级结果
  console.warn('规划降级，原始输出：', rawOutput)
}
```

### 使用 Harness 层（Guard / Checkpoint 约束）

```ts
import {
  Guards, Checkpoints,
  ChangeSpecBuilder,
  SpecPlanner,
  FileProjectSpecLoader,
} from '@banyuan/xiangdi-agent'

// ChangeSpec 需先经过 Harness Guard 验证
const spec = ChangeSpecBuilder.transition(draftSpec, 'approved')

const guards = [Guards.specApproved(), Guards.hasAtLeastOneTask()]
const checkpoints = [Checkpoints.outputNotEmpty()]

// Guards 可在执行前阻断不合规的 ChangeSpec
for (const guard of guards) {
  const result = await guard.fn(spec)
  if (!result.passed) throw new Error(result.reason)
}
```

---

## 模块结构

```
src/
├── core/
│   ├── ToolRegistry.ts          # 工具注册与执行
│   ├── ConflictDetector.ts      # 冲突检测（含 DecisionLog）
│   ├── DisambiguationHandler.ts # 歧义消解
│   ├── llmTypes.ts              # LLMClient 接口定义
│   └── types.ts                 # Message / StreamEvent / ToolDefinition 等核心类型
│
├── graph/
│   ├── masterGraph.ts           # MasterGraph V2（LangGraph StateGraph 实现）
│   ├── chatGraph.ts             # ChatGraph 轻量聊天管线（START → think → extractMemory → END）
│   ├── state.ts                 # MasterStateAnnotation / ExecuteStateAnnotation + MasterState 类型
│   ├── nodes/
│   │   ├── specNode.ts          # Spec 注入辅助节点（buildSpecSystemPrompt / loadSpecPrompt）
│   │   └── extractMemoryNode.ts # 记忆提取节点（经验 + 事实 + 偏好）
│   ├── planningAgents/          # 多智能体规划子图（ADR-032/033）
│   │   ├── PlanningOrchestrator.ts  # 四 Agent 串行调度器
│   │   ├── PMAgent.ts               # 产品经理 Agent（需求分析 → FeatureList）
│   │   ├── ArchAgent.ts             # 架构师 Agent（技术方案 → TechPlan）
│   │   ├── VisualAgent.ts           # 视觉设计 Agent（视觉规格 → VisualSpec）
│   │   ├── TaskPlannerAgent.ts      # 任务规划 Agent（任务拆解 → ChangeSpec）
│   │   ├── factory.ts               # SubAgent 统一执行工厂（runSubAgent）
│   │   ├── SubAgentContextBuilder.ts # 上下文构建器（按角色裁剪输入）
│   │   └── state.ts                  # SubAgent 状态类型
│   └── resume/                  # 中断续接模块（ADR-034）
│       ├── ResumeClassifier.ts  # 意图分类（continue/refine/restart/clarify）
│       ├── invalidation.ts      # DAG 依赖图 + 产物失效计算
│       ├── strategies.ts        # 四种恢复策略实现
│       └── types.ts             # PlanningSnapshot / ResumeClassification 等类型
│
├── spec/
│   ├── types.ts                 # ProjectSpec + ChangeSpec 类型定义
│   ├── planningTypes.ts         # 多智能体规划产物类型（FeatureList/TechPlan/VisualSpec 等）
│   ├── SpecPlanner.ts           # LLM 自动生成 ChangeSpec（规划阶段）
│   ├── ChangeSpecBuilder.ts     # ChangeSpec 构建 / 状态转换工具集
│   ├── ProjectSpecLoader.ts     # AGENTS.md / xiangdi.spec.md 加载与解析
│   └── MemoryChangeSpecStore.ts # 内存 ChangeSpec 存储
│
├── harness/
│   ├── guards.ts                # 内置 Guard 集合（specApproved / hasAtLeastOneTask / noProhibitedKeywords / proposalComplete / customGuard）
│   ├── checkpoints.ts           # 内置 Checkpoint 集合（outputNotEmpty / outputMatchesPattern / allTasksDone / outputMinLength / customCheckpoint）
│   └── types.ts                 # Guard / Checkpoint / HarnessContext / HarnessConfig 类型
│
├── schema/
│   ├── projection.ts            # AI Projection 转换器（ADR-027）：toAIProjection / fromAIProjection / appJSONToProjection / projectionToAppJSON
│   └── projection.types.ts      # AI Projection 类型（AIProjectionScene / AIProjectionNode / AITransform / AIDecoration 等）
│
├── tools/
│   ├── BanvasToolProtocol.ts       # 标准化工具调用协议（8 个画布原子操作）
│   ├── createBanvasToolRegistry.ts # 预置 BanvasGL 工具集工厂
│   ├── KnowledgeSearchTool.ts      # 知识库检索工具
│   ├── WebSearchTool.ts            # 网络搜索工具
│   ├── CloudFunctionTools.ts       # 云函数工具（生成/更新/解释）
│   ├── SchemaTools.ts              # Schema 操作工具（读取/设置集合）
│   ├── MaterialTools.ts            # 物料工具（搜索/获取详情）
│   └── PlanningReadonlyTools.ts    # 规划只读工具集（get_adr_constraints / get_existing_schema / get_page_tree / get_design_tokens / get_pages / validate_change_spec）
│
├── knowledge/
│   ├── LanceDBKnowledgeStore.ts    # 向量 + BM25 混合检索，本地持久化（生产推荐）
│   ├── MemoryKnowledgeStore.ts     # 内存知识库（测试 / 轻量场景）
│   ├── GraphologyGraphStore.ts     # 图结构知识库（GraphRAG，关系推理）
│   ├── EmbeddingService.ts         # 本地 ONNX 推理（multilingual-e5-small，384 维）
│   ├── LLMRetrievalRouter.ts       # LLM 驱动的检索路由 + RuleBasedRouter
│   ├── types.ts                    # KnowledgeStore / KnowledgeEntry / GraphKnowledgeStore 类型
│   └── seeds/                      # 知识种子（schema / theme / composition 三层）
│       ├── schema/                 # 节点类型与属性定义（combinedview / graphview / textview / imageview / videoview / nodeview / edgeview / portview / scene / common）
│       ├── composition/            # UI 组合模式（login-form / product-card / stats-dashboard / modal-dialog / data-table 等）
│       └── theme/                  # 设计主题（theme-default / theme-dark）
│
├── llm/
│   ├── DeepSeekClient.ts        # DeepSeek LLM 客户端实现
│   ├── KimiClient.ts            # Kimi (Moonshot) LLM 客户端实现
│   └── LLMRouter.ts             # 多 LLM 健康检测与路由（异常检测 + 信号发射 + Provider 切换预留）
│
├── memory/
│   ├── LocalEpisodicMemory.ts      # 本地情节记忆（中期经验）
│   ├── LocalSemanticMemory.ts      # 本地语义记忆（长期事实）
│   ├── DefaultMemoryManager.ts     # 默认记忆管理器
│   ├── NamespacedMemoryManager.ts  # 命名空间记忆管理器（ADR-033，多 Agent 隔离）
│   └── SharedMemoryWriter.ts       # 共享记忆写入器（跨 Agent 知识共享）
│
├── orchestration/
│   ├── types.ts                 # 编排层类型定义（Port 系统 / SubAgentTask / AssemblyPlan / AuditResult）
│   └── index.ts                 # 导出类型 + DEFAULT_ORCHESTRATION_CONFIG
│
└── prompts/
    ├── system.ts                # 系统提示词（XIANGDI_SYSTEM_PROMPT / buildSystemPrompt / generateAISchemaDoc / generateNodeSchemaDoc）
    ├── fewshots.ts              # Few-shot 示例（FEWSHOT_CREATE_LOGIN_PAGE 等）
    └── agentPrompts.ts          # 多 Agent 提示词管理（DEFAULT_AGENT_PROMPTS / getAgentPrompt / getAgentPromptVersions）
```

---

## AI Projection（ADR-027）

Schema 转换层不再使用 AISchema（Zod）+ Converters 的双向转换架构，而是采用 **AI Projection** 统一投影方案：

- `toAIProjection`：将 BanvasGL Serializer 原生 JSON（`$type/$value` 格式）无损转换为 LLM 友好的投影格式
- `fromAIProjection`：反向转换，恢复为原生格式
- `appJSONToProjection` / `projectionToAppJSON`：应用级便捷封装

设计原则：展平 `$type/$value` 包装 → 语义化 transform/decoration → 省略默认值 → 保留所有信息确保可逆。

---

## 知识体系（ADR-040）

### 核心定义

**XiangDi 的知识 = BanvasGL 能力体系的完整认知。**

包含两个不可分割的维度：

- **语义维度（What）**：每种 ViewType / graphType / layoutMode 是什么、能做什么、适合什么场景、有什么限制——让 LLM 知道"该用什么"
- **格式维度（How）**：在理解语义后，如何将其表达为合法的 AI Projection JSON——让 LLM 知道"怎么写"

LLM 对通用 UI 世界的理解（什么是详情页、什么是导航栏）来自预训练，不需要教。需要教的是 BanvasGL 特有的能力体系——哪些是 BanvasGL 能表达的、每种表达方式的能力边界和适用场景。正确性验证：格式维度通过 `fromAIProjection()` 程序化验证；语义维度通过 code review 确认。

### 信息三层架构

XiangDi 的信息来源分三层：ProjectSpec（全局约束，管线注入）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）。

### 知识归属架构

- **系统级知识**：存储在 knowledge-server（:3003），所有应用共享。包含 Schema/Composition/Theme 三层种子。通过 `knowledge_search` 工具按需检索。
- **应用级知识**：appJSON 本身就是应用的全部知识。应用的设计风格、布局偏好、颜色体系隐含在页面结构中。通过程序化工具（如 `analyze_app_style`）从 appJSON 提取风格摘要，零额外存储成本。
- **消费原则**：所有知识走 Tool 模式按需拉取，system prompt 不注入应用特定信息，保持 Prompt Cache 命中率。

### 知识种子三层分类

知识种子（`src/knowledge/seeds/`）按知识本质分三层：

- **schema/**（能力认知）：BanvasGL 能力体系的完整描述（语义+格式合一）。包含每种 ViewType 的功能定位、适用场景、能力边界（语义维度）+ 属性名/类型/合法值域/最小示例（格式维度）。格式维度从 TypeScript 类型定义自动生成（`generate-knowledge.ts`，postbuild 阶段）；语义维度需要人工编写。
- **composition/**（组合模式）：高质量 Few-shot 示例，展示如何运用能力认知解决具体 UI 问题。包含选型决策理由、完整 AI Projection JSON 片段。LLM 初始生成 → `fromAIProjection()` 程序化验证 → 人工 review 视觉效果。
- **theme/**（视觉表现）：视觉决策的知识化表达，包含语义映射（什么场景用什么视觉处理）、层次规则（如何表达信息主次）、参数值（规则的具体实例化）。设计师/产品维护，纯手工。

---

## 记忆系统

记忆三层：

- **短期（Working Memory）**：MasterGraph 状态中的 messages（L4+L5）
- **中期（Episodic Memory）**：`LocalEpisodicMemory`——跨任务的执行经验，含成功/失败教训
- **长期（Semantic Memory）**：`LocalSemanticMemory`——稳定的知识和用户偏好

记忆管理器：

- `DefaultMemoryManager`：单应用场景的统一管理器
- `NamespacedMemoryManager`（ADR-033）：多应用/多 Agent 场景的命名空间隔离
- `SharedMemoryWriter`：跨 Agent 的共享记忆写入器

`extractMemory` 节点在每轮 MasterGraph 执行末尾提取经验（Episode）、事实（Fact）和用户偏好，通过 SSE `memory_update` 事件推给 banyan 后端持久化。

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。
