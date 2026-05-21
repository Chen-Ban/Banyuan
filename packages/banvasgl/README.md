# BanvasGL — 自研 2D 图形引擎（`@banyuan/banvasgl`）

BanvasGL 是 Banyuan 平台的核心 2D 图形引擎，基于 Canvas 2D 双缓冲渲染，提供完整的图形基元、场景管理、动画系统、可注入的流程执行抽象（SchemaRunner）、FlexView 弹性布局容器、ViewRegistry 可扩展视图注册、以及序列化能力。

引擎采用**单入口设计**，仅导出核心图形能力。编辑态/运行态/流程图编辑器的 React Hook 已拆分为独立包（详见 ADR-016）。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        App 应用层                            │
│              Scene 管理 · 事件分发 · 版本通知                  │
└───────┬──────────────────────┬──────────────────────────────┘
        │                      │
┌───────▼───────┐   ┌──────────▼──────────────────────────────┐
│   Renderer    │   │              Scene 场景图                 │
│               │   │                                         │
│  Canvas 2D    │   │  View（可交互包装层）                      │
│  双缓冲渲染    │   │   ├── GraphViews（通用图形视图）           │
│  DPR 适配     │   │   ├── TextView（文本编辑）                 │
│               │   │   ├── MediaViews（图片/视频）              │
│  Camera       │   │   ├── CombinedViews（组合图形视图）        │
│  正交/透视     │   │   ├── ContainerView（容器视图）            │
│               │   │   ├── FlexView（弹性布局容器）             │
│               │   │   └── Forms/（表单元素视图）               │
└───────────────┘   │                                         │
                    │  ViewRegistry（可扩展视图类型注册）         │
                    │                                         │
                    │  Graph（图形基元）                         │
                    │   ├── 解析图形：Line · Arc · Bezier        │
                    │   ├── 组合图形：Rect · Polygon · RoundRect │
                    │   └── 媒体/文本：Image · Video · Text      │
                    │                                         │
                    │  TransactionManager（事务化撤销/重做）      │
                    └─────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                       支撑系统                               │
│                                                             │
│  AnimationManager       SchemaRunner (ISchemaRunner)        │
│  关键帧动画系统           可注入的流程逻辑执行抽象              │
│                                                             │
│  Serializer             Style            Math               │
│  场景序列化/反序列化      填充/描边/渐变     矩阵 · 向量 · 包围盒│
└─────────────────────────────────────────────────────────────┘
```

### 分层拆包（ADR-016）

BanvasGL 核心引擎只包含渲染、场景图、图形基元等平台无关逻辑。宿主环境相关的能力已拆分为独立包：

| 包名 | npm | 职责 |
|------|-----|------|
| `packages/BanvasGL` | `@banyuan/banvasgl` | 核心引擎（本包） |
| `packages/BanvasDesign` | `@banyuan/banvas-design` | 编辑态 Hook + Workers + 交互分发 |
| `packages/BanvasRuntime` | `@banyuan/banvas-runtime` | 运行态 Hook（最小渲染集） |
| `packages/BanvasFlowEditor` | `@banyuan/flow-design` | 流程图编辑器 Hook + NodeView/EdgeView/PortView |
| `packages/BanvasFlow` | `@banyuan/flow` | 声明式 FlowSchema 执行器（纯 TS，无 DOM 依赖） |
| `packages/BanyanSDK` | `@banyuan/banyan-sdk` | 聚合 SDK（re-export 以上全部） |

---

## 核心模块

### 场景图（`core/scene`）

`Scene` 管理所有 `View` 的层级树，是引擎的状态中心。所有状态变更必须通过 `TransactionManager` 提交，支持事务化撤销/重做（`OperationStack`）。

`View` 是图形的可交互包装层，通过 mixin 模式附加能力：`BoundingBoxAddon`（包围盒与变换控制点）、`VertexAddon`（顶点编辑）、`BoxDecorationAddon`（统一视觉装饰——圆角、阴影、边框）。

### ViewRegistry（`core/views/ViewRegistry`）

可扩展的视图类型注册表。内置视图（GraphViews、TextView、MediaViews、CombinedViews、ContainerView、FlexView、Forms）在引擎初始化时自动注册。外部包（如 `@banyuan/flow-design`）可通过 `ViewRegistry.register()` 注入自定义视图类型，实现插件化扩展。

### FlexView（`core/views/FlexView`）

弹性布局容器视图（ADR-017），支持 CSS Flexbox 语义的子项排列：`direction`（row/column）、`justify`、`align`、`gap`、`wrap`。子视图自动参与布局计算，无需手动定位。

### 图形基元（`core/graph`）

所有图形继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`。内置类型覆盖解析图形（Line、Arc、QuadraticBezier、CubicBezier）、组合图形（Rectangle、Polygon、RoundedRect）、轨迹图形（Trajectory）、媒体元素（Image、Video）、富文本（TextElement）。

### SchemaRunner（`core/runtime/SchemaRunner`）

可注入的流程逻辑执行抽象，定义 `ISchemaRunner` 接口。具体实现（如 `@banyuan/flow` 包的 FlowRunner）由宿主注入，引擎核心不直接依赖具体执行器实现。这使得引擎在不同场景下可以选择不同的流程执行策略。

### 动画系统（`core/animation`）

`AnimationManager` 管理动画生命周期，`AnimationDescriptor` 描述关键帧，`AnimationExecutor` 执行插值（支持多种缓动函数）。

### 序列化（`core/serializer`）

将 `Scene`（含所有 `View` 和 `Graph`）序列化为 JSON 字符串，或从 JSON 字符串反序列化还原场景。序列化产物即 `Application.pages` 数组的每个元素。

---

## 快速开始

BanvasGL 作为 workspace 包使用，在 monorepo 内通过 `workspace:*` 引用：

```json
{ "dependencies": { "@banyuan/banvasgl": "workspace:*" } }
```

### 核心引擎（仅图形能力）

```ts
import { Scene, Serializer, ViewRegistry } from '@banyuan/banvasgl'

// 场景序列化
const json = Serializer.getInstance().serialize(scene)
const restored = Serializer.getInstance().deserialize(json)

// 注册自定义视图类型
ViewRegistry.register('my-custom-view', MyCustomView)
```

### 编辑态（需额外安装 @banyuan/banvas-design）

```tsx
import { useDesignBanvas } from '@banyuan/banvas-design'

function DesignCanvas({ pages }) {
  const {
    Banvas,
    pages: pageNodes,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    builtinComponents,
  } = useDesignBanvas(pages, { width: 800, height: 600 })
  return <div>{Banvas}</div>
}
```

### 运行态（需额外安装 @banyuan/banvas-runtime）

```tsx
import { useRuntimeBanvas } from '@banyuan/banvas-runtime'

function RuntimeCanvas({ pages }) {
  const { Banvas } = useRuntimeBanvas(pages, { width: 800, height: 600 })
  return <div>{Banvas}</div>
}
```

### 统一 SDK（一次引入所有能力）

```tsx
import { useDesignBanvas } from '@banyuan/banyan-sdk/design'
import { useRuntimeBanvas } from '@banyuan/banyan-sdk/runtime'
import { useFlowBanvas } from '@banyuan/banyan-sdk/flow'
import { Scene, Serializer } from '@banyuan/banyan-sdk/core'
```

---

## 构建

```bash
pnpm --filter @banyuan/banvasgl build   # 生产构建
pnpm --filter @banyuan/banvasgl dev     # 开发模式（watch）
```

构建产物输出到 `dist/`，同时生成 ESM（`.mjs`）和 CJS（`.cjs`）双格式及 `.d.mts` 类型声明。

---

## 开发规范

- 所有图形状态变更必须通过 `TransactionManager` 提交，禁止直接修改 `Scene` 内部状态
- 新增视图类型需继承 `View`，并在 `ViewRegistry` 中注册
- 新增图形基元需继承 `Graph` 或 `CombinedGraph`，并在 `core/graph/index.ts` 中导出
- 新增 Addon 放入 `core/views/addon/` 目录
- 引擎核心（本包）禁止引入 React/DOM 等宿主环境依赖
- `ISchemaRunner` 的具体实现由外部注入，核心引擎不直接依赖
- 修改导出时，同步更新 `src/index.ts` 和 `src/core/index.ts`
