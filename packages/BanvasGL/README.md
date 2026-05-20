# BanvasGL — 自研 2D 图形引擎

BanvasGL 是 Banyuan 平台的核心 2D 图形引擎，基于 Canvas 2D 双缓冲渲染，提供完整的图形基元、场景管理、动画系统、流程执行、序列化能力，以及面向低代码平台的编辑态、运行态 React Hook。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      React Hook 层                           │
│                                                             │
│   useDesignBanvas      useFlowBanvas      useRuntimeBanvas  │
│   （编辑态完整能力）      （流程图编辑）       （运行态最小集）    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                        App 应用层                            │
│              Scene 管理 · 事件分发 · 版本通知                  │
└───────┬──────────────────────┬──────────────────────────────┘
        │                      │
┌───────▼───────┐   ┌──────────▼──────────────────────────────┐
│   Renderer    │   │              Scene 场景图                 │
│               │   │                                         │
│  Canvas 2D    │   │  View（可交互包装层）                      │
│  双缓冲渲染    │   │   ├── GraphViews（通用图形）               │
│  DPR 适配     │   │   ├── TextView（文本编辑）                 │
│               │   │   ├── MediaViews（图片/视频）              │
│  Camera       │   │   ├── CombinedViews（组合图形）            │
│  正交/透视     │   │   └── flow/（节点/边/端口）                │
└───────────────┘   │                                         │
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
│  AnimationManager    FlowRunner       Web Workers           │
│  关键帧动画系统        流程逻辑执行引擎   图形求交 · 文本排版     │
│                                       快照 diff · 轨迹计算   │
│                                                             │
│  Serializer          Style            Math                  │
│  场景序列化/反序列化   填充/描边/渐变     矩阵 · 向量 · 包围盒   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三入口设计

BanvasGL 按使用场景物理隔离为两个入口，消费方按需引入：

| 入口 | 导入路径 | 适用场景 |
|------|----------|----------|
| 前端 | `import ... from 'banvasgl'` | 低代码设计器（编辑态核心图形引擎） |
| 服务端 | Node.js 环境自动选择 | 后端序列化/反序列化、构建服务 |

运行态 Hook（`useRuntimeBanvas`、`useCanvasInit`）已迁移至独立的 `banvas-runtime` 包。编辑态 Hook（`useDesignBanvas`）已迁移至 `banvas-design` 包。

---

## 核心模块

### 场景图（`core/scene`）

`Scene` 管理所有 `View` 的层级树，是引擎的状态中心。所有状态变更必须通过 `TransactionManager` 提交，支持事务化撤销/重做（`OperationStack`）。

`View` 是图形的可交互包装层，通过 mixin 模式附加能力：`BoundingBoxAddon`（包围盒与变换控制点）、`VertexAddon`（顶点编辑）。

### 图形基元（`core/graph`）

所有图形继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`。内置类型覆盖解析图形（Line、Arc、Bezier 系列）、组合图形（Rectangle、Polygon、RoundedRect 等）、媒体元素（Image、Video）、富文本（TextElement）。

### 流程执行引擎（`core/runtime/FlowRunner`）

`FlowRunner` 将 `FlowSchema`（有向图 JSON）解释执行，支持以下节点类型：

控制流节点：条件分支（`condition`）、延迟（`delay`）。

值节点（用于参数求值）：`variable`（View 数据字段）、`pageVar`（页面变量）、`eventParam`（事件参数）。

动作节点（副作用执行）：`setData`（设置 View 数据）、`navigate`（页面跳转）、`animate`（播放动画）、`setVisible`（设置可见性）。

这是 Banyan 编辑器中"事件 → 交互逻辑"的运行时核心。

### 动画系统（`core/animation`）

`AnimationManager` 管理动画生命周期，`AnimationDescriptor` 描述关键帧，`AnimationExecutor` 执行插值（支持多种缓动函数）。

### Web Worker（`workers`）

重计算任务通过 `WorkerManager` 分发到 Worker 线程，避免阻塞主线程：图形求交、快照 diff（撤销/重做优化）、文本排版、轨迹计算。

### 序列化（`core/serializer`）

将 `Scene`（含所有 `View` 和 `Graph`）序列化为 JSON 字符串，或从 JSON 字符串反序列化还原场景。序列化产物即 `Application.pages` 数组的每个元素。

---

## 快速开始

BanvasGL 作为 workspace 包使用，在 monorepo 内通过 `workspace:*` 引用：

```json
{ "dependencies": { "banvasgl": "workspace:*" } }
```

### 编辑态

```tsx
import { useDesignBanvas } from 'banvasgl'

function DesignCanvas({ pages }) {
  const {
    Banvas,
    pages: pageNodes,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    builtinComponents,
  } = useDesignBanvas(pages, {
    width: 800,
    height: 600,
  })
  return <div>{Banvas}</div>
}
```

### 运行态

```tsx
import { useRuntimeBanvas } from 'banvas-runtime'

function RuntimeCanvas({ pages }) {
  const { Banvas } = useRuntimeBanvas(pages, { width: 800, height: 600 })
  return <div>{Banvas}</div>
}
```

### 服务端序列化

```ts
import { Serializer } from 'banvasgl'

const json = Serializer.getInstance().serialize(scene)
const restored = Serializer.getInstance().deserialize(json)
```

---

## 构建

```bash
pnpm --filter banvasgl build   # 生产构建
pnpm --filter banvasgl dev     # 开发模式（watch）
```

构建产物输出到 `dist/`，同时生成 ESM（`.mjs`）和 CJS（`.cjs`）双格式及 `.d.ts` 类型声明。

---

## 开发规范

- 所有图形状态变更必须通过 `TransactionManager` 提交，禁止直接修改 `Scene` 内部状态
- 运行态入口（`index.runtime.ts`）禁止引入任何编辑器模块
- 重计算逻辑放入 Worker Handler，不在主线程执行
- 新增图形基元需继承 `Graph` 或 `CombinedGraph`，并在 `core/graph/index.ts` 中导出
- 新增视图需继承 `View`，并在 `core/views/index.ts` 中导出
- 修改三入口时，检查三个入口文件的导出是否需要同步更新
