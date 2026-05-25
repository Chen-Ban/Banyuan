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
│  L1: SystemPrompt   — 系统能力描述（AISchema + 工具定义 + 通用规则）│
│  L2: AgentMemory    — Agent 经验 + 事实（含用户偏好）         │
│  L3: Anchor         — 历史记忆锚点（之前对话的压缩摘要）       │
│  L4: RecentMessages — 最近 N 轮对话                         │
│  L5: CurrentPrompt  — 当前用户输入                          │
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
│                   Schema 转换层                              │
│                                                            │
│   AISchema（Zod）               Converters                  │
│   LLM 输出的结构定义              AIApp ↔ BanvasGL 双向转换   │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│                  Knowledge 层（RAG）                         │
│                                                            │
│   LanceDBKnowledgeStore         MemoryKnowledgeStore        │
│   向量 + BM25 混合检索             内存检索（测试场景）         │
│                                                            │
│   EmbeddingService              GraphologyGraphStore        │
│   本地 ONNX 推理（384 维）         图结构知识库（GraphRAG）     │
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
| `plan` | 接收五层上下文（SystemPrompt / AgentMemory / Anchor / RecentMessages / CurrentPrompt），识别用户意图，生成结构化执行方案（`PlanOutput`），并按依赖关系拆分任务 |
| `humanGate` | Human-in-the-Loop 审批。`autoRun=true` 时直接通过；`autoRun=false` 时等待外部 resume 信号 |
| `execute` | 按任务拓扑序执行，无依赖任务 `Promise.all` 并行；每个 task 独立运行 think↔tools Agentic Loop |
| `assemble` | 组装多 task 执行结果（当前轻量实现，未来扩展用） |
| `audit` | LLM 审计执行结果，不通过时携带错误信息路由回 `execute`；达到重试上限后进入 `summarize` |
| `summarize` | 综合 planPhase + executePhase 两阶段小结，生成 `roundSummary` 并通过 SSE 推给 banyan 后端持久化 |
| `extractMemory` | 提取经验(Episode)、事实(Fact)和用户偏好，写入 AgentMemory |

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
  providers: [
    { id: 'deepseek', client: deepseekClient, priority: 0 },
  ],
})

// 2. 创建画布工具注册表（传入 BanvasHostAdapter）
const registry = createBanvasToolRegistry(adapter)

// 可选：注册知识检索工具
registerKnowledgeSearchTool(registry, knowledgeStore)

// 3. 构建 System Prompt（注入 AISchema 文档）
const aiSchemaDoc = generateAISchemaDoc()
const systemPrompt = buildSystemPrompt({ aiSchemaDoc })

// 4. 创建 MasterGraph V2
const masterGraph = createMasterGraph({
  llmClient,
  toolRegistry: registry,
  streamCallback: (event) => {
    // 处理 SSE 事件：text_delta / tool_call / tool_result 等
    console.log(event.type, event.data)
  },
  autoRun: true,          // false 时启用 Human-in-the-Loop
  maxAuditRetries: 2,     // 审计失败最多重试次数
})

// 5. 执行（注入五层上下文）
const result = await masterGraph.invoke({
  messages: [new HumanMessage('帮我创建一个登录页面，包含用户名、密码输入框和登录按钮')],
  systemPrompt,
  contextSummary: '',  // L3：历史对话摘要（未选中 round 的 roundSummary 拼接）
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
│   ├── ConflictDetector.ts      # 冲突检测
│   ├── DisambiguationHandler.ts # 歧义消解
│   ├── llmTypes.ts              # LLMClient 接口定义
│   └── types.ts                 # Message / StreamEvent 等核心类型
│
├── graph/
│   ├── masterGraph.ts           # MasterGraph V2（LangGraph StateGraph 实现）
│   ├── state.ts                 # MasterStateAnnotation + MasterState 类型
│   └── nodes/
│       ├── specNode.ts          # Spec 注入辅助节点
│       └── extractMemoryNode.ts # 记忆提取节点（经验 + 事实 + 偏好）
│
├── spec/
│   ├── types.ts                 # ProjectSpec + ChangeSpec 类型定义
│   ├── SpecPlanner.ts           # LLM 自动生成 ChangeSpec（规划阶段）
│   ├── ChangeSpecBuilder.ts     # ChangeSpec 构建 / 变换工具集
│   ├── ProjectSpecLoader.ts     # AGENTS.md / xiangdi.spec.md 加载与解析
│   └── MemoryChangeSpecStore.ts # 内存 ChangeSpec 存储
│
├── harness/
│   ├── guards.ts                # 内置 Guard 集合（specApproved / hasAtLeastOneTask 等）
│   ├── checkpoints.ts           # 内置 Checkpoint 集合（outputNotEmpty 等）
│   └── types.ts                 # Guard / Checkpoint / HarnessContext 类型
│
├── schema/
│   ├── AISchema.ts              # LLM 输出的 Zod Schema（AIApp / AIPage / AINode 等）
│   └── converters.ts            # AIApp ↔ BanvasGL 双向转换
│
├── tools/
│   ├── BanvasToolProtocol.ts       # 标准化工具调用协议
│   ├── createBanvasToolRegistry.ts # 预置 BanvasGL 工具集工厂
│   ├── KnowledgeSearchTool.ts      # 知识库检索工具
│   ├── WebSearchTool.ts            # 网络搜索工具
│   ├── CloudFunctionTools.ts       # 云函数工具（生成/更新/解释）
│   └── SchemaTools.ts              # Schema 操作工具（读取/写入）
│
├── knowledge/
│   ├── LanceDBKnowledgeStore.ts    # 向量 + BM25 混合检索，本地持久化（生产推荐）
│   ├── MemoryKnowledgeStore.ts     # 内存知识库（测试 / 轻量场景）
│   ├── GraphologyGraphStore.ts     # 图结构知识库（GraphRAG，关系推理）
│   ├── EmbeddingService.ts         # 本地 ONNX 推理（Xenova/multilingual-e5-small，384 维）
│   ├── LLMRetrievalRouter.ts       # LLM 驱动的检索路由
│   ├── types.ts                    # KnowledgeStore / KnowledgeEntry 类型
│   └── seeds/                      # 知识种子（schema / theme / composition 三层）
│
├── llm/
│   ├── DeepSeekClient.ts        # DeepSeek LLM 客户端实现
│   ├── KimiClient.ts            # Kimi (Moonshot) LLM 客户端实现
│   └── LLMRouter.ts             # 多 LLM 健康检测与路由
│
├── memory/
│   ├── LocalEpisodicMemory.ts   # 本地情节记忆（中期经验）
│   ├── LocalSemanticMemory.ts   # 本地语义记忆（长期事实）
│   └── DefaultMemoryManager.ts  # 默认记忆管理器
│
├── orchestration/
│   └── types.ts                 # 编排层类型定义（AuditResult / SubAgentTask 等，被 graph 引用）
│
└── prompts/
    ├── system.ts                # 系统提示词（XIANGDI_SYSTEM_PROMPT / buildSystemPrompt）
    └── fewshots.ts              # Few-shot 示例
```

> **注意**：`orchestration/` 目录下的 `OrchestratorAgent`、`SubAgentRunner`、`LayoutPlanner`、`Assembler`、`AuditorAgent` 类的实现已合并进 MasterGraph V2（`graph/masterGraph.ts`），`orchestration/index.ts` 现仅导出类型定义供 graph 模块引用。

---

## 知识体系（三层架构）

XiangDi 的信息架构分三层：ProjectSpec（全局约束，管线注入）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）。

知识种子（`src/knowledge/seeds/`）分三个层级：

- **schema/**：AISchema.ts 的 Zod Schema 自动生成的结构化文档（app / page / rect / text / image / group / bezier 等），由 `generate-knowledge.ts` 脚本产出
- **theme/**：设计主题与 token（颜色体系、字号 / 间距 / 圆角规范），人工维护
- **composition/**：UI 组合模式（登录表单、商品卡片、数据表格等），LLM 生成 + 人工 review

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。
