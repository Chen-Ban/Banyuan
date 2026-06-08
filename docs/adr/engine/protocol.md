# 引擎 · 协议级决策

> 模块间怎么通信——引擎内部模块及引擎与外部系统之间的接口契约。

---

## 决策依赖图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     视图树通信（核心协议族）                                  │
│                                                                             │
│              ┌──────────────────────────────┐                               │
│              │ C1 App↔Scene↔View 通信协议    │                               │
│              └──────┬─────────┬─────────┬───┘                               │
│                     │         │         │                                    │
│            enables  │         │         │ enables                            │
│                     │         │         │                                    │
│  ┌──────────────────▼──┐  ┌──▼──────────▼──────────────┐                    │
│  │C2 事务提交协议       │  │C3 View 序列化/反序列化协议   │                    │
│  └──────────────────────┘  └─────────────┬──────────────┘                    │
│                                          │ enables                           │
│                            ┌─────────────▼──────────────┐                    │
│                            │C4 序列化类型注册协议         │                    │
│                            │  （$type/$value 包装）       │                    │
│                            └─────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     流程执行协议族                                            │
│                                                                             │
│  ┌──────────────────────────┐                                               │
│  │C5 FlowContext 构造与传递  │                                               │
│  └────────────┬─────────────┘                                               │
│               │ enables                                                      │
│  ┌────────────▼─────────────┐                                               │
│  │C6 NodeExecutor 注册协议   │                                               │
│  └────────────┬─────────────┘                                               │
│               │ enables                                                      │
│  ┌────────────▼─────────────┐                                               │
│  │C7 值解析协议（resolveValue）│                                              │
│  └──────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     渲染协议                                                 │
│  ┌──────────────────────────┐                                               │
│  │C8 Renderer 接口协议       │                                               │
│  └──────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     交互协议族                                               │
│                                                                             │
│  ┌──────────────────────────┐     ┌──────────────────────────┐              │
│  │C9 InteractionDelegate    │────▶│C10 InteractionCapability │              │
│  │   接口协议                │     │    配置协议               │              │
│  └──────────────────────────┘     └──────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     宿主集成协议族                                            │
│                                                                             │
│  ┌──────────────────────────┐     ┌──────────────────────────┐              │
│  │C11 Hook 层通信协议        │────▶│C12 外部订阅协议           │              │
│  │                           │     │  (subscribe/getVersion)  │              │
│  └──────────────────────────┘     └──────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     属性适配协议                                              │
│  ┌──────────────────────────┐                                               │
│  │C13 PropertyAdapter 协议   │                                               │
│  └──────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

关系说明：

- C1→C2/C3：App/Scene/View 通信协议是事务提交和序列化的基础
- C3→C4：View 序列化依赖类型注册协议实现多态反序列化
- C5→C6→C7：FlowContext 定义执行环境 → NodeExecutor 在此环境中执行 → resolveValue 解析节点输入值
- C9→C10：Delegate 接口定义能力需求，Capability 配置决定启用哪些能力
- C11→C12：Hook 层通信依赖外部订阅协议实现状态同步

---

## 视图树通信

### C1. App ↔ Scene ↔ View 通信协议

**✅ 已实施**

App 管理多个 Scene（页面），Scene 管理多个 View（视图树）。通信方向为树形广播 + 事件冒泡。

**决策链：** 多页面应用需要页面级隔离 → App → Scene 是页面容器 → Scene → View 是视图树管理。

**约束：**

- App.navigateTo(sceneId, options)：切换当前活动 Scene，支持导航参数传递
- Scene.addView(view) / removeView(view)：管理视图树
- 事件冒泡：View 触发事件 → 父容器 → Scene → App
- Scene 持有独立的 Camera 和 ViewTree，Scene 间互不干扰
- ViewTree 工具：flattenViewTree / clearAllStates / groupViews / ungroupView

---

### C2. TransactionManager 事务提交协议

**✅ 已实施** · 依赖 C1

外部通过 `transactionManager.begin()` → `mutations` → `transactionManager.commit()` 提交原子变更。每次 commit 产生一个 UndoUnit 入栈。

**决策链：** 多步操作需要原子性 → begin/commit 对标数据库事务语义 → undo stack 支持 Ctrl+Z 体验。

**约束：**

- begin() 和 commit() 必须配对调用
- commit() 触发 dirty flag + onChange 通知 + notify()
- undo() 弹出栈顶 UndoUnit 并执行逆操作
- redo() 将已撤销的 UndoUnit 重新应用
- 嵌套事务：内层 commit 不触发实际提交，由外层 commit 统一提交
- 瞬时操作 API：recordAdd / recordRemove / recordReorder（无需 begin/commit 包裹）

---

### C3. View 序列化/反序列化协议

**✅ 已实施** · 依赖 C1

每个 View 实现 toJSON() 导出纯 JSON 对象，通过 View.fromJSON(json) 静态方法还原。JSON 格式即为持久化格式（存入 MongoDB pages 集合）。

**决策链：** 应用数据需要持久化到 MongoDB -> View 树必须可序列化为 JSON -> fromJSON 还原时重建实例及子视图树。

**约束：**

- toJSON() 输出不含循环引用、不含函数，纯 JSON-safe 对象
- FlowSchema 字段直接序列化为 JSON 子对象（已经是纯数据）
- fromJSON() 根据 viewType 字段分发到对应子类的构造逻辑
- addon 状态不序列化（attach 时按配置重建）
- ID 保持稳定（序列化/反序列化后 view.id 不变）

---

### C4. 序列化类型注册协议（$type/$value 包装）

**✅ 已实施** · 依赖 C3

Serializer 单例通过类型注册表实现多态序列化。序列化输出使用 `$type/$value` 包装标识具体类型。

**决策链：** JSON 本身不携带类型信息 → 反序列化时需要知道应该构造哪个类的实例 → $type 字段作为类型标识符。

**约束：**

- 注册：`Serializer.register(typeName: string, constructor: Class)`
- 序列化输出：`{ $type: 'TextView', $value: { id, style, events, ... } }`
- 反序列化：读取 $type → 查注册表 → 调用对应 constructor
- 未注册类型反序列化时抛出 UnknownTypeError
- 支持嵌套序列化（View 内嵌 Graph，Graph 内嵌 Style）

---

## 流程执行协议

### C5. FlowContext 构造与传递协议

**✅ 已实施**

Scene.triggerSchema 构造 `FlowContext` 并传递给 FlowRunner.run。FlowContext 是节点执行器的唯一环境入参，携带 variables、triggerData、app 引用等。

**决策链：** 节点执行器需要访问场景状态（变量、触发源等）→ 通过统一的 Context 对象注入 → 避免节点直接访问全局状态。

**约束：**

- FlowContext.variables：当前执行作用域内的变量表
- FlowContext.triggerData：触发此流程的事件 payload（如 onClick 的 event 对象）
- FlowContext.app：App 实例引用，供节点访问 Scene/View 状态
- ServerFlowContext 额外注入 db（数据库客户端）和 httpClient（HTTP 请求能力）

---

### C6. NodeExecutor 注册协议

**✅ 已实施** · 依赖 C5

FlowRunner 通过 `registerNode(kind, executor)` 注册节点执行器。`kind` 为字符串标识，`executor` 实现 `INodeExecutor` 接口。

**决策链：** FlowSchema 的 nodes[].kind 字符串需要映射到实际的执行逻辑 → 注册表模式解耦定义与实现 → 前后端各自注册不同的执行器集合。

**约束：**

- INodeExecutor 接口：`execute(node: FlowNode, context: FlowContext): Promise<NodeResult>`
- NodeResult 包含：输出数据 + 下一步走哪条 edge（通过 outputKey）
- 重复注册同一 kind 会覆盖（最后注册者生效）
- 未注册的 kind 在执行时抛出 UnknownNodeKindError

---

### C7. 值解析协议（resolveValue）

**✅ 已实施** · 依赖 C6

FlowNode 的输入参数通过 `resolveValue()` 统一解析，支持五种值来源。

**决策链：** 节点输入可能来自字面量、数据绑定、事件参数、上游节点输出等多种来源 → 需要统一的值解析协议 → resolveValue 根据 valueType 分发解析逻辑。

**约束：**

- `literal`：直接使用字面量值
- `dataRef`：引用 View 的数据属性（通过 viewId + path）
- `pageDataRef`：引用页面级变量
- `eventArg`：引用触发事件的 payload 字段
- `nodeRef`：引用上游节点的输出值（通过 nodeId + outputKey）

---

## 渲染协议

### C8. Renderer 接口协议

**✅ 已实施**

渲染后端通过 `Renderer` 接口抽象。当前实现为 `Canvas2DRenderer`，未来可替换为 `WebGPURenderer`。

**决策链：** 渲染后端可能切换 → 需要一层抽象接口 → 上层代码面向接口编程。

**约束：**

- Renderer 暴露：`clear()` / `drawRect()` / `drawPath()` / `drawText()` / `drawImage()` / `flush()`
- View 的 `render(renderer: Renderer)` 方法接收 Renderer 接口
- Renderer 负责 DPR 缩放和剪裁区域管理
- 帧循环由 Scene 管理（requestAnimationFrame），Renderer 不主动触发帧
- CanvasContext 封装底层 Canvas 2D API，提供类型安全的绘制方法

---

## 交互协议

### C9. InteractionDelegate 接口协议

**✅ 已实施**

InteractionStateMachine 通过 `InteractionDelegate` 接口声明所有外部能力需求。宿主实现此接口并注入状态机。

**决策链：** 状态机需要操作 View/Scene（如移动、缩放、选中）→ 但不应直接持有引用 → Delegate 接口定义能力契约。

**约束：**

- Delegate 方法包括：getSelectedViews / setSelection / moveViews / resizeView / rotateView / beginTransaction / commitTransaction 等
- 状态机只调用 delegate 方法，不直接操作 View/Scene/TransactionManager
- 不同模式（编辑/预览）注入不同 delegate 实现
- 测试时注入 mock delegate 即可验证状态机逻辑

---

### C10. InteractionCapability 配置协议

**✅ 已实施** · 依赖 C9

通过 `InteractionCapability` 集合配置状态机启用的交互能力，不同运行态配置不同能力集。

**决策链：** 编辑态需要全部交互能力，预览态只需要 pan → 能力应该可配置而非硬编码 → 集合模式灵活组合。

**约束：**

- 能力枚举：pan / move / resize / rotate / connect / box-select / text-selection / edit-point / drop
- 编辑态：全部启用
- 预览态/线上态：仅启用 pan（或全部禁用）
- 能力集可在运行时动态修改（如进入文本编辑模式时启用 text-selection）

---

## 宿主集成协议

### C11. 引擎 ↔ 宿主 Hook 层通信协议

**✅ 已实施**

React hook 通过 `useRef` 持有 App 实例，通过 `useEffect` 管理生命周期。hook 向引擎传递 Canvas DOM 元素和配置，引擎通过回调通知宿主状态变化。

**决策链：** 引擎不依赖 React，但需要与 React 宿主协同 → hook 是 React 端的集成层 → 通过 ref 持有实例避免重复创建。

**约束：**

- useCanvasInit 返回：`{ actions, elements: { container }, derived: { revision, selectedViewId, currentPageId, selectedViewPos, canvas, inputElement } }`
- useCanvasCamera：仅自适应模式启用，通过 `syncCameraToContainer(width, height, dpr)` 同步相机边界
- hook unmount 时调用 App.destroy() 清理资源
- hook 之间通过 React Context 共享 App 实例

---

### C12. 外部订阅协议（subscribe/getVersion/notify）

**✅ 已实施** · 依赖 C11

App 实现 React 18+ useSyncExternalStore 所需的三件套接口，作为引擎状态变化的通知通道。

**决策链：** React 需要知道引擎状态何时变化 → useSyncExternalStore 是 React 18+ 推荐模式 → App 实现其协议。

**约束：**

- `app.subscribe(callback)`：注册订阅者，返回 unsubscribe 函数
- `app.getVersion()`：返回当前版本号（单调递增整数）
- `app.notify()`：递增版本号，触发所有订阅者回调
- actions 层每次修改引擎状态后必须调用 notify()
- React 通过版本号比较决定是否重渲染（避免不必要的 re-render）

---

## 属性适配协议

### C13. PropertyAdapter 属性面板适配协议

**✅ 已实施**

PropertyAdapter 系统为属性面板提供统一的属性读写接口，支持多选时的冲突检测（ConflictGroup）。

**决策链：** 属性面板需要读写不同 ViewType 的属性 → 各 ViewType 属性结构不同 → 需要统一适配层 → PropertyAdapter 抹平差异。

**约束：**

- PropertyDescriptor：描述一个可编辑属性（name / type / getter / setter / validator）
- PropertyAdapter：将 View 实例的属性映射为 PropertyDescriptor 数组
- ConflictGroup：多选时检测属性值冲突（值相同显示值，值不同显示"混合"）
- sizeAdapters / spatialAdapters：预置的尺寸和空间属性适配器
- 属性面板通过 adapter 读写，不直接操作 View 属性（遵循单向数据流）
