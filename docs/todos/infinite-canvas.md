# 无限画布（Camera-driven Infinite Canvas）实施计划

> 对应 ADR：[ADR-025](../adr/025-infinite-canvas-camera-architecture.md)

---

## Phase 1：Scene 切换 OrthographicCamera（零风险迁移）

**目标**：将设计态 Scene 的默认 camera 从 `BaseCamera` 切换为 `OrthographicCamera`，初始 VP 矩阵近似 identity，行为不变。

**涉及文件**：

- `packages/banvasgl/src/engine/Scene.ts` — 默认 camera 类型
- `packages/banvas-design/src/useDesignBanvas.tsx` — 初始化时创建 OrthographicCamera
- `packages/banvas-runtime-web/src/useCanvasInit.ts` — 运行态保持 BaseCamera 或也迁移

**具体改动**：

1. Scene 构造时如果未传入 camera，默认创建 `OrthographicCamera` 而非 `BaseCamera`
2. OrthographicCamera 的初始 left=0, top=0, right=canvasWidth, bottom=canvasHeight（视口 = 画布全幅）
3. 此时 VP 矩阵等同于将世界坐标 [0, width] × [0, height] 映射到 NDC [-1, 1]，再映射回屏幕——与 identity 等效
4. 验证：所有现有交互行为不变（拖拽 View、选中、snap）

**验收标准**：

- `pnpm build:all` 零错误
- 设计态画布渲染结果与迁移前像素级一致
- 所有 View 交互（选中、拖拽、resize、文本编辑）正常

---

## Phase 2：Canvas 尺寸自适应容器

**目标**：Canvas 物理/样式尺寸改为跟随外部容器自适应，不再由外部 props 传入固定的逻辑宽高。

**涉及文件**：

- `packages/banvas-design/src/useDesignBanvas.tsx` — 去掉 width/height 必传 props，改为 containerRef 监听
- `packages/banvas-runtime-web/src/useCanvasInit.ts` — 同步适配
- `packages/banvasgl/src/engine/Renderer.ts` — `resize()` 逻辑
- `apps/banyan/frontend/src/pages/UIPage/index.tsx` — 不再传 width/height

**具体改动**：

1. `useDesignBanvas` 增加 `containerRef` 参数（或自动获取 canvas 的 parentElement）
2. 使用 `ResizeObserver` 监听容器尺寸变化
3. 容器 resize 时：`canvas.width = containerWidth * dpr`，`canvas.height = containerHeight * dpr`，`canvas.style.width = '100%'`，`canvas.style.height = '100%'`
4. 同步更新 camera：`camera.right = containerWidth`，`camera.bottom = containerHeight`
5. 外部不再需要传入画布逻辑尺寸，UIPage 中去掉相关 props

**验收标准**：

- 画布自动填满容器，resize 浏览器窗口时画布跟随变化
- DPR 变化时自动更新（如拖拽窗口到不同 DPI 显示器）
- 内容位置不跳动

---

## Phase 3：Wheel 事件绑定相机 zoom/pan + 事件坐标逆变换

**目标**：将 CSS 缩放替换为真正的相机 zoom，将两指滑动/滚轮绑定为相机 pan。事件坐标引入 VP 逆变换。

**涉及文件**：

- `packages/banvas-design/src/canvas/useCanvasEvents.ts` — `event2Point` 改造 + wheel 事件处理
- `packages/banvas-runtime-web/src/useCanvasZoom.ts` — 设计态不再使用，保留给运行态
- `packages/banvas-design/src/useDesignBanvas.tsx` — 注册 wheel handler

**具体改动**：

### 3.1 事件坐标逆变换

```typescript
// 改造 event2Point → event2WorldPoint
const event2WorldPoint = (e: MouseEvent, scene: Scene): Point3 => {
  const canvas = e.target as HTMLCanvasElement
  const scaleX = canvas.width / canvas.clientWidth
  const scaleY = canvas.height / canvas.clientHeight
  // 屏幕空间 → canvas 物理像素空间
  const canvasPoint = new Point3(e.offsetX * scaleX, e.offsetY * scaleY, 0)
  // canvas 物理像素空间 → 世界空间（通过 VP 逆矩阵）
  return scene.camera.viewProjectionMatrix.inverse().multiply(canvasPoint)
}
```

### 3.2 Wheel 事件处理

```typescript
function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const camera = scene.camera as OrthographicCamera

  if (e.ctrlKey || e.metaKey) {
    // Pinch / Ctrl+Wheel → zoom-to-cursor
    const screenPoint = getCanvasPoint(e)
    const worldBefore = camera.viewportToWorld(screenPoint)
    const zoomDelta = -e.deltaY * 0.01
    camera.zoom(1 + zoomDelta)
    const worldAfter = camera.viewportToWorld(screenPoint)
    camera.pan(worldAfter.x - worldBefore.x, worldAfter.y - worldBefore.y)
  } else {
    // 两指滑动 / 普通 Wheel → pan
    camera.pan(-e.deltaX / camera.zoomLevel, -e.deltaY / camera.zoomLevel)
  }
  scene.setDirty()  // 触发重绘
}
```

### 3.3 Zoom 范围限制

- 最小 zoom：0.1（10%）
- 最大 zoom：10（1000%）
- 在 `camera.zoom()` 内部或外部 clamp

**验收标准**：

- Ctrl+滚轮/trackpad pinch 实现 zoom-to-cursor（鼠标下方内容不跳动）
- 两指滑动/普通滚轮实现 smooth pan
- 所有 View 的 hitTest、选中、拖拽在 zoom/pan 后仍然精确
- 缩放后文本清晰（因为是重绘而非像素拉伸）

---

## Phase 4：Space+Drag / 中键拖拽 pan

**目标**：新增画布拖拽平移交互，支持 Space+左键拖拽和中键拖拽。

**涉及文件**：

- `packages/banvas-design/src/canvas/useCanvasEvents.ts` — 新增 pan mode 状态机
- `packages/banvas-design/src/canvas/useInputEvents.ts` — 键盘监听 Space

**具体改动**：

1. 维护 `isPanning` 状态
2. `Space` keydown → 进入 pan 模式，cursor 设为 `grab`
3. `Space` keyup → 退出 pan 模式，cursor 恢复
4. pan 模式下 mousedown → cursor 设为 `grabbing`，记录起始点
5. pan 模式下 mousemove → `camera.pan(deltaX / zoom, deltaY / zoom)`
6. 中键（button === 1）mousedown → 同样进入 pan
7. pan 期间不触发 View 的 interact()

**验收标准**：

- Space+拖拽平移画布，松开 Space 恢复正常交互
- 中键拖拽平移画布
- Pan 期间 cursor 正确（grab → grabbing）
- Pan 结束后 View 交互正常恢复

---

## Phase 5：废弃 useCanvasZoom + 适配文本编辑定位

**目标**：设计态完全使用相机缩放，废弃 CSS 样式缩放。修复文本编辑时 input 的 DOM 定位。

**涉及文件**：

- `packages/banvas-runtime-web/src/useCanvasZoom.ts` — 标记为仅运行态使用
- `packages/banvas-design/src/useDesignBanvas.tsx` — 不再调用 useCanvasZoom
- `packages/banvas-design/src/canvas/useInputEvents.ts` — input 定位改用 `worldToScreen()`

**具体改动**：

1. `useDesignBanvas` 不再调用 `useCanvasZoom`（或条件性调用）
2. 文本编辑 input 的 CSS 定位公式从 `worldX * (clientWidth / canvasWidth)` 改为 `camera.worldToViewport(worldPoint)` 然后除以 DPR
3. 提供 `worldToScreen(worldPoint: Point3): { x: number, y: number }` 工具函数给上层使用
4. DesignContextMenu、PropertyPanel 等依赖坐标的组件统一使用 `worldToScreen`

**验收标准**：

- 双击 View 进入文本编辑时，input 精确叠在 View 上方
- zoom/pan 后双击编辑仍然对齐
- ContextMenu 右键菜单位置正确

---

## Phase 6：视口剔除优化

**目标**：渲染前跳过视口外的 View，提升大画布场景性能。

**涉及文件**：

- `packages/banvasgl/src/engine/Scene.ts` — render 时加入 viewport culling
- `packages/banvasgl/src/view/View/View.ts` — 需要暴露 bounds 信息

**具体改动**：

1. 在 `Scene.render()` 遍历 children 前，计算当前 viewport 的世界坐标范围
2. 对每个顶层 View，检查其 worldBounds 是否与 viewport 相交
3. 不相交则跳过 render
4. 递归时只需检查顶层容器，如果容器完全在视口外则整个子树跳过

**验收标准**：

- 大画布（100+ View）场景下，pan 到内容稀疏区域时帧率明显提升
- 不会出现视口边缘 View 被错误剔除的情况（bounds 计算需考虑 stroke width）

---

## 后续优化（暂不排期）

- **空间索引（R-Tree）**：当 View 数量 > 1000 时引入，加速 viewport 查询和 hitTest
- **LOD 简化渲染**：zoom < 0.3 时只渲染 bounding box + 文字 label
- **惯性 pan（momentum）**：松手后带物理衰减的滑动效果
- **Minimap 小地图**：右下角缩略图显示全局位置
- **Zoom 百分比指示器**：显示当前缩放比例，可点击快速切换

---

## 依赖关系图

```
Phase 1 (OrthographicCamera)
    │
    ▼
Phase 2 (Canvas 自适应)
    │
    ▼
Phase 3 (Wheel zoom/pan + 坐标逆变换)  ← 核心功能交付
    │
    ├──▶ Phase 4 (Space+Drag pan)
    │
    └──▶ Phase 5 (废弃 CSS 缩放 + input 定位)
              │
              ▼
         Phase 6 (视口剔除)
```

Phase 1-2 是安全重构（可一次提交），Phase 3-4 是核心功能，Phase 5 是收尾，Phase 6 是性能优化。
