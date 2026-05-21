# BanvasDesign — 编辑态 React 绑定（`@banyuan/banvas-design`）

BanvasDesign 是 BanvasGL 的编辑态 React 绑定层，提供完整的低代码画布编辑器能力：拖拽创建组件、多选框选、右键菜单、撤销重做、Worker 异步计算、交互事件分发。

本包通过 `useDesignBanvas` Hook 对外暴露所有编辑态能力，是 Banyan 低代码平台编辑器的核心驱动。

---

## 核心导出

### `useDesignBanvas(pages, options)` — 设计态 Hook

接收页面数据和配置，返回画布 React 元素及编辑操作 API：

```tsx
import { useDesignBanvas } from '@banyuan/banvas-design'

function Editor({ pages }) {
  const {
    Banvas,             // 画布 React 元素
    pages: pageNodes,   // 页面节点树
    currentPageId,      // 当前页面 ID
    selectedViewId,     // 选中的视图 ID
    actions,            // 编辑操作（view/page/history）
    contextMenu,        // 右键菜单
    builtinComponents,  // 内置组件列表
  } = useDesignBanvas(pages, { width: 800, height: 600 })

  return <div>{Banvas}</div>
}
```

### Actions（编辑操作）

通过 `createBanvasActions` 工厂创建，分三组：

- **viewActions**：创建/删除/移动/调整视图、设置属性、锁定/解锁
- **pageActions**：新增/删除/切换/重排页面
- **historyActions**：撤销 (undo) / 重做 (redo)

### Workers（Web Worker 异步计算）

通过 `WorkerManager` 和 `WorkerExecutor` 管理重计算任务（图形求交、快照 diff、文本排版、轨迹计算），避免阻塞主线程。

Worker 入口通过 `./worker` 子路径导出：

```ts
import { WorkerRuntime } from '@banyuan/banvas-design/worker'
```

### 交互系统

- **InteractionDispatcher**：统一分发鼠标/触摸事件到当前激活的交互模式
- **useCanvasEvents**：画布级事件绑定（缩放、平移、框选）
- **useInputEvents**：输入设备事件绑定（键盘快捷键、剪贴板）

### 内置组件

`BUILTIN_COMPONENTS` 导出所有内置组件定义（矩形、文本、图片、按钮、输入框等），供组件面板（ComponentPalette）使用。`buildPageNodes` 用于将页面 JSON 数据构建为可渲染的节点树。

---

## 双入口

| 入口 | 导入路径 | 内容 |
|------|----------|------|
| 主入口 | `@banyuan/banvas-design` | Hook + Actions + Workers + 交互系统 |
| Worker | `@banyuan/banvas-design/worker` | Worker 线程运行时（在 Web Worker 中导入） |

---

## 安装与依赖

```json
{
  "dependencies": {
    "@banyuan/banvas-design": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18",
    "@banyuan/banvasgl": "workspace:*",
    "@banyuan/banvas-runtime": "workspace:*"
  }
}
```

本包依赖 `@banyuan/banvasgl`（核心引擎）和 `@banyuan/banvas-runtime`（共享的画布初始化逻辑）作为 peerDependencies，由宿主应用安装。

---

## 目录结构

```
src/
├── index.ts                  # 主入口导出
├── useDesignBanvas.tsx        # 设计态 Hook
├── actions/
│   ├── index.ts              # createBanvasActions 工厂
│   ├── viewActions.ts        # 视图操作
│   ├── pageActions.ts        # 页面操作
│   ├── historyActions.ts     # 撤销/重做
│   └── viewCreateStrategies.ts  # 视图创建策略
├── canvas/
│   ├── InteractionDispatcher.ts  # 交互分发器
│   ├── useCanvasEvents.ts        # 画布事件绑定
│   ├── useInputEvents.ts         # 输入事件绑定
│   └── utils.ts                  # 事件处理工具函数
├── data/
│   ├── builders.ts           # 页面节点构建器
│   ├── builtinComponents.ts  # 内置组件定义
│   └── contextMenu.ts        # 右键菜单构建器
└── workers/
    ├── index.ts              # Worker 导出
    ├── types.ts              # Worker 消息类型
    ├── WorkerExecutor.ts     # Worker 任务执行器
    ├── WorkerManager.ts      # Worker 池管理
    ├── WorkerRuntime.ts      # Worker 线程运行时
    └── handlers/             # Worker 处理器
```

---

## 构建

```bash
pnpm --filter @banyuan/banvas-design build
pnpm --filter @banyuan/banvas-design dev   # watch 模式
```
