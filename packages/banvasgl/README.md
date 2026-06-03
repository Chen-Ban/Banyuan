# BanvasGL — 自研 2D 图形引擎（`@banyuan/banvasgl`）

BanvasGL 是 Banyuan 平台的核心 2D 图形引擎，基于 Canvas 2D 双缓冲渲染，提供完整的图形基元、场景管理、动画系统、内置 FlowRunner 流程执行、CombinedView 统一容器（支持 flex/list/grid/scroll/free 五种布局模式）、物料系统、交互状态机、以及序列化能力。

引擎采用**单入口设计**（`src/index.ts`），显式列举所有公共符号。React 集成层通过 `@banyuan/banvasgl/react` 子路径导出，Flow 执行器通过 `@banyuan/banvasgl/flow` 系列子路径导出。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        App 应用层                            │
│     Scene 管理 · 页面栈导航 · FlowRunner · AnimationManager  │
└───────┬──────────────────────┬──────────────────────────────┘
        │                      │
┌───────▼───────┐   ┌──────────▼──────────────────────────────┐
│   Renderer    │   │              Scene 场景图                 │
│               │   │                                         │
│  Canvas 2D    │   │  View（可交互包装层）                      │
│  双缓冲渲染    │   │   ├── GraphViews（通用图形视图）           │
│  DPR 适配     │   │   ├── TextView（文本编辑）                 │
│               │   │   ├── MediaViews（ImageView / VideoView） │
│  Camera       │   │   ├── CombinedView（统一容器视图）         │
│  正交/透视     │   │   │     布局模式: free/flex/list/grid/scroll│
│               │   │   └── FlowViews（NodeView/EdgeView/PortView）│
└───────────────┘   │                                         │
                    │  Graph（图形基元）                         │
                    │   ├── 解析图形：Line · Arc · Bezier · Circle│
                    │   ├── 组合图形：Rect · Polygon · RoundedRect│
                    │   ├── 轨迹图形：DenseTrajectory            │
                    │   └── 媒体/文本：Image · Video · Text      │
                    │                                         │
                    │  TransactionManager（事务化撤销/重做）      │
                    │  SnapAlignManager（对齐吸附）              │
                    └─────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                       支撑系统                               │
│                                                             │
│  AnimationManager       FlowRunner (前端预设)                │
│  关键帧动画系统           App 持有，Scene 直接调用              │
│                                                             │
│  Serializer             Style            Math               │
│  场景序列化/反序列化      填充/描边/渐变     矩阵 · 向量 · 包围盒│
│                                                             │
│  MaterialInstantiator   InteractionStateMachine              │
│  物料模板实例化           交互状态机（指针/键盘分发）            │
└─────────────────────────────────────────────────────────────┘
```

### 源码分层

```
src/
├── engine/          # 引擎运转：App · Scene · Renderer · Camera · Serializer · Interaction · Material
├── view/            # 视图体系：View 基类 · ContainerView · CombinedView · FlowViews · GraphViews · MediaViews · TextView · Addon
├── graph/           # 图形基元：Graph 基类 · 解析图形 · 组合图形 · 轨迹 · 媒体 · 文本
├── foundation/      # 零依赖原子模块：数学 · 样式 · 动画 · 常量 · 工具函数
├── types/           # 纯接口契约（零实现）
├── actions/         # 封装的操作 API（createBanvasActions）
├── flow/            # 内置流程引擎：FlowRunner · 执行器 · 类型定义
└── hook/            # React 集成层：useCanvasInit · useCanvasCamera
```

### 子路径导出

| 子路径 | 入口文件 | 职责 |
|--------|----------|------|
| `.` | `src/index.ts` | 核心引擎（图形 + 场景 + 视图 + 动画 + 序列化 + Actions） |
| `./react` | `src/hook/index.ts` | React Hook 集成（useCanvasInit / useCanvasCamera） |
| `./flow` | `src/flow/index.ts` | Flow 引擎核心（FlowRunner + 类型） |
| `./flow/client` | `src/flow/presets/client.ts` | 前端预设执行器（animate/navigate/setData/setVisible + shared） |
| `./flow/server` | `src/flow/presets/server.ts` | 后端预设执行器（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/script/transform + shared） |

---

## 核心模块

### 场景图（`engine/scene`）

`Scene` 管理所有 `View` 的层级树，是引擎的状态中心。所有状态变更必须通过 `TransactionManager` 提交，支持事务化撤销/重做（`OperationStack`）。`LayerManager` 管理图层，`SnapAlignManager` 提供对齐吸附。

### 视图体系（`view/`）

`View` 是图形的可交互包装层，通过 mixin 模式附加 Addon 能力：

- `BoundingBoxAddon` — 包围盒与变换控制点
- `VertexAddon` — 顶点编辑
- `BoxDecorationAddon` — 统一视觉装饰（圆角、阴影、边框）
- `TextSelectionAddon` — 文本选区
- `AnimationAddon` — 动画能力

视图继承关系：

```
View (基类)
├── GraphView          # 通用图形视图
│   └── SelectBoxView  # 选择框视图
├── TextView           # 文本编辑视图
├── ImageView          # 图片视图
├── VideoView          # 视频视图
├── ContainerView (抽象类，持有 children)
│   ├── CombinedView   # 统一容器视图（支持多种布局模式）
│   └── NodeView       # 流程图节点视图
├── EdgeView           # 流程图连线视图
└── PortView           # 流程图端口视图
```

### CombinedView（`view/CombinedViews`）

统一容器视图，继承 `ContainerView`，通过 `style.layoutMode` 切换布局模式（ADR-031）：

- `free`（默认）：自由定位，子元素 matrix 由用户拖拽控制
- `flex`：弹性布局（FlexLayoutStrategy），支持 direction/justify/align/gap/wrap/padding
- `list`：线性列表布局（ListLayoutStrategy），子元素沿单方向依次排列
- `grid`：网格布局（GridLayoutStrategy），按行列数排列
- `scroll`：语法糖，等价于 free + overflow:'scroll'

布局算法通过策略模式（`ILayoutStrategy`）注入，CombinedView 本身不包含具体算法。

### FlowViews（`view/FlowViews`）

流程图编辑器视图，内置于核心引擎：

- `NodeView` — 继承 ContainerView，流程图节点容器
- `EdgeView` — 继承 View，连线视图
- `PortView` — 继承 View，端口视图

### 图形基元（`graph/`）

所有图形继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`。内置类型覆盖：解析图形（Line、Arc、Circle、QuadraticBezier、CubicBezier）、组合图形（Polygon、Triangle、Quadrilateral、Rectangle、RegularPolygon、RoundedRect）、轨迹图形（DenseTrajectory）、媒体元素（ImageElement、VideoElement）、富文本（TextElement、TextFields、TextParagraph）。

### Flow 引擎（`flow/`）—— 领域专用声明式解释器

Flow 本质上是对 JavaScript 的更高层抽象——一个面向低代码场景的领域专用解释器（domain-specific declarative interpreter）。它的存在源于一个核心取舍：用户的「代码」必须同时满足三个约束——可序列化（JSON 持久化/网络传输）、AI 可生成（结构化 schema 优于自由文本）、可视化可编辑（节点图天然映射为画布连线）。

类比编译原理，Flow 的三层结构对应为：

| Flow 组件 | 编译原理概念 | 职责 |
|-----------|-------------|------|
| FlowSchema（nodes + edges） | AST（抽象语法树） | 描述「做什么」的结构化数据 |
| NodeExecutor（registry 注册） | 操作语义（operational semantics） | 定义每种节点的运行时行为 |
| FlowContext（env + 变量表） | 运行时环境（runtime environment） | 划分前后端职责边界，提供作用域 |

schema 封装控制流（condition/delay/callFlow）和副作用（navigate/dbQuery）为可序列化数据结构；context 按前后端职责注入不同能力（前端: navigateTo/playAnimation，后端: db/httpClient）。FlowRunner 作为 eval 循环，采用 **kind-agnostic** 设计——不关心具体节点类型，通过 `NodeExecutorRegistry` 按 kind 查找执行器，新增节点类型只需注册即可。

**三层设计质量准则**：

| 层 | 核心指标 | 含义 |
|----|---------|------|
| Schema | 流程控制的完备集 | 必须能表达所有控制流原语（顺序/条件/循环/延迟/子流程），用户不应被迫逃逸到代码 |
| Context | 作用域设计（最核心） | 必须完整包含所需内容；scope 粒度决定表达力上限和隔离性下限，需根据业务领域审慎权衡 |
| Executor | 前后端职责边界划分 | env 按前端/后端划分职责——前端操控视图（navigateTo/animate），后端操作数据（db/httpClient）。平台差异（PC/Android/iOS）由壳层 Bridge 处理（ADR-038），与 Flow 无关 |

**核心数据结构**：

```typescript
interface FlowSchema { nodes: FlowNode[]; edges: FlowEdge[] }
interface FlowEdge  { id: string; from: string; to: string; branch?: 'true' | 'false'; toParam?: string }
```

FlowNode 按 kind 分为动作节点和值节点。动作节点参与控制流：共享（condition/delay/setVariable/callFlow/subFlow）、前端（setData/navigate/animate/setVisible）、后端（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/transform/script）。值节点（variable/pageVar/eventParam）仅产出值供参数引用。

FlowValue 描述动态值来源（5 种 kind）：`literal`（字面量）、`dataRef`（View.data 引用）、`pageDataRef`（页面变量）、`eventArg`（事件参数）、`nodeRef`（值节点输出）。

**执行模型**：建图 → 找入口（无入边的第一个动作节点）→ 顺序执行（每步查 registry 执行 executor）→ condition 节点按 branch 选边 → MAX_STEPS=1000 防死循环。

**与视图层的集成**：

- App 持有 `FlowRunner` 实例（`createClientFlowRunner()` 创建）
- View.events（12 个事件处理器）和 View.lifetimes（3 个钩子）的类型均为 `FlowSchema | null`
- Scene.lifetimes（4 个场景生命周期）类型为 `FlowSchema | null`
- Scene.triggerSchema 构造 `FlowContext` 并调用 FlowRunner.run，注入 env 能力

**FlowContext 接口**：前端 env 注入 `{ appId, navigateTo, playAnimation, markDirty }`；后端 env 注入 `{ db, appId, httpClient }`。

**事件模型与 Scope 设计决策**：

Banyan 的视图树与浏览器文档模型表面相似，但 Flow 有意不采用 DOM 的捕获/冒泡事件流机制。原因：(1) 目标用户是非专业开发者，多层级事件拦截对他们是困惑而非便利；(2) 引擎层 `InteractionStateMachine` + `resolveActivationTarget` 已完成事件定位，是扁平的「谁被点就触发谁」模型；(3) 冒泡意味着一个 click 触发多个 FlowSchema，可视化编排复杂度会爆炸。

默认 scope 选择**页面级（Page/Scene）**——从 Banyan 设计初衷推导：一个页面就是用户的一个工作单元。页面内组件通过 viewId 级读写 + page 级共享变量互相通信；跨页面通信通过 navigate params + 后端 API，天然形成隔离。如果未来需要跨页面共享状态（全局主题、登录态），应通过 app 级变量或 callFlow 间接实现，而非扩大默认 scope。

**目录结构**：

```
src/flow/
├── runtime/        # FlowRunner 调度器 · FlowContext · resolveValue
├── executors/      # 按端分组的执行器实现
│   ├── shared/     # condition · delay · setVariable · callFlow · subFlow
│   ├── client/     # setData · navigate · animate · setVisible
│   └── server/     # dbQuery · dbInsert · dbUpdate · dbDelete · httpRequest · transform · script
├── presets/        # createClientFlowRunner() · createServerFlowRunner()
└── types/          # FlowSchema · FlowNode · FlowEdge · FlowValue 类型定义
```

### 动画系统（`foundation/animation`）

`AnimationManager` 管理动画生命周期（单例模式），`AnimationDescriptor` 描述关键帧，`AnimationExecutor` 执行插值。支持多种缓动函数（`Easings`）。

### 交互状态机（`engine/interaction`）

`InteractionStateMachine` 管理指针和键盘事件的状态转换，`resolveActivationTarget` 确定激活目标视图。通过 `InteractionDelegate` 接口将事件分发给消费方。

### 物料系统（`engine/material`）

`MaterialInstantiator` 将物料模板（`IMaterialTemplate`）实例化为 View 实例树：填充占位符、重生成 ID、复用 Serializer 还原。`MaterialSerializer` 负责从现有 View 反向序列化为物料模板。

### 序列化（`engine/serialization`）

`Serializer`（单例模式）将 `Scene`（含所有 `View` 和 `Graph`）序列化为 JSON，或从 JSON 反序列化还原场景。`MigrationRegistry` 支持数据版本迁移。序列化产物即 `Application.pages` 数组的每个元素。

---

## 快速开始

BanvasGL 作为 workspace 包使用，在 monorepo 内通过 `workspace:*` 引用：

```json
{ "dependencies": { "@banyuan/banvasgl": "workspace:*" } }
```

### 核心引擎（仅图形能力）

```ts
import { App, Scene, Renderer, Serializer, TransactionManager } from '@banyuan/banvasgl'

// 场景序列化
const serializer = Serializer.getInstance()
const json = serializer.serialize(scene)
const restored = serializer.deserialize(json)
```

### React 集成

```tsx
import { useCanvasInit, useCanvasCamera } from '@banyuan/banvasgl/react'

function MyCanvas({ pages }) {
  const { canvasRef, app, actions } = useCanvasInit(pages, {
    width: 800,
    height: 600,
  })
  const { zoom, pan } = useCanvasCamera(app)
  return <canvas ref={canvasRef} />
}
```

### Flow 执行器

```ts
// 前端（已由 App 内置创建，通常无需手动使用）
import { createClientFlowRunner } from '@banyuan/banvasgl/flow/client'

// 后端
import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server'
```

### Actions API

```ts
import { createBanvasActions } from '@banyuan/banvasgl'

const actions = createBanvasActions(() => app)
// actions.view — 视图操作（添加/删除/复制/粘贴/对齐等）
// actions.page — 页面操作（添加/删除/切换页面）
// actions.app  — 应用操作
```

---

## 构建

```bash
pnpm --filter @banyuan/banvasgl build   # 生产构建
pnpm --filter @banyuan/banvasgl dev     # 开发模式（watch）
```

构建工具为 tsup，产物输出到 `dist/`，同时生成 ESM（`.mjs`）和 CJS（`.cjs`）双格式及 `.d.mts` 类型声明。构建后自动执行 `postbuild` 脚本生成知识数据。

---

## 开发规范

- 所有图形状态变更必须通过 `TransactionManager` 提交，禁止直接修改 `Scene` 内部状态
- 新增视图类型需继承 `View`（或 `ContainerView`），并在 `view/index.ts` 和 `src/index.ts` 中导出
- 新增图形基元需继承 `Graph` 或 `CombinedGraph`，并在 `graph/index.ts` 中导出
- 新增 Addon 放入 `view/addon/` 目录
- 引擎核心禁止引入 React/DOM 等宿主环境依赖（React 相关仅限 `hook/` 目录，声明为 optional peerDep）
- FlowRunner 由 App 内置创建，Scene 直接调用，无需外部注入
- 禁止新增独立的布局容器 ViewType；新布局能力以新的 `layoutMode` 值 + 对应 LayoutStrategy 的形式挂载到 CombinedView（ADR-031）
- 修改导出时，同步更新 `src/index.ts`
- ID 生成使用 `uuid` 包（`v4`）
- 版本注入通过 tsup define + `__BANVASGL_VERSION__` 宏

---

## 依赖

| 类型 | 包名 | 说明 |
|------|------|------|
| dependencies | `uuid` ^11.1.0 | ID 生成 |
| peerDependencies (optional) | `react` >=18.0.0 | React Hook 集成层需要 |
| devDependencies | `tsup` ^8.4.0 | 构建工具 |
| devDependencies | `tsx` ^4.19.0 | postbuild 脚本运行 |
