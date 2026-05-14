# 业务上下文 — Banyuan

> 本文档描述 Banyuan 的产品定位、用户故事、功能边界和业务流程。
> AI Agent 在生成代码时应理解这些业务背景，避免产出与产品逻辑矛盾的实现。

## 产品定位

Banyuan 是一个「以画布为核心的低代码可视化应用设计与生成平台」。目标用户是非专业开发者（运营、设计师、产品经理）和追求效率的开发者。他们通过拖拽组件 + 配置属性 + AI 对话，设计多页面应用，最终一键生成可独立运行的跨平台桌面安装包。

与 Figma/即时设计 的区别：Banyuan 的产出不是设计稿，而是可运行的应用。
与低代码平台（如 Retool、NoCode）的区别：Banyuan 以自研画布引擎为底座，面向「可视化应用」而非「表单/CRUD」。
与 AI 生成工具（如 v0、bolt.new）的区别：Banyuan 是画布引擎 + AI Agent 的深度集成，不是纯 AI 输出代码。

## 核心用户故事

### 设计与编辑

用户打开 Banyan 编辑器，创建一个新应用（对应一个 App 实例）。一个 App 可包含多个 Page（页面），每个 Page 是独立的画布。用户从组件面板拖入内置组件（矩形、文本、图片、视频、输入框等）到画布。在画布上可以框选、多选、拖拽移动、缩放、旋转节点。右侧属性面板可配置节点的样式（填充、边框、圆角、阴影）、数据绑定、事件。支持吸附对齐（节点自动贴齐相邻节点或画布边缘）和撤销/重做（事务化，Ctrl+Z / Ctrl+Shift+Z）。

### 交互逻辑编排

用户切换到流程编辑态（FlowRunner），通过连线方式编排组件交互。例如：按钮点击 → 切换到另一个页面 / 显示弹窗 / 修改节点属性。逻辑以可视化连线表达，无需编写代码。

### AI 生成

用户在对话面板输入自然语言需求（如「帮我创建一个登录页面」）。XiangDi 的 SpecPlanner 将自然语言转化为结构化的 ChangeSpec，经用户确认（HumanGate）后，AgentLoop 通过工具调用驱动画布生长。生成结果在画布上实时可见，用户可在此基础上继续手动调整。

### 预览与构建

用户点击「预览」，无需构建即可在浏览器中查看运行态效果。用户点击「构建」，平台后端将应用打包为 Electron 桌面安装包（macOS / Windows / Linux）。构建产物是独立可运行的，不需要 Banyuan 平台本身。

## 数据模型核心概念

| 概念 | 说明 | 对应代码 |
|------|------|----------|
| App | 一个完整的应用，包含元信息和多个 Page | `BanvasGL/core/app/App.ts` |
| Page | 应用中的一个页面（画布），包含多个 View | `BanvasGL/core/scene/Scene.ts` |
| View | 画布上的一个可视节点（矩形、文本、图片等）| `BanvasGL/core/views/View/View.ts` |
| Graph | View 的几何描述（形状、路径、边界）| `BanvasGL/core/graph/base/Graph.ts` |
| Style | 视觉样式（填充、描边、阴影）| `BanvasGL/core/style/Style.ts` |
| Animation | 关键帧动画描述 | `BanvasGL/core/animation/` |
| Flow | 交互逻辑连线图 | `BanvasGL/core/runtime/FlowRunner.ts` |

## 数据流

```
用户操作 / AI 工具调用
        │
        ▼
  TransactionManager (事务化操作)
        │
        ▼
  Scene (场景图 / ViewTree)
        │
        ▼
  Renderer (Canvas 2D 双缓冲渲染)
        │
        ▼
  用户看到的画布
```

AI Agent 的工具调用（BanvasToolProtocol）与用户手动操作走的是同一条数据通路，最终都经过 TransactionManager → Scene → Renderer 渲染到画布。

## AI 生成的边界

XiangDi 当前能力范围：

- 可以：创建页面、添加/修改/删除节点、调整节点属性（位置、大小、样式、文本内容）
- 可以：通过 knowledge_search 工具获取组件 Schema 规范
- 可以：通过 web_search 搜索不熟悉的设计概念
- 不可以：直接操作流程编辑器（FlowRunner 的交互逻辑）
- 不可以：触发构建流程（构建是平台服务的职责）
- 不可以：操作文件系统或执行任意代码

## 功能边界与非目标

Banyuan 明确不做的事情：不是通用代码生成器（不生成 React/Vue 代码，生成的是 BanvasGL 画布状态）；不是设计工具（不输出 SVG/PDF 设计稿）；不是在线协作工具（当前不支持多人实时编辑）；不是后端应用平台（应用的「数据」是画布状态，不是数据库记录）。
