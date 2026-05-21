# BanvasRuntime — 运行态 React Hook（`@banyuan/banvas-runtime`）

BanvasRuntime 是 BanvasGL 的运行态 React 绑定层，提供轻量级的画布渲染和事件触发能力。专为低代码平台预览和独立打包应用设计——不包含编辑器代码、Worker 管理、交互分发等重逻辑，确保产物 bundle 体积最小。

---

## 核心导出

### `useRuntimeBanvas(pages, options)` — 运行态 Hook

接收页面数据，返回可交互的运行态画布：

```tsx
import { useRuntimeBanvas } from '@banyuan/banvas-runtime'

function Preview({ pages }) {
  const { Banvas } = useRuntimeBanvas(pages, { width: 375, height: 812 })
  return <div>{Banvas}</div>
}
```

运行态画布支持：页面渲染、组件点击事件触发、FlowSchema 流程执行（通过 `@banyuan/flow`）、页面导航、动画播放。

### `useCanvasInit(options)` — 底层画布初始化

低级别 Hook，负责创建 Canvas 元素、App 实例、DPR 适配。通常不直接使用，由 `useRuntimeBanvas` 内部调用。也被 `@banyuan/banvas-design` 复用。

### `useRuntimeEvents(app, scene)` — 运行态事件绑定

将用户交互（点击、输入等）绑定到运行态的事件处理逻辑，触发组件上定义的 FlowSchema。

---

## 安装与依赖

```json
{
  "dependencies": {
    "@banyuan/banvas-runtime": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.1.0",
    "@banyuan/banvasgl": "workspace:*"
  }
}
```

---

## 运行态 vs 编辑态

| 维度 | 运行态（本包） | 编辑态（@banyuan/banvas-design） |
|------|---------------|--------------------------------|
| Bundle 体积 | 最小 | 较大（含 Workers + 交互系统） |
| 编辑能力 | 无 | 拖拽/框选/属性编辑/撤销重做 |
| FlowSchema 执行 | ✅ | ❌（编辑态仅编辑流程，不执行） |
| 适用场景 | 预览、独立打包应用 | 低代码设计器 |

---

## 目录结构

```
src/
├── index.ts              # 主入口导出
├── useCanvasInit.ts      # 底层画布初始化 Hook
├── useRuntimeBanvas.tsx  # 运行态 Hook
└── useRuntimeEvents.ts   # 运行态事件绑定
```

---

## 构建

```bash
pnpm --filter @banyuan/banvas-runtime build
pnpm --filter @banyuan/banvas-runtime dev   # watch 模式
```
