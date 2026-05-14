<p align="center">
  <img src="./assets/banyuan-logo.png" alt="Banyuan Logo" width="120" />
</p>

<h1 align="center">班园 Banyuan</h1>

<p align="center">
  <em>虽由人作，宛自天开 —— 以画布为山石，以组件为草木，以数据为活水，造一方数字园林。</em>
</p>

<p align="center">
  <!-- TODO: Replace with real badges when CI/CD and npm publishing are set up -->
  <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2F%20Commercial-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/banvasgl-v0.1.0-green.svg" alt="BanvasGL Version" />
  <img src="https://img.shields.io/badge/xiangdi-v0.1.0-orange.svg" alt="XiangDi Version" />
  <img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/electron-36-47848f.svg" alt="Electron 36" />
</p>

---

**Banyuan（班园）** 是一个以自研 2D 画布引擎为核心的低代码可视化应用设计与生成平台。用户通过拖拽组件、配置属性、编排交互逻辑来设计多页面应用，最终一键构建为跨平台桌面安装包（macOS / Windows / Linux）。

<!-- TODO: 添加截图或 GIF 演示 -->

---

## 核心特性

**BanvasGL 引擎** —— 零外部依赖的自研 2D 图形引擎

- Canvas 2D 双缓冲渲染，支持 DPR 适配
- 丰富的图形基元：线段、圆弧、贝塞尔曲线、多边形、圆角矩形、图片、视频、富文本等
- 完整的场景图体系，支持嵌套视图与分组
- 关键帧动画系统，内置多种缓动函数
- 可视化逻辑引擎（FlowRunner），通过连线编排交互行为，无需编写代码
- 事务化撤销/重做，重计算通过 Web Worker 异步执行
- 吸附对齐、图层管理、序列化/反序列化
- 三入口架构：编辑态 / 服务端 / 运行态物理隔离，运行时产物不含编辑器代码

**Banyan 低代码平台** —— 开箱即用的可视化设计器

- 拖拽式画布编辑器：框选、多选、缩放、旋转、对齐吸附
- 属性 / 样式 / 数据 / 事件四选项卡属性面板
- 内嵌流程图编辑器，可视化编排组件交互事件
- 多页面管理与页面间导航
- 自动保存，一键构建跨平台桌面应用
- 即时预览，零构建在浏览器中查看效果

**XiangDi AI Agent 引擎** —— Spec 内置于引擎架构的 AI 驱动生成层

- **Spec 是架构一等公民**：不同于 LangGraph / CrewAI / AutoGen 等主流框架将 Spec 留给用户自己在外层约定，XiangDi 将 Spec 内置为引擎的核心数据结构，贯穿规划、执行、验证全链路
- **两层 Spec 分离**：ProjectSpec（项目级宪法，跨任务持久，从 `AGENTS.md` 加载，自动注入 system prompt）+ ChangeSpec（变更级施工图，单次任务，包含 proposal / specs / tasks 三段式结构）；两层职责清晰，互不耦合
- **SpecPlanner**：一次专用 LLM 调用将自然语言转化为类型化 ChangeSpec，与 AgentLoop 职责分离——一个规划，一个执行
- **Harness Engineering**：Guard 前置守卫（阻断不合规执行）、Checkpoint 后置验证（验证结果，触发回滚）、HumanGate 人工介入节点（暂停等待确认），Spec 字段直接驱动 Guard/Checkpoint 逻辑，不是外挂而是深度集成
- **可嵌入库，非 IDE 产品**：与 Amazon Kiro 等 Spec-Driven IDE 不同，XiangDi 是一个可被任何宿主（Electron / Web / CLI）集成的引擎包，Spec 是强类型数据结构而非松散 Markdown 文件
- Tool-Use Loop（AgentLoop）：Anthropic Agentic Loop 模式，推理内化于 LLM tool_use 机制，支持 AbortSignal 中断
- AISchema ↔ BanvasGL 双向转换，LLM 输出直接映射为画布操作；BanvasToolProtocol 标准化工具调用协议，解耦 Agent 与画布实现

---

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Banyan 低代码平台 / 你的应用                          │
│            (React 编辑器 + Koa API + Electron 壳)                     │
├──────────────────────────┬──────────────────────────────────────────┤
│     React Hook 桥接层     │          XiangDi AI Agent 引擎            │
│  useDesignBanvas         │                                           │
│  useFlowBanvas           │  ┌─ Harness ──────────────────────────┐  │
│  useRuntimeBanvas        │  │  Guards · Checkpoints · HumanGates │  │
│                          │  └────────────────┬───────────────────┘  │
│                          │  ┌─ Spec ─────────┴───────────────────┐  │
│                          │  │  ProjectSpec (AGENTS.md)           │  │
│                          │  │  ChangeSpec  (proposal + tasks)    │  │
│                          │  └────────────────┬───────────────────┘  │
│                          │  ┌─ Core ─────────┴───────────────────┐  │
│                          │  │  AgentLoop · ToolRegistry          │  │
│                          │  │  ContextManager · StreamBridge     │  │
│                          │  │  AISchema ↔ BanvasGL Converters    │  │
│                          │  │  BanvasToolProtocol · Prompts      │  │
│                          │  └────────────────────────────────────┘  │
├──────────────────────────┴──────────────────────────────────────────┤
│                        BanvasGL 渲染引擎                               │
│      SceneGraph · Renderer · Animation · FlowRunner                  │
│      Serializer · SnapAlign · Math · Workers                         │
└─────────────────────────────────────────────────────────────────────┘
```

BanvasGL 作为独立的 npm 包，通过三个 React Hook 向上层应用暴露能力：`useDesignBanvas`（编辑态）、`useFlowBanvas`（流程编辑态）、`useRuntimeBanvas`（运行态）。上层应用只需消费 Hook 返回的画布元素和操作集，无需关心引擎内部实现。

XiangDi 作为独立的 AI Agent 引擎包，整体是一个 **SDD 驱动的、带 Harness 约束的 Plan-and-Execute Agent**，执行核心是 Tool-Use Loop（Anthropic Agentic Loop 模式）。

**与主流框架的本质差异在于：Spec 不是外挂，是架构契约。** LangGraph、CrewAI、AutoGen 等框架的核心抽象是图节点、角色、工具调用，Spec 完全不在其架构层——如果要用 Spec，需要用户自己在外层套一层，框架本身对此毫无感知。XiangDi 则将 Spec 内置为引擎的一等公民数据结构：SpecPlanner 负责将自然语言规划为类型化 ChangeSpec，HarnessRunner 在执行前自动从 `AGENTS.md` 加载 ProjectSpec 并注入 system prompt，Guard/Checkpoint 直接读取 ChangeSpec 字段做前置守卫和后置验证。Spec 贯穿规划 → 执行 → 验证全链路，而非仅仅是一个 Markdown 文件。

三层各司其职：Spec 层在执行前对齐意图（Plan），AgentLoop 按 tasks 驱动工具调用（Execute），Harness 层在关键节点提供守卫、验证与人工确认（Verify）。AgentLoop 本身并非严格的 ReAct——原始 ReAct 要求模型显式输出 Thought 文本，而现代 LLM 的 tool_use 机制已将推理内化，不再需要强制的 Thought 步骤，因此更准确的叫法是 Anthropic 文档中的 Agentic Loop。

项目采用 pnpm monorepo 管理，包含核心引擎包、AI Agent 引擎包、平台服务包、Banyan 低代码平台应用，以及 LunlunGlass 眼镜店管理系统示例。

---

## 项目结构

```
Banyuan/
├── packages/
│   ├── BanvasGL/          # 核心 2D 图形引擎 (npm 包)
│   ├── XiangDi/           # AI Agent 引擎 (npm 包)
│   │   └── src/
│   │       ├── core/      #   AgentLoop · ToolRegistry · ContextManager
│   │       ├── spec/      #   SDD 两层规范：ProjectSpec + ChangeSpec
│   │       ├── harness/   #   Harness：Guards · Checkpoints · HumanGates
│   │       ├── schema/    #   AISchema ↔ BanvasGL 双向转换
│   │       ├── tools/     #   BanvasToolProtocol 工具调用协议
│   │       └── prompts/   #   系统提示词 + Few-shot 示例
│   └── server/            # 平台后端服务 (预览 + 构建)
│
├── apps/
│   └── banyan/            # Banyan 低代码平台
│       ├── frontend/      #   React + Vite + Ant Design
│       ├── backend/       #   Koa + MongoDB
│       └── electron/      #   Electron 桌面壳
│
└── examples/
    └── lunlunglass/       # 示例：眼镜店管理系统
        ├── frontend/
        ├── backend/
        └── electron/
```

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 10
- [MongoDB](https://www.mongodb.com/) >= 6.0

### 安装与启动

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 启动 Banyan 低代码平台
pnpm dev:banyan

# 或启动 LunlunGlass 示例
pnpm dev:lunlunglass
```

启动后，前端编辑器运行在 `http://localhost:5174`（Banyan）或 `http://localhost:5173`（LunlunGlass），Electron 桌面窗口会自动打开。

### 其他命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:banyan` | 启动 Banyan 全栈开发 |
| `pnpm dev:lunlunglass` | 启动 LunlunGlass 全栈开发 |
| `pnpm dev:server` | 启动构建/预览服务 |
| `pnpm build` | 构建 BanvasGL 引擎 |
| `pnpm build:all` | 构建所有子包 |

---

## 使用

### 编辑态 —— 构建你自己的设计器

```tsx
import { useDesignBanvas } from 'banvasgl';

function MyEditor({ pages }) {
  const {
    Banvas,             // 画布 React 元素
    actions,            // 操作集 (view / page / history)
    selectedViewId,     // 当前选中视图
    builtinComponents,  // 内置组件
  } = useDesignBanvas(pages, { width: 800, height: 600 });

  return (
    <div>
      <Sidebar components={builtinComponents} />
      {Banvas}
      <PropertyPanel viewId={selectedViewId} actions={actions} />
    </div>
  );
}
```

### 运行态 —— 渲染已发布的应用

```tsx
import { useRuntimeBanvas } from 'banvasgl/runtime';

function App({ pages }) {
  const { Banvas } = useRuntimeBanvas(pages, { width: 800, height: 600 });
  return <div>{Banvas}</div>;
}
```

### XiangDi —— AI 驱动生成

XiangDi 的完整流程分三段：**规划（SpecPlanner）→ 执行（HarnessRunner + AgentLoop）→ 验证（Harness）**。

```ts
import {
  AgentLoop, ToolRegistry,
  SpecPlanner, ChangeSpecBuilder,
  FileProjectSpecLoader, InlineProjectSpecLoader,
  HarnessRunner, Guards, Checkpoints, HumanGates,
} from 'xiangdi';

// ── 方式一：SpecPlanner 自动规划（推荐）──────────────────────────────────────
// SpecPlanner 用一次专用 LLM 调用将自然语言转化为类型化 ChangeSpec
// 与 AgentLoop 职责分离：一个规划，一个执行

const planner = new SpecPlanner({ client: llmClient, model: 'claude-opus-4-5' });
const { spec: draftSpec, parsed } = await planner.plan(
  '帮我创建一个登录页面，包含用户名、密码输入框和登录按钮'
);
// draftSpec.status === 'draft'，等待人工审核后 transition 到 'approved'
const spec = ChangeSpecBuilder.transition(draftSpec, 'approved');

// ── 方式二：手动构建 ChangeSpec ───────────────────────────────────────────────
let spec = ChangeSpecBuilder.fromText('帮我创建一个登录页面');
spec = ChangeSpecBuilder.addTask(spec, '创建登录页面，尺寸 375×812px');
spec = ChangeSpecBuilder.addTask(spec, '添加用户名输入框');
spec = ChangeSpecBuilder.addTask(spec, '添加密码输入框');
spec = ChangeSpecBuilder.addTask(spec, '添加登录按钮，蓝色背景，全宽');
spec = ChangeSpecBuilder.transition(spec, 'approved');

// ── ProjectSpec：从 AGENTS.md 加载项目级约束，自动注入 system prompt ──────────
// HarnessRunner 会在每次 run() 时自动加载并注入，无需手动处理
const specLoader = new FileProjectSpecLoader({ cwd: process.cwd() });
// 或内联注入（适合测试 / 浏览器环境）：
// const specLoader = new InlineProjectSpecLoader(`
// # Project: MyApp
// ## Conventions
// - 所有节点 ID 必须使用 nanoid 生成
// ## Prohibitions
// - 不得直接修改 BanvasGL 内部状态，必须通过工具调用
// `);

// ── 配置 Harness（约束 + 反馈回路）─────────────────────────────────────────
// 第四参数传入 specLoader，HarnessRunner 自动完成 ProjectSpec 注入
const harness = new HarnessRunner(
  agentLoop,
  llmClient,
  {
    guards: [
      Guards.specApproved(),       // ChangeSpec 必须处于 approved 状态
      Guards.hasAtLeastOneTask(),  // 至少有一个任务
    ],
    checkpoints: [
      Checkpoints.outputNotEmpty(),
    ],
    humanGates: [
      HumanGates.reviewProposal(), // 执行前审核 proposal
      HumanGates.reviewTasks(),    // 执行前审核任务列表
    ],
  },
  specLoader  // ← ProjectSpec 自动注入，无需侵入 AgentLoop 构造
);

// ── 执行 ─────────────────────────────────────────────────────────────────────
const result = await harness.run(spec);
if (result.success) {
  console.log('生成完成：', result.output);
}
```

---

## 路线图

- [ ] **MVP 测试与发布** —— 完善测试覆盖，发布首个可用版本
- [x] **XiangDi AI Agent 引擎** —— AgentLoop + AISchema + BanvasToolProtocol 骨架完成
- [x] **XiangDi SDD 集成** —— 两层 Spec 体系落地：ProjectSpec（项目级规范）+ ChangeSpec（变更级过程文件）
- [x] **XiangDi Harness Engineering** —— Guard / Checkpoint / HumanGate 框架完成，Agent 执行有缰可控
- [ ] **XiangDi 接入 Banyan** —— 在编辑器中集成 AI 对话面板，实现设计稿 + 自然语言 → 生成应用
- [ ] **图形库 WebGPU 重构** —— 将渲染后端从 Canvas 2D 迁移到 WebGPU，大幅提升渲染性能
- [ ] **全平台 Canvas 适配** —— 适配 Web、桌面、移动端及小程序的 Canvas 实现，实现一个应用跨所有端

---

## 贡献

<!-- TODO: 添加详细贡献指南 -->

欢迎提交 Issue 和 Pull Request。

---

## 许可证

Banyuan 采用**双重授权（Dual License）**模式：

- **开源版本**：[AGPL-3.0](./LICENSE) —— 通过网络提供服务的应用若使用了 Banyuan 代码，须同样以 AGPL-3.0 开源。适用于个人学习、学术研究、开源项目。
- **商业授权**：详见 [LICENSE-COMMERCIAL](./LICENSE-COMMERCIAL) —— 企业客户可获得闭源使用权，无需开源自身代码，无 AGPL 网络传播义务。适用于将 BanvasGL / XiangDi / Banyan 集成到专有产品或 SaaS 服务中的场景。

如有商业授权需求，请联系：[TODO: your-email@example.com]

---

<p align="center">
  <em>虽由人作，宛自天开。</em>
</p>
