# 引擎 · 机制级决策

> 某个机制怎么工作——引擎内部各子系统的运行机理。

---

## 决策依赖图

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ M1 渲染优先级排序     │     │ M2 TransactionManager│     │ M3 View 继承体系     │
│    （分层+zIndex）    │     │    事务化操作         │     │    与 addon mixin    │
└──────────┬───────────┘     └──────────────────────┘     └──────────┬───────────┘
           │                                                         │ enables
           │ complements                                ┌────────────▼───────────┐
           │                                            │ M4 layoutMode 统一容器  │
┌──────────▼───────────┐                                └────────────────────────┘
│ M8 坐标系统与命中检测 │
└──────────────────────┘

┌──────────────────────────────┐
│ M5 FlowSchema 节点图执行机制  │
└──────────────┬───────────────┘
               │ enables
       ┌───────┴───────┐
       │               │
┌──────▼──────┐  ┌─────▼──────────┐
│ M6 Scene    │  │ M7 View 事件    │
│ 生命周期绑定 │  │ 绑定 FlowSchema │
└─────────────┘  └────────────────┘
```

关系说明：

- M1→M8：渲染分层决定绘制顺序，命中检测按相反顺序遍历（互补）
- M3→M4：View 继承体系确立后，布局策略作为 CombinedView 的 layoutMode 扩展
- M5→M6/M7：FlowSchema 执行机制是 Scene 生命周期和 View 事件绑定的共同基础
- M2 独立：事务化是正交的数据管理机制，服务于所有写操作

---

## 渲染与交互

### M1. 渲染优先级排序机制

**✅ 已实施**

渲染时 Scene 按固定顺序排列视图：Views → PresetViews → SelectedViews → InteractionViews（前景覆盖后景）。每层内部按用户指定的 `zIndex` 排序。

**决策链：** 需要让交互层（拖拽手柄、选中框等）始终置顶 → 引入预设分层 → 层内排序由用户控制。

**约束：**

- InteractionViews 始终在最前，接收所有点击事件
- SelectedViews 用于高亮选中态，位于业务视图之上
- PresetViews 用于引擎预置的辅助视图（如网格线、标尺）
- 同层 zIndex 冲突时按数组顺序决定（后入栈的绘制在前）

---

### M8. 坐标系统与命中检测

**✅ 已实施** · 与 M1 互补

引擎使用左上角为原点的世界坐标系。命中检测通过 `isPointInView()` 方法逐视图判断，支持矩形和路径两种命中模式。

**决策链：** Web 坐标系天然左上角原点 → 保持一致减少心智负担 → 命中检测需支持不规则图形（如自定义 Path）。

**约束：**

- 屏幕坐标转世界坐标：`camera.screenToWorld(x, y)`
- View 的 hitTest 可被子类 override（如 EdgeView 使用线段距离检测）
- 命中遍历顺序与渲染相反（前景优先被命中）
- 容器视图的命中需要递归检查子视图

---

## 数据管理

### M2. TransactionManager 事务化操作

**✅ 已实施**

所有对 Scene 数据的修改通过 `TransactionManager` 进行事务化管理，支持事务粒度的撤销/重做。

**决策链：** 用户操作（拖拽、属性编辑、AI 生成）需要可撤销 → 需要记录每步操作的逆操作 → 事务管理器批量管理原子操作，合并为一个撤销单元。

**约束：**

- 一个事务内包含的所有 mutation 构成一个不可分割的撤销单元
- 事务可嵌套（外层事务包含子事务，commit 时统一提交）
- AI 工具协议操作也走 TransactionManager，因此 AI 修改同样可撤销
- 事务提交触发 Scene dirty flag，下一帧重新渲染

---

## 视图体系

### M3. View 继承体系与 mixin addon 模式

**✅ 已实施**

`View` 基类派生出子类（TextView/ImageView/ShapeView 等）和容器视图 `ContainerView`（CombinedView + FlexView 的共同基类）。能力通过 addon mixin 附加：BoundingBoxAddon、BoxDecorationAddon、VertexAddon、AnimationAddon、TextSelectionAddon。

**决策链：** 视图能力有正交维度（装饰 × 动画 × 选区 × 包围盒）→ 传统多层继承会组合爆炸 → mixin 模式按需附加，避免菱形继承。

**约束：**

- addon 通过 `use()` 或初始化时自动 attach
- addon 之间不允许相互依赖
- 新增能力优先考虑 addon，而非新建子类
- 流程图视图（NodeView/EdgeView/PortView）定义在 `view/FlowViews/` 目录，NodeView 继承 ContainerView

---

### M4. 布局统一挂载到 CombinedView 的 layoutMode 机制

**✅ 已实施** · 依赖 M3

禁止新增独立的布局容器 ViewType。新布局能力以新的 `layoutMode` 值 + 对应 `IXxxLayout` 配置接口挂载到 `CombinedView`。

**决策链：** 早期每种布局都是独立的 ViewType（FlexView、ScrollView、ListView…）→ 导致 ViewType 膨胀、AI 生成时决策空间过大 → 改为 CombinedView 作为统一容器 + layoutMode 枚举选择布局策略。

**约束：**

- CombinedView.layoutMode 当前支持：free / flex / scroll / list / grid
- 每个 layoutMode 对应一个 `IXxxLayout` 配置接口（如 IFlexLayout、IScrollLayout）
- AI 生成时只需决定 layoutMode 值，不需要在 ViewType 级别选择
- 已有的 FlexView 是 ContainerView 子类，历史兼容保留

**反例：**

- 每种布局一个独立 ViewType——种类膨胀，AI 难以选择，跨布局组合困难

---

## 流程执行

### M5. FlowSchema 节点图执行机制

**✅ 已实施**

FlowSchema 由 `nodes`（节点数组）和 `edges`（连线数组）构成有向图，FlowRunner 按拓扑序执行节点。每个节点有 `kind` 对应一个 `NodeExecutor`，执行结果通过 edge 传递给下游。

**决策链：** 低代码流程需要可视化编辑 → 节点图是自然的可视化表达 → 运行时需要拓扑遍历和条件分支。

**约束：**

- 每个 NodeExecutor 接收 `FlowContext`（包含 variables、trigger source、app 实例引用等）
- condition 节点基于表达式返回 true/false 决定走哪条 edge
- delay 节点通过 setTimeout 暂停执行流
- subFlow 节点可递归调用另一个 FlowSchema
- 循环检测：FlowRunner 内置 maxIterations 安全阀

---

### M6. Scene 生命周期绑定 FlowSchema

**✅ 已实施** · 依赖 M5

Scene 定义 4 个生命周期钩子：`onLoad` / `onUnload` / `onShow` / `onHide`，类型均为 `FlowSchema | null`。View 定义 3 个生命周期钩子：`onCreated` / `onAttach` / `onDestroy`。

**决策链：** 页面切换时需要执行初始化/清理逻辑（如数据加载、变量重置）→ 生命周期即为 FlowSchema 触发点 → Scene.triggerSchema 构造 FlowContext 并调用 FlowRunner.run。

**约束：**

- onLoad 在 Scene 首次激活时触发（进入页面）
- onShow/onHide 在 Scene 可见性切换时触发
- onUnload 在 Scene 销毁时触发（用于清理）
- 生命周期 FlowSchema 中可调度 client 节点（如 setData、navigate）

---

### M7. View 事件绑定 FlowSchema（13 个事件处理器）

**✅ 已实施** · 依赖 M5

View.events 是一个 map，key 为事件名（onClick / onLongPress / onDoubleClick / onChange / onFocus / onBlur / onScroll / onSwipe / onDragStart / onDragEnd / onInput / onSubmit / onSelect），value 为 `FlowSchema | null`。

**决策链：** 用户交互需要触发业务逻辑 → 把事件处理统一为 FlowSchema 执行 → 低代码编辑器可直接拖拽配置事件处理逻辑。

**约束：**

- 事件触发时 Scene.triggerSchema 自动注入 event payload 到 FlowContext.triggerData
- 编辑态（useDesignBanvas）不执行 events FlowSchema
- 运行态（useRuntimeBanvas）完整执行 events FlowSchema
- 每个事件最多绑定一个 FlowSchema（多逻辑在 FlowSchema 内部用并行/条件分支解决）
