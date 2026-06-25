# @banyuan/banvasgl-react

> BanvasGL 的 Web 平台注入与 React 集成层。

`@banyuan/banvasgl-react` 为平台无关的 [`@banyuan/banvasgl`](../banvasgl/README.md) 核心提供 Web 平台适配器与 React Hook 绑定。它把浏览器原生的 `HTMLCanvasElement` / `CanvasRenderingContext2D` 注入为引擎所需的 `IDrawingSurface` / `IDrawingContext` 接口，并提供声明式 React Hook 管理画布生命周期、相机交互与坐标转换。

---

## 它做什么

BanvasGL 核心不依赖任何 DOM 或 React 类型，因此不能在 Web 环境中直接使用。banvasgl-react 充当桥梁：

- **平台注入**：将浏览器 API 适配为 BanvasGL 的平台抽象接口（`IDrawingSurface` + `IDrawingContext`）
- **React 集成**：通过 Hook 管理画布初始化、相机交互、坐标转换
- **双缓冲合成**：`WebSurface.present()` 实现 `IDrawingSurface` 的离屏→主屏合成输出

---

## 公共 API

### Web 平台适配器

| 导出 | 说明 |
|------|------|
| `WebSurface` | `IDrawingSurface` 的 Web 实现。封装 HTMLCanvasElement + OffscreenCanvas 双缓冲，管理尺寸/DPR/帧调度/合成输出 |
| `WebSurfaceOptions` | `WebSurface` 构造选项类型（`antialias`、`clearColor`） |
| `createWebDrawingContext` | `CanvasRenderingContext2D` → `IDrawingContext` 适配器工厂（~50 方法） |

### React Hook

| 导出 | 说明 |
|------|------|
| `useFixedCanvasInit` | 固定尺寸画布的 App 初始化（编辑态常用） |
| `useAdaptiveCanvasInit` | 自适应尺寸画布的 App 初始化（运行态常用） |
| `useCanvasCamera` | 相机交互 Hook（平移/缩放/旋转） |

### 坐标转换工具

| 导出 | 说明 |
|------|------|
| `screenToWorld` | 屏幕坐标 → 世界坐标 |
| `worldToScreen` | 世界坐标 → 屏幕坐标 |
| `getCameraZoomLevel` | 获取当前相机缩放级别 |

---

## 使用示例

### 编辑态（固定画布）

```tsx
import { useFixedCanvasInit, WebSurface } from '@banyuan/banvasgl-react';

function Editor() {
  const { app, canvasRef } = useFixedCanvasInit({
    appJSON: savedAppJSON,
  });

  return <canvas ref={canvasRef} />;
}
```

### 运行态（自适应画布 + 相机）

```tsx
import { useAdaptiveCanvasInit, useCanvasCamera } from '@banyuan/banvasgl-react';

function Preview() {
  const { app, canvasRef } = useAdaptiveCanvasInit({
    appJSON: savedAppJSON,
  });

  useCanvasCamera({ app });

  return <canvas ref={canvasRef} />;
}
```

### 坐标转换

```tsx
import { screenToWorld, worldToScreen } from '@banyuan/banvasgl-react';

// 点击事件中转换坐标
function onCanvasClick(e: MouseEvent, scene: IScene, canvas: HTMLCanvasElement) {
  const worldPos = screenToWorld(e.clientX, e.clientY, scene, canvas);
  // worldPos 现在可用来做命中检测等
}
```

---

## 依赖关系

```
@banyuan/banvasgl-react ──peerDep──▶ @banyuan/banvasgl
                        ──peerDep──▶ react (>=18)
```

`@banyuan/banvasgl` 与 `react` 均为 **peerDependency**，由宿主应用提供。本包不重新导出 banvasgl 的任何类型——使用者需同时安装两个包。

---

## 在 Monorepo 中的位置

```
@banyuan/banvasgl              # 平台无关核心（零 DOM/React 依赖）
    └── IDrawingContext / IDrawingSurface

@banyuan/banvasgl-react        # 本包 — Web 平台注入 + React Hook
    ├── createWebDrawingContext (CanvasRenderingContext2D → IDrawingContext)
    ├── WebSurface (HTMLCanvasElement → IDrawingSurface，含双缓冲合成)
    └── useFixedCanvasInit / useAdaptiveCanvasInit / useCanvasCamera

@banyuan/banvas-react-runtime  # 运行策略层，依赖本包获取平台适配与 Hook
```

---

## 构建

```bash
pnpm --filter @banyuan/banvasgl-react build   # tsup，ESM + CJS 双出
pnpm --filter @banyuan/banvasgl-react dev     # watch 模式
```

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
