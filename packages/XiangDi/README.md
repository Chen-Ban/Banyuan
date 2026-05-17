# 相地 · XiangDi

> 《园冶》有云："相地合宜，构园得体。"  
> 造园之始，先察山川形势，方能因地制宜，布局得当。

**XiangDi** 是 Banyuan 的 AI Agent 引擎。它感知设计意图（自然语言 + 设计稿），规划生成路径，驱动 BanvasGL 画布生长。作为独立 npm 包，可被任何宿主（Electron、Web、CLI）集成。

---

## 架构

```
用户输入（自然语言）
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                      Spec 层（规划）                        │
│                                                           │
│   SpecPlanner                  ChangeSpecBuilder          │
│   一次专用 LLM 调用              手动构建变更计划             │
│   自然语言 → 类型化 ChangeSpec    （测试 / 精确控制场景）      │
│                                                           │
│   ProjectSpecLoader                                       │
│   从 AGENTS.md 加载项目级规范，注入 system prompt           │
└───────────────────────┬───────────────────────────────────┘
                        │ ChangeSpec (approved)
                        ▼
┌───────────────────────────────────────────────────────────┐
│                    Harness 层（约束）                       │
│                                                           │
│   HarnessRunner                                           │
│   ├── 加载 ProjectSpec → 注入 system prompt               │
│   ├── Guards（前置守卫）：阻断不合规执行                     │
│   ├── HumanGates（人工介入）：暂停等待用户确认               │
│   ├── AgentLoop.run()                                     │
│   └── Checkpoints（后置验证）：验证结果，可触发回滚           │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│                    Core 层（执行）                          │
│                                                           │
│   AgentLoop                    ToolRegistry               │
│   Anthropic Agentic Loop       工具注册与执行               │
│   tool_use 驱动，推理内化        BanvasToolProtocol         │
│   支持 AbortSignal 中断          标准化工具调用协议           │
│                                                           │
│   ContextManager               StreamBridge              │
│   对话历史管理                   流式事件总线                │
│   tool_use/result 配对感知                                 │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│                   Schema 转换层                            │
│                                                           │
│   AISchema（Zod）               Converters                │
│   LLM 输出的结构定义              AIApp ↔ BanvasGL 双向转换  │
└───────────────────────────────────────────────────────────┘
                        │
                        ▼
                  BanvasGL 画布操作
```

---

## 核心理念：Spec 是架构契约，不是外挂

大多数 AI Agent 框架（LangGraph、CrewAI、AutoGen）的核心抽象是图节点、角色、工具调用。如果你想在这些框架里引入"规范约束"，通常的做法是把约束文本塞进 system prompt，或者在外层自己写一个 planning 节点——框架本身对 Spec 毫无感知，Spec 只是用户的约定，不是引擎的契约。

XiangDi 的选择不同：**Spec 是引擎的一等公民数据结构，贯穿规划 → 执行 → 验证全链路。**

---

## 两层 Spec 架构

### ProjectSpec —— 项目级宪法

从 `AGENTS.md` 加载，与项目共存，跨越所有任务。HarnessRunner 在每次 `run()` 时自动加载并注入 system prompt，无需手动处理。

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

由用户输入触发，通过 SpecPlanner 或 ChangeSpecBuilder 生成，描述"这次要做什么"，驱动 Harness 执行。

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

**AGENTS.md**（OpenAI + Google + Anthropic 等联合，2025年）是目前最接近 ProjectSpec 概念的行业标准，但它是文件格式规范，没有运行时架构。XiangDi 的 `FileProjectSpecLoader` 兼容 AGENTS.md 格式，同时将其纳入有类型约束的运行时体系。

**Amazon Kiro**（2025年）核心也是 Spec-Driven Development，但 Kiro 是 IDE 产品，Spec 是文件系统上的 Markdown，不对外暴露引擎接口。XiangDi 是可嵌入的引擎库，Spec 是强类型数据结构。

---

## 快速上手

```bash
pnpm add xiangdi
```

### 完整流程

```ts
import {
  AgentLoop, ToolRegistry,
  SpecPlanner, ChangeSpecBuilder,
  FileProjectSpecLoader,
  HarnessRunner, Guards, Checkpoints, HumanGates,
} from 'xiangdi'

// 1. 注册工具
const registry = new ToolRegistry()
// registry.register(...)

// 2. 初始化 AgentLoop
const agentLoop = new AgentLoop(
  { llm: { model: 'claude-opus-4-5' }, systemPrompt: '你是一个画布设计助手。' },
  registry
)

// 3. SpecPlanner：自然语言 → 类型化 ChangeSpec
const planner = new SpecPlanner({ client: llmClient, model: 'claude-opus-4-5' })
const { spec: draftSpec } = await planner.plan(
  '帮我创建一个登录页面，包含用户名、密码输入框和登录按钮'
)

// 4. 人工审核后 approve
const spec = ChangeSpecBuilder.transition(draftSpec, 'approved')

// 5. HarnessRunner：ProjectSpec 自动注入 + Guard/Checkpoint 约束
const harness = new HarnessRunner(
  agentLoop,
  llmClient,
  {
    guards: [Guards.specApproved(), Guards.hasAtLeastOneTask()],
    checkpoints: [Checkpoints.outputNotEmpty()],
    humanGates: [HumanGates.reviewProposal(), HumanGates.reviewTasks()],
  },
  new FileProjectSpecLoader({ cwd: process.cwd() })
)

// 6. 执行
const result = await harness.run(spec)
```

### 仅使用 SpecPlanner

```ts
const planner = new SpecPlanner({ client: llmClient, model: 'claude-sonnet-4-5' })
const { spec, parsed, rawOutput } = await planner.plan(userInput)

if (!parsed) {
  // LLM 输出无法解析为 JSON 时，spec 是 fromText 的降级结果
  console.warn('规划降级，原始输出：', rawOutput)
}
```

---

## 模块结构

```
src/
├── core/
│   ├── AgentLoop.ts          # Tool-Use Loop（Anthropic Agentic Loop 模式）
│   ├── ToolRegistry.ts       # 工具注册与执行
│   ├── ContextManager.ts     # 对话历史管理，感知 tool_use/result 配对边界
│   └── StreamBridge.ts       # 流式事件总线
│
├── spec/
│   ├── types.ts              # ProjectSpec + ChangeSpec 类型定义
│   ├── SpecPlanner.ts        # LLM 自动生成 ChangeSpec（规划阶段）
│   ├── ChangeSpecBuilder.ts  # ChangeSpec 构建 / 变换工具集
│   ├── ProjectSpecLoader.ts  # AGENTS.md 加载与解析
│   └── MemoryChangeSpecStore.ts
│
├── harness/
│   ├── HarnessRunner.ts      # 执行编排：Guard → HumanGate → AgentLoop → Checkpoint
│   ├── guards.ts             # 内置 Guard 集合
│   ├── checkpoints.ts        # 内置 Checkpoint 集合
│   ├── humanGates.ts         # 内置 HumanGate 集合
│   └── types.ts
│
├── schema/
│   ├── AISchema.ts           # LLM 输出的 Zod Schema
│   └── converters.ts         # AIApp ↔ BanvasGL 双向转换
│
├── tools/
│   └── BanvasToolProtocol.ts # 标准化工具调用协议
│
└── prompts/
    ├── system.ts             # 系统提示词
    └── fewshots.ts           # Few-shot 示例
```

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。
