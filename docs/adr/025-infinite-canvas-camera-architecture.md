# ADR-025：无限画布与相机驱动的视口架构

**状态**：已采纳  
**决策日期**：2025-05-26  
**决策者**：陈班

---

## 背景

Banyan 低代码平台的设计态画布（`@banyuan/banvas-design`）当前采用「外部传入逻辑尺寸 + CSS 样式缩放」的模型：

1. **逻辑尺寸**由外部 props（`width / height`）传入，乘以 DPR 后设为 canvas 物理像素大小。
2. **样式尺寸**通过 `useCanvasZoom`（`Cmd/Ctrl + Wheel`）动态调整 `canvas.style.width/height`，实现预览级缩放。
3. **Scene 使用 `BaseCamera`**，其 `viewProjectionMatrix` 始终为 identity，相机形同虚设。
4. **事件坐标**（`event2Point`）将 CSS 偏移乘以 `canvas.width / canvas.clientWidth` 得到逻辑坐标，直接等同于世界坐标。

这套模型存在三个根本性问题：

- **缩放不是相机缩放**：CSS 样式缩放改变的是 canvas 元素的显示尺寸，不影响逻辑坐标系。这导致缩放后文本模糊（像素被拉伸而非重绘）、辅助线/snap 对齐精度下降。
- **不支持画布拖拽/平移**：用户无法通过 Space+拖拽或两指滑动来浏览画布范围之外的内容。
- **世界有固定边界**：canvas 逻辑尺寸等于外部传入的宽高，超出此范围无法放置元素，不是真正的"无限画布"。

业界主流方案（Figma、Excalidraw、tldraw、Konva.js）均采用「相机驱动视口」模型：Canvas DOM 元素固定为容器大小，通过相机的 position + zoom 决定世界的哪部分映射到视口。缩放和平移都是相机操作，渲染时通过 VP 矩阵统一应用到 Canvas 2D context。

---

## 决策

**BanvasGL 设计态画布切换为相机驱动的无限画布模型。**

核心原则：

1. Canvas DOM 元素尺寸 = 外部容器尺寸（自适应），不再由外部传入固定逻辑尺寸。
2. Scene 使用 `OrthographicCamera` 替代 `BaseCamera`，相机的 left/right/bottom/top 初始化为容器尺寸。
3. 缩放 = `camera.zoom(factor)` 改变正交投影视口边界，渲染时通过 VP 矩阵体现为内容放大/缩小。
4. 平移 = `camera.pan(dx, dy)` 改变视口偏移，实现无限画布浏览。
5. 事件坐标从屏幕空间转为世界空间需经过 VP 逆矩阵变换。
6. `useCanvasZoom`（CSS 缩放）废弃或仅保留给运行态使用。

---

## 已有基础设施

以下能力已在 BanvasGL 中实现，可直接利用：

| 模块 | 能力 | 状态 |
|------|------|------|
| `OrthographicCamera` | `zoom(factor)` / `pan(dx, dy)` / `fitToBounds()` | ✅ 就绪 |
| `OrthographicCamera` | `worldToViewport()` / `viewportToWorld()` 坐标转换 | ✅ 就绪 |
| `OrthographicCamera` | `isPointInViewport()` / `isRectInViewport()` 视口剔除 | ✅ 就绪 |
| `Scene.broadcastVPMatrix()` | 将 camera VP 矩阵广播到所有 View | ✅ 就绪 |
| `View.getMVPMatrix()` | 组合 VP × Model 得到最终变换矩阵 | ✅ 就绪 |
| `View.renderToOffScreen()` | 通过 MVPMatrix 的 `setTransform` 应用变换 | ✅ 就绪 |
| Renderer snap overlay | 使用 `scene.camera.viewProjectionMatrix` 绘制辅助线 | ✅ 就绪 |

---

## 需要填补的差距

| 差距 | 说明 | 影响范围 |
|------|------|----------|
| Scene 默认相机类型 | 从 `BaseCamera` 切换为 `OrthographicCamera` | banvasgl engine |
| 事件坐标逆变换 | `event2Point` 需经 VP 逆矩阵得到世界坐标 | banvas-design |
| Wheel 事件绑定 | 从 CSS 缩放改为 camera zoom/pan | banvas-design |
| Space+Drag pan | 新增画布拖拽交互 | banvas-design |
| Canvas 尺寸策略 | 从固定逻辑尺寸改为容器自适应 | banvas-design, banvas-runtime-web |
| 文本 input 定位 | 世界坐标 → 屏幕坐标需经 VP 正变换 | banvas-design |
| 双缓冲清晰度 | offscreen buffer 尺寸需考虑 zoom factor | banvasgl view |
| useCanvasZoom 废弃 | 设计态不再使用 CSS 缩放 | banvas-runtime-web |

---

## 交互设计

| 操作 | 触发方式 | 行为 |
|------|----------|------|
| Zoom | `Ctrl/Cmd + Wheel` 或 trackpad pinch | `camera.zoom()`，zoom-to-cursor（鼠标下方世界点不动） |
| Pan | 两指滑动 / 普通 Wheel | `camera.pan(deltaX, deltaY)` |
| Pan（拖拽） | `Space + 左键拖拽` 或 `中键拖拽` | `camera.pan(mouseDelta)` |
| Fit to content | 快捷键（如 `Cmd+1`） | `camera.fitToBounds(allViewsBounds)` |
| Reset zoom | 快捷键（如 `Cmd+0`） | `camera.zoom` 重置为 1，position 重置为原点 |

**Zoom-to-cursor 算法**：

```
1. 记录缩放前 screenPoint 对应的 worldPoint_before = VP⁻¹ × screenPoint
2. 执行 camera.zoom(factor)
3. 记录缩放后 screenPoint 对应的 worldPoint_after = VP⁻¹ × screenPoint
4. camera.pan(worldPoint_after - worldPoint_before) 补偿偏移
```

确保鼠标指针下方的世界坐标点在缩放前后保持屏幕位置不变。

---

## 坐标系统

引入相机后，系统存在三级坐标空间：

```
Screen Space (浏览器 clientX/Y)
    │
    │ - container.getBoundingClientRect() 偏移
    ▼
Viewport Space (相对于 canvas 容器的像素坐标)
    │
    │ × (canvas.width / canvas.clientWidth)  ← DPR 转换
    ▼
Canvas Space (canvas 物理像素坐标)
    │
    │ × VP⁻¹  ← 相机逆变换
    ▼
World Space (图形元素的逻辑坐标)
    │
    │ × Model⁻¹  ← View 自身变换的逆
    ▼
Local Space (单个 View 的局部坐标)
```

---

## 性能优化路径

1. **视口剔除**（Phase 6）：渲染前通过 `camera.isRectInViewport(view.bounds)` 跳过不可见 View。
2. **空间索引**（后续）：当画布中元素 > 1000 时引入 R-Tree，加速 viewport 范围查询和 hit test。
3. **LOD 简化渲染**（后续）：zoom < 0.3 时对复杂图形只渲染 bounding box + label。
4. **脏矩形**：当前已有 offscreen 双缓冲，后续可进一步做脏区域增量渲染。

---

## 兼容性考量

| 消费方 | 策略 |
|--------|------|
| `@banyuan/banvas-design`（设计态） | 全量接入无限画布，是主要受益者 |
| `@banyuan/banvas-runtime-web`（运行态） | 运行态保持固定视口，camera zoom=1 不变。`useCanvasZoom` 可保留给运行态做预览缩放 |
| `@banyuan/flow-design`（流程图） | 共享同一套 camera zoom/pan 机制，流程图本身是无限画布场景 |
| LunlunGlass 示例 | 使用 runtime-web，不受影响 |

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 双缓冲 offscreen buffer 在高 zoom 时模糊 | 监测 zoom 阈值，超过时增大 buffer 或切换为直接渲染 |
| DPR 与相机缩放叠加后 setTransform 精度问题 | DPR 在 Renderer 层独立应用（`ctx.scale(dpr, dpr)`），与 VP 矩阵在不同层级，互不干扰 |
| Trackpad pinch 的 ctrlKey 区分在不同平台的行为差异 | Chrome/Firefox/Safari 已统一此行为（pinch → WheelEvent + ctrlKey=true） |
| 现有组件（PropertyPanel、DesignContextMenu）的坐标定位失效 | 提供 `worldToScreen()` 工具函数，所有 DOM 定位统一使用 |

---

## 替代方案（已否决）

### 方案 A：继续使用 CSS 缩放 + 增加 overflow 滚动

通过将 canvas 包裹在 overflow: scroll 的容器中，用原生滚动条模拟平移。缩放仍用 CSS transform。

**否决原因**：

- CSS 缩放无法按需重绘，缩放后文本/线条始终模糊
- 滚动条暗示世界有边界，不是真正的无限画布
- 无法实现 zoom-to-cursor（滚动条只支持固定速率）
- 与引擎的 VP 矩阵体系完全割裂

### 方案 B：保持当前模型，仅在上层 React 做坐标映射

在 React 层维护一个 "虚拟相机" state，渲染前手动对所有 View 做坐标偏移。

**否决原因**：

- 绕过引擎内核，相当于在外面再建一套坐标系统
- 无法复用 OrthographicCamera 已有的完整基础设施
- 所有 hitTest、snap、辅助线都需要额外适配
- 引擎的 VP 矩阵广播机制被浪费

---

## 参考

- [tldraw 相机模型](https://tldraw.dev/docs/editor#camera)
- Steve Ruiz: "A simulated camera" (blog)
- [Excalidraw 架构分析 (DeepWiki)](https://deepwiki.com/excalidraw/excalidraw)
- [Konva.js zoom-to-cursor](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html)
