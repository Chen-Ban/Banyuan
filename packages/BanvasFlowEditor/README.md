# BanvasFlowEditor — 流程图编辑器（`@banyuan/flow-design`）

BanvasFlowEditor 是 BanvasGL 的流程图可视化编辑器。它在画布上呈现 `FlowSchema` 的有向图——节点（Node）、端口（Port）、连线（Edge），用户通过拖拽创建和编排流程逻辑。

编辑产物是 `FlowSchema` JSON，由 `@banyuan/flow` 包的 FlowRunner 解释执行。

---

## 核心导出

### `useFlowBanvas(schema, options)` — 流程图编辑 Hook

接收 FlowSchema 数据，返回流程图画布：

```tsx
import { useFlowBanvas } from '@banyuan/flow-design'

function FlowEditor({ schema, onChange }) {
  const { Banvas, nodes, edges } = useFlowBanvas(schema, {
    width: 600,
    height: 400,
    onChange,
  })
  return <div>{Banvas}</div>
}
```

### 视图类型

本包注册三种专属视图类型到 ViewRegistry：

- **NodeView**：流程节点（矩形块，显示节点类型和配置摘要）
- **PortView**：节点端口（入/出口圆点，连线的起止锚点）
- **EdgeView**：连线（贝塞尔曲线，支持条件标签）

### `installFlowViews()`

将流程图视图类型批量注册到 `ViewRegistry`。宿主应用在初始化时调用一次：

```ts
import { installFlowViews } from '@banyuan/flow-design'

installFlowViews()  // 注册 NodeView/PortView/EdgeView 到全局 ViewRegistry
```

### Constants

`FLOW_VIEWTYPE` 导出流程图视图类型常量字符串，用于类型判断。

---

## 安装与依赖

```json
{
  "dependencies": {
    "@banyuan/flow-design": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "@banyuan/canvas": "workspace:*",
    "@banyuan/canvas-runtime": "workspace:*"
  }
}
```

---

## 与其他包的关系

```
@banyuan/flow-design（本包，可视化编辑）
        │ 编辑产物
        ▼
   FlowSchema JSON
        │ 消费
        ▼
@banyuan/flow（执行器，运行时解释执行）
```

- **@banyuan/flow**：本包编辑的产物（FlowSchema）由其 FlowRunner 执行
- **@banyuan/canvas**：本包的视图（NodeView/EdgeView/PortView）继承自核心引擎的 View 体系
- **@banyuan/canvas-runtime**：流程图编辑画布底层使用 useCanvasInit

---

## 目录结构

```
src/
├── index.ts              # 主入口导出
├── constants.ts          # FLOW_VIEWTYPE 常量
├── install.ts            # installFlowViews 注册函数
├── hook/
│   ├── index.ts
│   ├── useFlowBanvas.tsx     # 流程图编辑 Hook
│   └── useFlowCanvasEvents.ts  # 流程图专属事件处理
└── views/
    ├── index.ts
    ├── NodeView.ts       # 节点视图
    ├── PortView.ts       # 端口视图
    └── EdgeView.ts       # 连线视图
```

---

## 构建

```bash
pnpm --filter @banyuan/flow-design build
pnpm --filter @banyuan/flow-design dev   # watch 模式
```
