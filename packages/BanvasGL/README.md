# BanvasGL — 自研 2D 图形引擎

BanvasGL（`banvasgl`）是 Banyuan 平台的核心 2D 图形引擎，基于 Canvas 2D 双缓冲渲染，提供完整的图形基元、场景管理、动画系统、序列化/反序列化能力，以及面向低代码平台的编辑态、运行态 React Hook。

## 三入口设计

BanvasGL 按使用场景物理隔离为三个入口，消费方按需引入，避免将编辑器代码打入运行时产物：

| 入口 | 导入路径 | 适用场景 |
|------|----------|----------|
| 编辑态（前端） | `import ... from 'banvasgl'` | 低代码设计器（含 Worker、编辑 Hook） |
| 服务端 | `import ... from 'banvasgl'`（Node 环境自动选择） | 后端序列化/反序列化、构建服务 |
| 运行态 | `import ... from 'banvasgl/runtime'` | 已打包应用的运行时渲染（最小体积） |

运行态入口不包含任何编辑器代码（`useDesignBanvas`、`useFlowBanvas`、Worker 等）。

## 核心模块

### 图形基元（`core/graph`）

所有图形继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`。内置图形类型：

- **解析图形**：`Line`、`Arc`、`Circle`、`Bezier`、`QuadraticBezier`、`CubicBezier`
- **组合图形**：`Rectangle`、`Quadrilateral`、`Triangle`、`RegularPolygon`、`Polygon`、`RoundedRect`
- **媒体元素**：`ImageElement`、`VideoElement`
- **文本**：`TextElement`（支持富文本段落、字体排版）
- **轨迹**：`DenseTrajectory`

### 场景管理（`core/scene`）

`Scene` 管理所有视图（`View`）的层级树，所有状态变更必须通过 `TransactionManager` 提交，支持事务化撤销/重做（`OperationStack`）。

视图（`View`）是图形的可交互包装层，通过 mixin 模式附加能力：

- `BoundingBoxAddon`：包围盒计算与变换控制点
- `VertexAddon`：顶点编辑

内置视图类型：`GraphViews`（通用图形视图）、`TextView`（文本编辑）、`MediaViews`（图片/视频）、`CombinedViews`（组合图形）、`flow/`（流程图节点/边/端口）。

### 渲染器（`core/renderer`）

`Renderer` 基于 Canvas 2D 双缓冲渲染，所有坐标系以左上角为原点。`CanvasContext` 封装 Canvas 上下文状态管理。

### 相机（`core/camera`）

`OrthographicCamera`（正交，默认）和 `PerspectiveCamera`（透视）。相机控制画布的平移、缩放和视口变换。

### 动画系统（`core/animation`）

`AnimationManager` 管理动画生命周期，`AnimationDescriptor` 描述关键帧，`AnimationExecutor` 执行插值（支持多种缓动函数）。`FlowRunner` 负责流程动画的顺序/并行执行。

### 样式系统（`core/style`）

`Style` 统一管理填充（`FillStyle`）、描边（`StrokeStyle`）、阴影（`ShadowStyle`）、渐变（`Gradient`）、图片填充（`Image`）、视频填充（`Video`）。

### 序列化（`core/serializer`）

将 `Scene`（含所有 `View` 和 `Graph`）序列化为 JSON 字符串，或从 JSON 字符串反序列化还原场景。序列化产物即 `Application.pages` 数组的每个元素。

### Web Worker（`workers`）

重计算任务通过 `WorkerManager` / `WorkerExecutor` 分发到 Worker 线程，避免阻塞主线程：

- `GraphIntersectionHandlers`：图形求交
- `SnapshotDiffHandlers`：快照 diff（撤销/重做优化）
- `TextLayoutHandlers`：文本排版
- `TrajectoryHandlers`：轨迹计算

### React Hook（`hook`）

| Hook | 入口 | 说明 |
|------|------|------|
| `useDesignBanvas` | 编辑态 | 完整编辑器能力（拖拽、选择、属性编辑、历史记录） |
| `useDesignCanvasInit` | 编辑态 | 编辑态 Canvas 初始化 |
| `useFlowBanvas` | 编辑态 | 流程图编辑能力 |
| `useRuntimeBanvas` | 运行态 | 运行时渲染（只读，最小体积） |
| `useRuntimeCanvasInit` | 运行态 | 运行态 Canvas 初始化 |

## 快速开始

### 安装

BanvasGL 作为 workspace 包使用，在 monorepo 内通过 `workspace:*` 引用：

```json
{
  "dependencies": {
    "banvasgl": "workspace:*"
  }
}
```

### 编辑态（低代码设计器）

```tsx
import { useDesignBanvas, useDesignCanvasInit } from 'banvasgl'

function DesignCanvas() {
  const canvasRef = useDesignCanvasInit()
  const { scene, actions } = useDesignBanvas({ canvasRef })
  return <canvas ref={canvasRef} />
}
```

### 运行态（已打包应用）

```tsx
import useRuntimeBanvas, { useRuntimeCanvasInit } from 'banvasgl/runtime'

function RuntimeCanvas({ pages }: { pages: string[] }) {
  const canvasRef = useRuntimeCanvasInit()
  useRuntimeBanvas({ canvasRef, pages })
  return <canvas ref={canvasRef} />
}
```

### 服务端序列化

```ts
import { Serializer } from 'banvasgl'  // Node 环境自动选择 index.backend

const json = Serializer.serialize(scene)
const restored = Serializer.deserialize(json)
```

## 构建

```bash
# 在 monorepo 根目录
pnpm --filter banvasgl build

# 开发模式（watch）
pnpm --filter banvasgl dev
```

构建产物输出到 `dist/`，同时生成 ESM（`.mjs`）和 CJS（`.cjs`）双格式，以及对应的 `.d.ts` 类型声明。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | ~5.7 | 语言（strict 模式） |
| tsup | ^8.4 | 构建工具（ESM + CJS 双出） |
| React | ^19.0 | Hook 宿主（peerDep） |
| uuid | ^11.1 | 图形 ID 生成 |

## 编码规范

- 所有图形状态变更必须通过 `TransactionManager` 提交，禁止直接修改 `Scene` 内部状态
- 运行态入口（`index.runtime.ts`）禁止引入任何编辑器模块
- 重计算逻辑放入 Worker Handler，不在主线程执行
- 新增图形基元需继承 `Graph` 或 `CombinedGraph`，并在 `core/graph/index.ts` 中导出
- 新增视图需继承 `View`，并在 `core/views/index.ts` 中导出
