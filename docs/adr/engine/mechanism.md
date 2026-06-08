# 引擎 · 机制级决策

> 某个机制怎么工作——引擎内部各子系统的运行机理。

---

## 决策依赖图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          渲染管线                                            │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │M1 双缓冲+DPR   │────▶│M2 渲染优先级   │────▶│M3 视口裁剪     │           │
│  │  渲染管线       │     │  分层排序       │     │  + 脏标记重绘   │           │
│  └────────────────┘     └────────────────┘     └────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          数据管理                                            │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │M4 事务系统     │────▶│M5 操作栈       │────▶│M6 Diff 回放    │           │
│  │  三层架构       │     │  撤销/重做调度  │     │  执行器         │           │
│  └────────────────┘     └────────────────┘     └────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          布局系统                                            │
│  ┌────────────────┐     ┌────────────────┐                                  │
│  │M7 双脏标记     │────▶│M8 两阶段       │                                  │
│  │  reflow/repaint│     │  布局管线       │                                  │
│  └────────────────┘     └────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Addon 管线                                          │
│  ┌──────────────────────────────────┐                                       │
│  │M9 Addon Capability 声明          │                                       │
│  │   + 统一管线分发                  │                                       │
│  └──────────────────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          交互与对齐                                          │
│  ┌────────────────┐                    ┌────────────────┐                   │
│  │M10 坐标系统    │──complements──────▶│M11 吸附对齐    │                   │
│  │  与命中检测     │                    │  系统           │                   │
│  └────────────────┘                    └────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          动画系统                                            │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │M12 Descriptor  │────▶│M13 Executor    │────▶│M14 Manager     │           │
│  │  动画描述对象   │     │  关键帧插值     │     │  全局帧驱动     │           │
│  └────────────────┘     └────────────────┘     └────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          流程执行                                            │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │M15 FlowSchema  │────▶│M16 Scene 生命  │     │M17 View 事件   │           │
│  │  节点图执行     │     │  周期绑定       │     │  绑定 FlowSchema│           │
│  └────────────────┘     └───────┬────────┘     └───────┬────────┘           │
│                                 │ enables              │ enables             │
│                                 └──────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          外部订阅                                            │
│  ┌──────────────────────────────┐                                           │
│  │M18 useSyncExternalStore 机制 │                                           │
│  └──────────────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

关系说明：

- M1→M2→M3：渲染管线三阶段递进（缓冲策略→分层排序→裁剪优化）
- M4→M5→M6：事务系统三层递进（记录→调度→执行）
- M7→M8：布局脏标记驱动两阶段管线
- M9 独立：Addon 管线是视图能力的统一分发机制
- M10⇄M11：坐标系统与吸附对齐互补（命中检测提供坐标转换，吸附对齐提供位置修正）
- M12→M13→M14：动画系统三层递进（描述→计算→调度）
- M15→M16/M17：FlowSchema 执行机制是生命周期和事件绑定的共同基础
- M18 独立：外部订阅是引擎与 React 宿主的桥接机制

---

## 渲染管线

### M1. 双缓冲 + DPR 渲染管线

**✅ 已实施**

渲染采用 OffscreenCanvas 双缓冲策略，DPR 融入变换矩阵实现高清渲染。

**决策链：** 直接在主 Canvas 上绘制会导致闪烁 → 双缓冲消除闪烁 → DPR 需要在物理像素级别精确渲染 → 将 DPR 融入 Canvas transform 而非手动缩放每个绘制调用。

**约束：**

- OffscreenCanvas 绘制完成后通过 transferToImageBitmap 传递到主 Canvas
- 逻辑坐标 × dpr = 物理像素，相机在逻辑空间操作
- Canvas 物理尺寸 = 逻辑尺寸 × dpr
- Renderer 在每帧开始时设置 transform 矩阵（含 DPR + 相机 VP）

---

### M2. 渲染优先级分层排序

**✅ 已实施** · 依赖 M1

渲染时 Scene 按固定顺序排列视图：Views → PresetViews → SelectedViews → InteractionViews（前景覆盖后景）。每层内部按用户指定的 `zIndex` 排序。

**决策链：** 需要让交互层（拖拽手柄、选中框等）始终置顶 → 引入预设分层 → 层内排序由用户控制。

**约束：**

- InteractionViews 始终在最前，接收所有点击事件
- SelectedViews 用于高亮选中态，位于业务视图之上
- PresetViews 用于引擎预置的辅助视图（如网格线、标尺）
- 同层 zIndex 冲突时按数组顺序决定（后入栈的绘制在前）
- LayerManager 提供 bringToFront/sendToBack 等层级操作

---

### M3. 视口裁剪与脏标记重绘

**✅ 已实施** · 依赖 M2

仅渲染与当前视口相交的 View（视口裁剪），且仅在 dirty 标记为 true 时触发重绘。

**决策链：** 大画布中大量 View 不在视口内 → 全量渲染浪费性能 → 视口裁剪 + 脏标记双重优化。

**约束：**

- 视口裁剪：通过 View bounds 与 camera viewport 的 AABB 相交测试
- 脏标记：事务 commit / 属性变更 / 动画帧 触发 dirty
- dirty 为 false 时 requestAnimationFrame 回调直接跳过渲染
- 渲染顺序：decoration 背景 → clip 裁剪 → 内容 + 子节点 → addon 插件

---

## 数据管理

### M4. TransactionManager 事务化操作

**✅ 已实施**

所有对 Scene 数据的修改通过 `TransactionManager` 进行事务化管理，支持事务粒度的撤销/重做。

**决策链：** 用户操作（拖拽、属性编辑、AI 生成）需要可撤销 → 需要记录每步操作的逆操作 → 事务管理器批量管理原子操作，合并为一个撤销单元。

**约束：**

- 持续性操作（拖拽）：begin → 多次 mutation → commit/rollback
- 瞬时操作（添加/删除/层级）：直接 recordAdd / recordRemove / recordReorder
- 事务可嵌套（外层事务包含子事务，commit 时统一提交）
- AI 工具协议操作也走 TransactionManager，因此 AI 修改同样可撤销
- 事务提交触发 Scene dirty flag，下一帧重新渲染

---

### M5. OperationStack 撤销/重做调度

**✅ 已实施** · 依赖 M4

`OperationStack` 管理 undo/redo 栈，每次事务 commit 产生一个 UndoUnit 入栈。

**决策链：** 事务记录了变更 → 需要一个栈结构管理历史 → undo 弹出栈顶执行逆操作 → redo 重新应用已撤销的操作。

**约束：**

- undo() 弹出栈顶 UndoUnit 并执行逆操作，移入 redo 栈
- redo() 从 redo 栈弹出并重新应用
- 新操作 commit 时清空 redo 栈（分支历史不保留）
- 栈深度可配置（防止内存无限增长）

---

### M6. DiffApplier 回放执行器

**✅ 已实施** · 依赖 M5

`DiffApplier` 负责将 Diff 对象（MODIFY/ADD/REMOVE/REORDER）应用到 Scene 上，是 undo/redo 的实际执行层。

**决策链：** OperationStack 存储的是 Diff 描述 → 需要一个执行器将 Diff 转化为实际的 Scene 变更 → DiffApplier 解耦了"记录什么变了"和"如何应用变更"。

**约束：**

- Diff 类型：MODIFY（属性变更）/ ADD（新增 View）/ REMOVE（删除 View）/ REORDER（层级变更）
- MODIFY Diff 包含 oldValue 和 newValue，undo 时用 oldValue 覆盖
- ADD/REMOVE 互为逆操作
- DiffApplier 执行后触发 dirty flag

---

## 布局系统

### M7. 双脏标记机制（layoutDirty + styleDirty）

**✅ 已实施**

布局系统使用两个独立的脏标记：`_layoutDirty`（需要 reflow）和 `_styleDirty`（需要 repaint）。

**决策链：** 布局计算（reflow）比样式应用（repaint）昂贵得多 → 区分两种脏标记避免不必要的 reflow → 仅样式变更时跳过布局计算。

**约束：**

- 子元素增删、尺寸变更 → 标记 layoutDirty
- 颜色、透明度、边框样式变更 → 仅标记 styleDirty
- layoutDirty 隐含 styleDirty（reflow 后必然需要 repaint）
- 脏标记向上冒泡（子元素 dirty 导致父容器 dirty）

---

### M8. 两阶段布局管线

**✅ 已实施** · 依赖 M7

布局分为两个阶段：resolveVisualStyle（阶段 A，布局前样式解析）→ performLayout（布局计算）→ resolveLayoutStyle（阶段 B，布局后样式修正）。

**决策链：** 某些样式属性依赖布局结果（如百分比宽度需要父容器已确定宽度）→ 需要在布局前后各做一次样式解析 → 两阶段管线。

**约束：**

- 阶段 A（resolveVisualStyle）：解析不依赖布局的样式（颜色、字体、边框等）
- performLayout：根据 layoutMode 调用对应 LayoutStrategy 计算子元素位置和尺寸
- 阶段 B（resolveLayoutStyle）：解析依赖布局结果的样式（overflow 裁剪区域、滚动条位置等）
- 布局从根节点向下递归执行（父先于子）

---

## Addon 管线

### M9. Addon Capability 声明与统一管线分发

**✅ 已实施**

View-Addon 架构采用组合模式，每个 addon 作为 View 的具名属性存在。管线分发基于 `AddonCapability` 元信息实现自动化接入——addon 声明自己参与哪些管线（RENDER / INTERACT / LOGIC），View 基类通过 `activeAddons` getter 收集所有活跃 addon，`renderPlugins` 和 `interactPlugins` 统一遍历并按 `priority` 排序，仅调用具有对应 capability 的 addon。

**决策链：** 原有模式下每个子类通过 override `renderPlugins`/`interactPlugins` 手工接入 addon，新增 addon 时容易遗漏 → addon 的设计意图隐含在运行时 early return 中，不可自文档化 → 多选 resize 场景下需要"仅逻辑不渲染"的能力但缺乏表达手段 → 引入 capabilities 元信息 + 统一管线分发。

**约束：**

- AddonCapability 枚举：RENDER（参与渲染管线）/ INTERACT（参与交互管线）/ LOGIC（仅参与逻辑计算）
- 一个 addon 可同时声明多个职责，管线根据 capabilities 决定是否调用对应方法
- View 基类提供 `activeAddons` getter，子类通过 override 追加自己的 addon
- `priority` 字段决定同管线内多个 addon 的执行顺序（数值越小越先执行）
- 新增 addon 时只需：声明属性 + 在 `activeAddons` 中追加，管线自动接管
- 不引入运行时插件注册表——产品决策限定用户不能自定义插件，保持具名属性的强类型和性能优势
- 多选 resize 等场景可通过运行时切换 capabilities 实现"仅逻辑不渲染"

**Addon 新增判定标准（满足任一即应抽象为 addon）：**

- 复用性：多个 View 子类可能使用
- 可选性：行为可以不存在而不影响子类核心身份
- 生命周期独立性：有独立的挂载/激活/休眠周期
- 复杂度：即使是子类独有行为，复杂到影响可维护性

---

## 交互与对齐

### M10. 坐标系统与命中检测

**✅ 已实施**

引擎使用左上角为原点的世界坐标系。命中检测通过 `isPointInView()` 方法逐视图判断，支持矩形和路径两种命中模式。

**决策链：** Web 坐标系天然左上角原点 → 保持一致减少心智负担 → 命中检测需支持不规则图形（如自定义 Path）。

**约束：**

- 屏幕坐标转世界坐标：`camera.screenToWorld(x, y)`
- View 的 hitTest 可被子类 override（如 EdgeView 使用线段距离检测）
- 命中遍历顺序与渲染相反（前景优先被命中）
- 容器视图的命中需要递归检查子视图

---

### M11. 吸附对齐系统（SnapAlign）

**✅ 已实施** · 与 M10 互补

拖拽过程中，`SnapAlignManager` 提供边/中点吸附和对齐辅助线渲染。

**决策链：** 用户拖拽元素时需要精确对齐 → 手动对齐效率低 → 自动吸附 + 辅助线是设计工具标配（Figma/Sketch）。

**约束：**

- 生命周期绑定拖拽操作：begin(mousedown) → snap(mousemove) → end(mouseup)
- SnapCache：拖拽开始时构建候选目标缓存（排除当前操作的 view）
- SnapSolver：X/Y 轴独立的边/中点吸附求解器（阈值 3px）
- SnapOverlay：对齐辅助线渲染（在 Scene 渲染后叠加绘制）
- 吸附结果修正拖拽位移，使元素"粘"到对齐位置

---

## 动画系统

### M12. AnimationDescriptor 动画描述对象

**✅ 已实施**

动画描述对象持有关键帧定义和配置，自身是一个状态机：idle → running → finished/cancelled。

**决策链：** 动画需要声明式描述（关键帧、时长、缓动）→ 描述与执行分离 → Descriptor 是纯数据对象，可序列化、可复用。

**约束：**

- 包含：关键帧数组、duration、easing、delay、iterations、direction
- 状态机：idle（未开始）→ running（执行中）→ finished（正常结束）/ cancelled（被取消）
- 可从 FlowSchema 的 animate 节点创建

---

### M13. AnimationExecutor 关键帧插值计算器

**✅ 已实施** · 依赖 M12

纯计算器，负责根据当前时间和 Descriptor 配置计算插值结果。

**决策链：** 动画执行需要每帧计算中间值 → 插值逻辑独立于调度逻辑 → Executor 是无状态的纯函数式计算器。

**约束：**

- 输入：当前时间 + AnimationDescriptor
- 输出：当前帧各属性的插值结果
- 支持多种缓动函数（linear/ease/ease-in/ease-out/cubic-bezier）
- 支持多关键帧之间的分段插值

---

### M14. AnimationManager 全局帧驱动

**✅ 已实施** · 依赖 M13

全局单例，由 App 在每帧 render() 之前调用 `tick()`，驱动所有活跃的 AnimationExecutor。

**决策链：** 多个 View 可能同时有动画 → 需要统一的帧调度器 → 全局 Manager 在 rAF 循环中批量 tick。

**约束：**

- App._renderFrame 中：AnimationManager.tick(timestamp) → Scene.render()
- tick 遍历所有活跃 executor，计算当前帧值并应用到对应 View
- 动画完成后自动从活跃列表移除
- AnimationAddon 挂载在 View 上，负责采集 initialValues + 注册到 Manager

---

## 流程执行

### M15. FlowSchema 节点图执行机制

**✅ 已实施**

FlowSchema 由 `nodes`（节点数组）和 `edges`（连线数组）构成有向图，FlowRunner 按拓扑序执行节点。每个节点有 `kind` 对应一个 `NodeExecutor`，执行结果通过 edge 传递给下游。

**决策链：** 低代码流程需要可视化编辑 → 节点图是自然的可视化表达 → 运行时需要拓扑遍历和条件分支。

**约束：**

- 每个 NodeExecutor 接收 `FlowContext`（包含 variables、trigger source、app 实例引用等）
- condition 节点基于表达式返回 true/false 决定走哪条 edge
- delay 节点通过 setTimeout 暂停执行流
- subFlow 节点可递归调用另一个 FlowSchema
- 循环检测：FlowRunner 内置 MAX_STEPS=1000 安全阀
- 值解析器 resolveValue 支持：literal / dataRef / pageDataRef / eventArg / nodeRef 五种来源

---

### M16. Scene 生命周期绑定 FlowSchema

**✅ 已实施** · 依赖 M15 · refines engine:A0

> **A0 机制/策略定位：** Scene.triggerSchema 是 FlowSchema 执行机制的统一拦截点（机制），属于 runtime ⊃ rendering 中的流程控制机制；生命周期钩子在何种场景下被触发、是否执行（flowEnabled）由上层 hook 注入（策略）。banvasgl 只保证「钩子存在且 triggerSchema 可被调用」，不内置「编辑态/运行态」的触发策略。

Scene 定义 4 个生命周期钩子：`onLoad` / `onUnload` / `onShow` / `onHide`，类型均为 `FlowSchema | null`。View 定义 3 个生命周期钩子：`onCreated` / `onAttach` / `onDestroy`。

**决策链：** A0 确立 FlowSchema 执行是 runtime 机制 → 页面切换时需要执行初始化/清理逻辑（如数据加载、变量重置）→ 生命周期即为 FlowSchema 触发点 → Scene.triggerSchema 构造 FlowContext 并调用 FlowRunner.run。

**约束：**

- onLoad 在 Scene 首次激活时触发（进入页面）
- onShow/onHide 在 Scene 可见性切换时触发
- onUnload 在 Scene 销毁时触发（用于清理）
- 生命周期 FlowSchema 中可调度 client 节点（如 setData、navigate）

---

### M17. View 事件绑定 FlowSchema（13 个事件处理器）

**✅ 已实施** · 依赖 M15 · refines engine:A0

> **A0 机制/策略定位：** 「事件 → FlowSchema 执行」的派发通道（Scene.triggerSchema gate）是机制；「编辑态不执行、运行态执行」则是策略取值——由上层 hook（useDesignBanvas / useRuntimeBanvas）注入 flowEnabled 决定，banvasgl 不内置该差异。机制层只提供一个可被 gate 拦截的执行入口，策略层决定 gate 放行与否。

View.events（`IViewEvents`）是一个 map，覆盖桌面端交互事件模型，共 13 个键，value 均为 `EventHandler = FlowSchema | null`：点击类 `onClick` / `onDoubleClick` / `onContextMenu`；鼠标移动类 `onMouseEnter` / `onMouseLeave` / `onMouseMove` / `onMouseDown` / `onMouseUp`；拖拽类 `onDragStart` / `onDrag` / `onDragEnd`；焦点类 `onFocus` / `onBlur`（焦点类仅对可聚焦 View 如 Input 有效）。

> **事件清单以代码为准**（`packages/banvasgl/src/types/view/view.ts` 的 `IViewEvents`）。当前是桌面端鼠标/键盘事件模型，不含 onLongPress/onSwipe/onChange/onScroll/onInput/onSubmit 等触摸或表单语义事件——如需支持移动端触摸手势，须先扩展 `IViewEvents` 再同步本决策。「把底层原子事件（pointerdown/move/up）解释成上述高级事件」是运行策略，归 `@banyuan/banvas-runtime`，非 banvasgl 机制。

**决策链：** A0 确立机制/策略分离 → 用户交互需要触发业务逻辑 → 把事件处理统一为 FlowSchema 执行（机制）→ 执行与否由 hook 注入 flowEnabled（策略）→ 低代码编辑器可直接拖拽配置事件处理逻辑。

**约束：**

- 事件触发时 Scene.triggerSchema 自动注入 event payload 到 FlowContext.triggerData
- 编辑态（useDesignBanvas）不执行 events FlowSchema —— flowEnabled 策略取值，非机制硬编码
- 运行态（useRuntimeBanvas）完整执行 events FlowSchema —— 同一机制入口、不同策略放行
- 每个事件最多绑定一个 FlowSchema（多逻辑在 FlowSchema 内部用并行/条件分支解决）

---

## 外部订阅

### M18. useSyncExternalStore 外部订阅机制

**✅ 已实施**

App 实现 React 18+ 的外部存储订阅协议（subscribe / getVersion / notify），React 层通过 `useSyncExternalStore` 精确订阅引擎状态变化。

**决策链：** 引擎状态变化需要通知 React 重渲染（如选中状态、属性面板更新）→ 传统 setState 需要引擎依赖 React → useSyncExternalStore 让引擎保持独立，React 主动订阅。

**约束：**

- App.notify()：递增内部版本号，触发所有订阅者
- actions 修改引擎状态后必须调用 notify()
- React 组件通过 useSyncExternalStore(app.subscribe, app.getVersion) 订阅
- 版本号是单调递增整数，React 通过比较版本号决定是否重渲染
- 避免了 forceUpdate 或手动 setState 的反模式
