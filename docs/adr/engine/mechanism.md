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
│  ┌────────────────┐     ┌────────────────┐          ┌────────────────┐       │
│  │M10a 原子事件   │────▶│M10 坐标系统    │──complements──▶│M11 吸附对齐│       │
│  │ (硬件无关输入) │feeds│  与命中检测     │          │  系统           │       │
│  └────────────────┘     └────────────────┘          └────────────────┘       │
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

┌─────────────────────────────────────────────────────────────────────────────┐
│                    流程节点内联编辑                                           │
│  ┌────────────────────────────────────────────────────────┐                 │
│  │M19 NodeView 内联参数编辑（Blender 着色器节点模式）      │                 │
│  │    Phase 1: 摘要行 + DOM 属性面板（→ app:M7）           │                 │
│  │    Phase 2: 内嵌只读（CombinedView flex + TextView）    │                 │
│  │    Phase 3: 内嵌可编辑（Canvas-native 表单控件体系）    │                 │
│  └────────────────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

关系说明：

- M1→M2→M3：渲染管线三阶段递进（缓冲策略→分层排序→裁剪优化）
- M4→M5→M6：事务系统三层递进（记录→调度→执行）
- M7→M8：布局脏标记驱动两阶段管线
- M9 独立：Addon 管线是视图能力的统一分发机制
- M10a→M10：硬件无关原子事件（pointer 归一化）feeds 命中检测，是所有交互的输入源（refines A0 机制层）
- M10⇄M11：坐标系统与吸附对齐互补（命中检测提供坐标转换，吸附对齐提供位置修正）
- M12→M13→M14：动画系统三层递进（描述→计算→调度）
- M15→M16/M17：FlowSchema 执行机制是生命周期和事件绑定的共同基础
- M18 独立：外部订阅是引擎与 React 宿主的桥接机制
- M19 依赖 M15 + A4 + A4a：NodeView 内联编辑基于 FlowSchema 节点结构 + 视图体系 + 布局策略；Phase 1 过渡方案的前端属性面板见 app:M7

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

### M10a. 原子事件机制（硬件无关的 InteractionInput）

**🔧 部分实施 / 跨平台目标待落地** · refines engine:A0

> **A0 机制/策略定位：** 原子事件 `InteractionInput` 是 banvasgl 对上层暴露的**唯一输入契约**，属机制层；banvasgl 平台无关，只**定义并接收**归一化后的原子事件，**既不接触原生事件做归一化，也不做语义识别**。「原生事件→InteractionInput 的归一化（适配）」和「原子事件序列→click/drag/pinch 的语义识别」都是策略，归上层（编辑态 banyan / 运行态 banvas-runtime）。

banvasgl 通过 `InteractionInput`（`packages/banvasgl/src/types/interaction.ts`）判别联合**定义**原子输入契约并**接收**已归一化的输入。**设计纲领（对齐 W3C Pointer Events / Flutter PointerEvent）：原子事件必须硬件无关——用统一的「指针（pointer）」抽象归一化鼠标/触摸/触控笔，设备差异降级为附加属性（pointerType/pointerId/pressure/tilt）而非不同事件类型。** 换平台时只改「原生事件 → 原子事件」的适配器一层，上层识别策略与 View.events 零改动（跨平台收口点原则）。

> **适配器归属：** banvasgl 本身平台无关，**不接触原生 DOM/touch 事件、不做归一化**——它只定义 `InteractionInput` 契约。真正做「原生事件→InteractionInput」适配的是**消费方所在的上层**：运行态在 `@banyuan/banvas-runtime`（唯一的跨平台适配点，吃 mouse/touch/pen），编辑态在 banyan `useInteraction`（仅 PC，退化为 mouse/key 直译）。详见 spec「平台适配落点」节。

**决策链：** A0 确立 banvasgl 是跨平台图形运行时只提供机制 → 桌面 mouse\* 与移动 touch\* 原生事件天然分裂且互不为子集（鼠标有 hover/button、触摸有多指）→ 须用硬件无关的 pointer 抽象归一化（归一化由上层适配器做，banvasgl 只定义契约）→ 设备差异塞进属性而非事件类型 → 上层识别器与 View.events 仅认归一化原子事件，平台差异隔离在 banvas-runtime 的适配器一层。

**目标契约（覆盖桌面 + 移动 + 触控笔）：**

- pointer 类：`pointerdown` / `pointermove` / `pointerup` / `pointercancel`（cancel 为触摸/笔场景系统强制取消所必需）
- 键盘类：`keydown` / `keyup`（code, repeat）
- pointer 公共属性：`worldPoint` / `clientX` / `clientY` / `pointerId`（多指区分）/ `pointerType('mouse'|'touch'|'pen')` / `pressure?` / `tiltX?` / `tiltY?`；`button?` 降级为可选属性

**约束：**

- 适配器（位于上层 banvas-runtime / useInteraction，**非 banvasgl**）是唯一的平台相关代码；`InteractionInput` 契约本身不含 mouse*/touch* 命名的事件类型
- 修饰键派生语义（如多选 multiSelect、ctrl 等比缩放）**不进原子事件**——它们是策略，由上层从 keydown/keyup 维护的修饰键状态推导
- 画布尺寸等上下文（canvasWidth/canvasHeight）由 Delegate 注入，不塞进原子事件
- 桌面 hover 由鼠标连续 pointermove 表达，触摸端无 hover；是否派发 enter/leave 由上层按 pointerType 决定

**现状缺口（实施 spec 已就绪，按需排期落地）：** 当前 `InteractionInput` 命名已对齐 `pointer*`，但字段绑死桌面——缺 `pointerType/pointerId`（G1，多指被堵死）、缺 `pointercancel`（G2）、`multiSelect/ctrlKey` 这两个编辑策略派生字段混入原子事件（G3）、缺 `pressure/tilt`（G4）。注意 `button`（左/中/右键）是合法的硬件无关属性、不在缺口之列，仅需从必填降级为可选。重构会牵连 `InteractionStateMachine` 与 `useInteraction` 适配层。落地方案：G1/G2/G4 + `canvasWidth/canvasHeight` 外移由 `docs/specs/engine/atomic-event-cross-platform.md` 承载，G3（可独立先行、不依赖移动端）由 `docs/specs/engine/tristate-unified-engine.md`「G3 子任务」节承载。

**反例：**

- 在 `InteractionInput` 契约里同时定义 `mousedown` 和 `touchstart` 两套事件类型——逼上层写两份识别逻辑，违背跨平台收口点原则
- 让 banvasgl 直接监听原生 DOM/touch 事件做归一化——平台相关代码下沉进平台无关的机制层，破坏 banvasgl 的跨平台中立性（归一化应留在 banvas-runtime 适配器）
- 把 `multiSelect`/`ctrlKey` 等编辑策略字段塞进原子事件——编辑语义泄漏进机制层，污染运行态与第三方复用
- 用 `pointerType` 在契约层分流出不同事件类型——设备差异应是属性而非类型，否则上层仍需感知设备

**参见：**

- 论证与缺口表：`docs/specs/engine/tristate-unified-engine.md`「banvasgl 暴露的原子事件契约」节（含目标 InteractionInput 草案与 G1~G4 缺口表）
- 实施方案（G1/G2/G4 + canvasWidth 外移）：`docs/specs/engine/atomic-event-cross-platform.md`
- G3 子任务实施（multiSelect/ctrlKey 剥离）：`docs/specs/engine/tristate-unified-engine.md`「G3 子任务」节

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

- App.\_renderFrame 中：AnimationManager.tick(timestamp) → Scene.render()
- tick 遍历所有活跃 executor，计算当前帧值并应用到对应 View
- 动画完成后自动从活跃列表移除
- AnimationAddon 挂载在 View 上，负责采集 initialValues + 注册到 Manager

---

## 流程执行

### M15. FlowSchema Push-Pull 混合调度机制

**✅ 已实施**

FlowRunner 采用 **Push-Pull 混合调度**：Push 沿**控制边**推进 control/action 节点，Pull 沿**数据边**反向递归拉取 source/compute 子树求值。两种边分工明确——控制边串起整个流程的执行顺序且不携带业务数据，数据边连接输出端口到输入插槽。

**决策链：** 流程图中控制流和数据流是两个不同的关注面 → Push 解决「谁在什么时候执行」（控制流），Pull 解决「值是多少」（数据流）→ Blueprints 的 exec + data 双线模型已验证 Push-Pull 的工程可行性 → Banyuan 显式拆分为 ControlEdge 和 DataEdge，消除运行时字段推断的歧义。

**调度算法（语义层面）：**

1. **Push 主循环（沿控制边）**：从 `entry` 出发，沿控制边遍历节点。control 节点决定走向（匹配 `branch` 选出边或下钻子图），action 节点先 Pull 输入再执行副作用再沿控制边继续。控制边出度 0 即该条路径结束。
2. **Pull 求值（沿数据边）**：action 节点执行前、control 节点判据求值前，检查各输入插槽。插槽有数据边连入 → 沿该数据边递归 Pull 上游节点的对应输出端口；无 → 取插槽内联默认值。
3. **子图下钻（闭包调用）**：遍历到复合节点时，栈式递归执行其内嵌子图（`runSubgraph`），压入新作用域帧。子图走到 `subExit` 即弹帧、回母图继续。
4. **parallel 帧快照**：`all`/`allSettled` 模式下每个分支拍独立帧快照，互不干扰。`race`/`any` 模式下共享帧，胜出后其余分支广播取消信号后丢弃。
5. **错误处理**：executor 统一 try-catch。有 `onError` 子图则下钻补偿（注入 `{ error, partialOutputs }`），补偿执行完毕后流程终止。无 onError 则走全局默认错误处理。

**三个不变量：**

- **控制路径无环**：编辑时 DFS 校验控制边拓扑，子图内部同样保证。
- **数据边 forward-reference**：数据边的 `fromNode` 在控制序上必须先于 `toNode`（source/compute 天然通过）。
- **Pull 不遇未执行 action**：forward-reference 的推论——被数据边引用的 action 一定已 Push 执行过。

**约束：**

- MAX_STEPS=1000，顶层和子图各独立计数。
- `resolveSlot(name)` 沿数据边递归 Pull。
- NodeExecutor 接口不变，调度逻辑在 FlowRunner 层。
- `navigate` 控制边出度必须为 0（编辑时校验）。

**反例：**

- 统一一种边——控制流和数据流职责不同，隐式靠字段推断增加歧义。
- 强制 SESE 顶层图——出度 0 即结束，汇合可选。

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

---

## 流程节点内联编辑

### M19. NodeView 内联参数编辑机制（Blender 着色器节点模式）

**Phase 1 已实施** · 依赖 M15（FlowSchema 执行）· 依赖 A4（视图体系）· 依赖 A4a（布局策略模式）· 实现 C15（图结构契约的插槽混合模型）

流程节点（NodeView）从纯展示升级为**内嵌可交互参数控件的容器**，终极目标是实现 Blender Shader Node Editor 的就地编辑体验——节点本体即表单，参数行与端口锚定关联，连线接入时隐藏默认值编辑器，整体为 Canvas 内自绘控件，不依赖 DOM overlay。本机制是协议级 **C15. FlowSchema 图结构契约** 约束三「插槽混合模型（socket 默认字面量 + 数据边覆盖，互斥）」在外壳层的机制落地：未连线显示插槽内联 FlowValue 控件、连线接入时边获胜并隐藏控件。

**决策链：** 流程节点参数当前不可视、不可编辑（只显示标题）→ 用户必须有外部属性面板才能配置节点 → 信息密度低、操作链路长 → 参照 Blender 将参数内嵌到节点 → BanvasGL 已有 TextView（完整文本编辑能力）+ CombinedView flex 布局 → 可基于现有视图体系组合出节点内表单 → 端口锚定到参数行实现「连线 = 赋值来源」的可视化语义。

**终极目标（Blender 式）：**

- 节点内部为标题栏 + N 行参数行，每行由「标签 + Canvas-native 控件」组成
- 端口（socket）锚定在对应参数行左/右侧，而非均匀分布
- 未连线的输入端口旁显示可编辑的默认值控件；有连线接入时控件隐藏，显示连线来源
- 节点高度由内容驱动自适应
- 基于 TextView 已有能力扩展 Canvas-native 表单基元（InputView/SelectView/FlowValuePicker 等）
- 侧面板仅作为重型编辑场景的补充入口（如 script code）

**渐进路径：** Phase 1 摘要行 + DOM 属性面板（app:M7）→ Phase 2 NodeKindDescriptor 驱动内嵌只读视图（M19a）→ Phase 3 内嵌可编辑控件

**约束：**

- NodeView 内嵌的交互视图不能抢占 PortView 的命中优先级（PortView 始终最高，用于连线）
- 节点内控件的编辑操作必须通过 TransactionManager 走事务（支持撤销/重做）
- 节点高度自适应需要触发 EdgeView 重新计算贝塞尔曲线（端口位置变化 → 边的锚点变化）
- Canvas-native 控件体系归属 BanvasGL（packages/banvasgl），不归属 banvas-runtime——这些是编辑态的机制，不是运行态策略
- 焦点管理：InteractionStateMachine 的逐层激活策略（A3a）需要能穿透 NodeView 到达内部可编辑子视图
- NodeView 本身不子类化——多态渲染由 NodeKindDescriptor 注册表驱动（见 M19a）

**反例：**

- DOM overlay 方案——缩放/平移时 DOM 对齐维护成本极高，与 Canvas 坐标系割裂
- 纯侧面板方案——信息密度过低，违背「节点本体即表单」的设计目标
- 为每种 kind 定义独立 NodeView 子类——违背 schema-driven 多态渲染设计，kind 数量 22+ 且持续增长，子类爆炸不可维护
- 引入第三方 Canvas UI 框架——与自有视图体系不兼容，无法复用 TextView 已有能力
- 在 NodeView 内部用 switch/if 分发 kind 逻辑——当前 Phase 1 的临时方案，kind 知识割裂在 4 个函数中（appearance/ports/title/summary），新增 kind 需改 4 处，无类型关联约束

**实施方案：** `docs/specs/engine/flow-node-inline-edit.md`

---

### M19a. NodeKindDescriptor — 流程节点图形语义外壳层

**未实施** · 细化 M19 · 依赖 A4（视图体系）· 依赖 M15（FlowSchema 执行）

FlowSchema 是纯执行语义层（节点做什么），NodeKindDescriptor 是**图形语义层**（节点怎么画、怎么编辑）。每个 FlowNode kind 对应一个 Descriptor 实例，封装该 kind 的全部可视化与交互知识，NodeView 作为通用渲染壳通过注册表查询 Descriptor 进行多态渲染。Descriptor 的 `derivePorts()` 把节点参数插槽投影为端口、把 ControlEdge/DataEdge 投影为连线，是协议级 **C15. FlowSchema 图结构契约**「外壳⇄schema 双向无损可逆」要求的外壳侧实现；C15 定义图的字段形状，M19a 定义这个形状如何派生为可编辑的图形外壳。

**决策链：** Phase 1 的 kind 知识散落在 4 个独立函数的 switch/case 中（deriveAppearance/derivePortsFromSchema/deriveTitleFromSchema/deriveSummaryFromSchema）→ 新增 kind 需改 4 处、前端 Panel 又是第 5 处 → Phase 2/3 还需增加表单字段描述、端口-参数锚定映射 → 知识碎片化不可持续 → 需要一个统一的 per-kind 描述符将所有图形语义聚合 → Descriptor 模式：每个 kind 一个文件，NodeView 只做通用渲染壳。

**核心设计：**

- `NodeKindDescriptor` 是抽象基类，定义图形语义契约（外观、端口拓扑、标题、摘要、表单字段）
- 每个 kind 一个具体 Descriptor 子类（如 `SetVariableDescriptor`、`ConditionDescriptor`）
- `NodeKindRegistry` 是 kind → Descriptor 的映射注册表，NodeView 构造时通过 `registry.get(schema.kind)` 获取对应 Descriptor
- Descriptor 同时服务 Canvas 渲染（NodeView 调用）和 DOM 面板（React Panel 调用），是前后端共享的单一事实来源
- 边（EdgeView）和端口（PortView）的拓扑由 Descriptor 的 `derivePorts()` 定义——端口是节点参数的图形化投影，Descriptor 决定哪些参数暴露为端口、端口的方向和锚定位置

**Descriptor 契约接口：**

- `kind: string` — 对应 FlowNode.kind
- `shape: 'rect' | 'diamond'` — 节点外框形状（仅 condition 为 diamond，其余为 rect）
- `accentColor: string` — 色条/强调色
- `icon: string` — emoji 图标
- `getTitle(schema): string` — 节点标题
- `getSummaryLines(schema): string[]` — Canvas 摘要行（Phase 1/2）
- `derivePorts(schema): PortDefinition[]` — 端口拓扑（含 ID 命名、方向、锚定行索引）
- `getFormFields(schema): FormFieldDescriptor[]` — 表单字段描述（Phase 1 DOM 面板 + Phase 3 inline）
- `validate(schema): ValidationResult` — 参数完整性校验

**端口与 Descriptor 的关系：**

端口是参数的图形化投影。Descriptor 的 `derivePorts()` 不仅定义端口的存在性和方向，还定义端口与参数行的锚定关系（`anchorFieldIndex`）。Phase 2/3 中端口 y 坐标由锚定的参数行垂直中心决定，而非均匀分布。动态端口（如 subFlow 的 inputs/outputs、callFlow 的 bindings）由 Descriptor 根据 schema 实例动态生成。

**边与 Descriptor 的关系：**

EdgeView 本身不需要 Descriptor——边是两个端口之间的连接，其渲染逻辑（贝塞尔曲线）是通用的。但边的语义（控制流 vs 数据流、分支标签）由 FlowEdge 的**显式分型**承载——按 C15 升级为 `ControlEdge | ErrorEdge | DataEdge` 判别联合（`edgeKind` 字段直接区分，不再靠 `branch`/`toParam` 可选字段推断）；具体分型字段合法值由源节点 Descriptor 的端口定义约束，DataEdge 的 `slot` 须命中目标 Descriptor 暴露的参数插槽端口。

**放置位置：** `packages/banvasgl/src/view/FlowViews/nodeKinds/`——归属 view 层而非 flow 层，因为 Descriptor 的职责是图形表达。flow 层保持纯净（只管执行语义），Descriptor 通过 import flow 层类型（FlowNode/FlowValue 等）读取参数，但 flow 层不反向依赖 view 层。

**约束：**

- Descriptor 不持有可变状态——它是纯函数式的描述对象，所有方法接收 schema 返回结果
- 端口 ID 命名约定必须保持向后兼容（`_in`/`_out`/`_true`/`_false`/`_error`/`_param_*`/`_result_*`），EdgeView 通过 `Scene.findViewById(portId)` 依赖这些 ID
- Descriptor 不依赖 React/DOM——它是纯 TypeScript 类，Canvas 和 React 都能消费
- 新增 kind 只需新增一个 Descriptor 文件并在 Registry 注册，不需要修改 NodeView/EdgeView/PortView
- `FormFieldDescriptor` 描述的是字段元数据（名称、类型、选项来源），不是具体的 UI 组件——Phase 1 由 React 组件消费渲染 DOM 表单，Phase 3 由 Canvas inline renderer 消费绘制 Canvas 控件

**反例：**

- Descriptor 放在 flow/ 目录——flow 层是执行语义，不应知道图形表达
- Descriptor 依赖 React——会导致 Canvas-only 场景无法使用
- 在 Descriptor 中硬编码端口 y 坐标——坐标是布局结果，Descriptor 只描述锚定关系（哪个端口对应哪个参数行），具体坐标由 NodeView 布局阶段计算
- 为 EdgeView 也设计 Descriptor——边的渲染是通用的（贝塞尔曲线），不需要 per-kind 多态

**实施方案：** `docs/specs/engine/flow-node-inline-edit.md`（Phase 2 章节）
