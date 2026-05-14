# 相地 · XiangDi

> 《园冶》有云："相地合宜，构园得体。"  
> 造园之始，先察山川形势，方能因地制宜，布局得当。

**XiangDi** 是 Banyuan 的 AI Agent 引擎。它感知设计意图（自然语言 + 设计稿），规划生成路径，驱动 BanvasGL 画布生长。

---

## 核心理念：Spec 是架构契约，不是外挂

大多数 AI Agent 框架（LangGraph、CrewAI、AutoGen）的核心抽象是图节点、角色、工具调用。如果你想在这些框架里引入"规范约束"，通常的做法是把约束文本塞进 system prompt，或者在外层自己写一个 planning 节点——框架本身对 Spec 毫无感知，Spec 只是用户的约定，不是引擎的契约。

XiangDi 的选择不同：**Spec 是引擎的一等公民数据结构，贯穿规划 → 执行 → 验证全链路。**

```
用户输入
  │
  ▼
SpecPlanner.plan()          ← 一次专用 LLM 调用，输出类型化 ChangeSpec
  │                            职责：规划。不执行，不调用工具。
  ▼
ChangeSpec (draft)
  │
  ▼  [HumanGate: 用户审核 / 修改]
  │
  ▼
ChangeSpec (approved)
  │
  ▼
HarnessRunner.run()
  ├── 加载 ProjectSpec (AGENTS.md)  ← 项目级宪法，自动注入 system prompt
  ├── Guards 前置检查                ← 读取 ChangeSpec 字段，阻断不合规执行
  ├── AgentLoop.run()               ← Tool-Use Loop，按 tasks 驱动工具调用
  │     职责：执行。不感知 Spec，由 HarnessRunner 桥接。
  └── Checkpoints 后置验证          ← 验证结果，可触发回滚
```

---

## 两层 Spec 架构

### ProjectSpec —— 项目级宪法

- **来源**：从 `AGENTS.md` / `xiangdi.spec.md` 等固定文件加载
- **生命周期**：与项目共存，跨越所有任务
- **作用**：注入 system prompt，约束 Agent 的全局行为

```markdown
# Project: MyApp

这是一个低代码画布应用。

## Conventions
- 所有节点 ID 必须使用 nanoid 生成
- 颜色值统一使用 hex 格式

## Prohibitions
- 不得直接修改 BanvasGL 内部状态，必须通过工具调用
- 不得删除用户未选中的节点

## Agent Guidelines
- 每次工具调用前先 get_app_state 确认当前状态
- 创建节点时优先复用已有样式
```

HarnessRunner 在每次 `run()` 时自动加载并注入，**无需手动处理，无需侵入 AgentLoop 构造**。

### ChangeSpec —— 变更级施工图

- **来源**：由用户输入触发，通过 SpecPlanner 或 ChangeSpecBuilder 生成
- **生命周期**：单次任务，完成后可归档
- **作用**：描述"这次要做什么"，驱动 Harness 执行

```ts
{
  id: "add-login-page",
  title: "添加登录页面",
  proposal: {
    why: "用户需要身份验证入口",
    what: "创建包含用户名、密码输入框和登录按钮的登录页面",
    successCriteria: ["页面尺寸 375×812px", "登录按钮全宽蓝色"]
  },
  specs: [
    "Given 用户在登录页 When 点击登录按钮 Then 跳转到首页"
  ],
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

| 维度 | LangGraph / CrewAI / AutoGen | AGENTS.md 标准 | Amazon Kiro | **XiangDi** |
|---|---|---|---|---|
| Spec 是否内置到引擎 | ❌ 用户自己套 | ❌ 只是文件格式标准 | ⚠️ 产品内部实现，不对外 | ✅ 架构一等公民 |
| 两层 Spec 分离 | ❌ | ❌ | ⚠️ 有类似概念但未分层 | ✅ ProjectSpec + ChangeSpec |
| Spec 驱动 Guard / Checkpoint | ❌ | ❌ | ❌ | ✅ 深度集成 |
| SpecPlanner（LLM 生成 ChangeSpec）| ❌ 需自己实现 | ❌ | ✅ | ✅ |
| 可嵌入的库（非 IDE 产品）| ✅ | ✅ | ❌ | ✅ |
| Spec 是强类型数据结构 | ❌ | ❌ 松散 Markdown | ❌ 松散 Markdown | ✅ TypeScript 类型化 |

**AGENTS.md**（OpenAI + Google + Anthropic 等六家联合，2025年）是目前最接近 ProjectSpec 概念的行业标准，但它是一个文件格式规范，没有运行时架构——没有 ChangeSpec、没有 HarnessRunner、没有 Guard/Checkpoint。XiangDi 的 `FileProjectSpecLoader` 兼容 AGENTS.md 格式，同时将其纳入有类型约束的运行时体系。

**Amazon Kiro**（2025年7月）是目前最接近整体思路的产品，核心也是 Spec-Driven Development。但 Kiro 是 IDE 产品，Spec 是文件系统上的 Markdown，不对外暴露引擎接口。XiangDi 是可嵌入的引擎库，Spec 是强类型数据结构，可被任何宿主（Electron / Web / CLI）集成。

---

## 快速上手

### 安装

```bash
pnpm add xiangdi
```

### 完整流程示例

```ts
import {
  AgentLoop, ToolRegistry,
  SpecPlanner, ChangeSpecBuilder,
  FileProjectSpecLoader,
  HarnessRunner, Guards, Checkpoints, HumanGates,
} from 'xiangdi';

// 1. 初始化 AgentLoop
const registry = new ToolRegistry();
// registry.register(...) 注册 BanvasGL 工具

const agentLoop = new AgentLoop(
  { llm: { model: 'claude-opus-4-5' }, systemPrompt: '你是一个画布设计助手。' },
  registry
);

// 2. SpecPlanner：自然语言 → 类型化 ChangeSpec（一次专用 LLM 调用）
const planner = new SpecPlanner({ client: llmClient, model: 'claude-opus-4-5' });
const { spec: draftSpec } = await planner.plan(
  '帮我创建一个登录页面，包含用户名、密码输入框和登录按钮'
);

// 3. 人工审核后 approve（实际场景中接入 UI 交互）
const spec = ChangeSpecBuilder.transition(draftSpec, 'approved');

// 4. HarnessRunner：ProjectSpec 自动注入 + Guard/Checkpoint 约束
const harness = new HarnessRunner(
  agentLoop,
  llmClient,
  {
    guards: [Guards.specApproved(), Guards.hasAtLeastOneTask()],
    checkpoints: [Checkpoints.outputNotEmpty()],
    humanGates: [HumanGates.reviewProposal(), HumanGates.reviewTasks()],
  },
  new FileProjectSpecLoader({ cwd: process.cwd() }) // ← AGENTS.md 自动注入
);

// 5. 执行
const result = await harness.run(spec);
```

### 仅使用 SpecPlanner（不走完整 Harness）

```ts
const planner = new SpecPlanner({ client: llmClient, model: 'claude-sonnet-4-5' });
const { spec, parsed, rawOutput } = await planner.plan(userInput);

if (!parsed) {
  // LLM 输出无法解析为 JSON 时，spec 是 fromText 的降级结果
  console.warn('规划降级，原始输出：', rawOutput);
}
```

### 仅使用 ProjectSpec 加载器

```ts
import { FileProjectSpecLoader, InlineProjectSpecLoader } from 'xiangdi';

// 从文件系统加载（Node.js 环境）
const loader = new FileProjectSpecLoader({ cwd: '/path/to/project' });
const spec = await loader.load();
// spec?.conventions, spec?.prohibitions, spec?.agentGuidelines

// 内联加载（浏览器 / 测试环境）
const loader = new InlineProjectSpecLoader(`
# Project: MyApp
## Conventions
- 颜色值统一使用 hex 格式
`);
```

---

## 模块结构

```
src/
├── core/
│   ├── AgentLoop.ts        # Tool-Use Loop（Anthropic Agentic Loop 模式）
│   ├── ToolRegistry.ts     # 工具注册与执行
│   ├── ContextManager.ts   # 对话历史管理
│   └── StreamBridge.ts     # 流式事件总线
│
├── spec/
│   ├── types.ts            # ProjectSpec + ChangeSpec 类型定义
│   ├── SpecPlanner.ts      # LLM 自动生成 ChangeSpec（规划阶段）
│   ├── ChangeSpecBuilder.ts# ChangeSpec 构建 / 变换工具集
│   ├── ProjectSpecLoader.ts# AGENTS.md 加载与解析
│   └── MemoryChangeSpecStore.ts # 内存态 ChangeSpec 存储
│
├── harness/
│   ├── HarnessRunner.ts    # 执行编排：Guard → HumanGate → AgentLoop → Checkpoint
│   ├── guards.ts           # 内置 Guard 集合
│   ├── checkpoints.ts      # 内置 Checkpoint 集合
│   ├── humanGates.ts       # 内置 HumanGate 集合
│   └── types.ts            # Harness 类型定义
│
├── schema/
│   ├── AISchema.ts         # LLM 输出的 Zod Schema
│   └── converters.ts       # AIApp ↔ BanvasGL 双向转换
│
├── tools/
│   └── BanvasToolProtocol.ts # 标准化工具调用协议
│
└── prompts/
    ├── system.ts           # 系统提示词
    └── fewshots.ts         # Few-shot 示例
```

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。详见项目根目录说明。
