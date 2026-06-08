# 引擎 · 协议级决策

> 模块间怎么通信——引擎内部模块及引擎与外部系统之间的接口契约。

---

## FlowContext 构造与传递协议

**✅ 已实施**

Scene.triggerSchema 构造 `FlowContext` 并传递给 FlowRunner.run。FlowContext 是节点执行器的唯一环境入参，携带 variables、triggerData、app 引用等。

**决策链：** 节点执行器需要访问场景状态（变量、触发源等）→ 通过统一的 Context 对象注入 → 避免节点直接访问全局状态。

**约束：**

- FlowContext.variables：当前执行作用域内的变量表
- FlowContext.triggerData：触发此流程的事件 payload（如 onClick 的 event 对象）
- FlowContext.app：App 实例引用，供节点访问 Scene/View 状态
- ServerFlowContext 额外注入 db（数据库客户端）和 httpClient（HTTP 请求能力）

---

## Renderer 接口协议

**✅ 已实施**

渲染后端通过 `Renderer` 接口抽象。当前实现为 `Canvas2DRenderer`，未来可替换为 `WebGPURenderer`。

**决策链：** 渲染后端可能切换 → 需要一层抽象接口 → 上层代码面向接口编程。

**约束：**

- Renderer 暴露：`clear()` / `drawRect()` / `drawPath()` / `drawText()` / `drawImage()` / `flush()`
- View 的 `render(renderer: Renderer)` 方法接收 Renderer 接口
- Renderer 负责 DPR 缩放和剪裁区域管理
- 帧循环由 Scene 管理（requestAnimationFrame），Renderer 不主动触发帧

---

## App ↔ Scene ↔ View 通信协议

**✅ 已实施**

App 管理多个 Scene（页面），Scene 管理多个 View（视图树）。通信方向为树形广播 + 事件冒泡。

**决策链：** 多页面应用需要页面级隔离 → App → Scene 是页面容器 → Scene → View 是视图树管理。

**约束：**

- App.navigateTo(sceneId)：切换当前活动 Scene
- Scene.addView(view) / removeView(view)：管理视图树
- 事件冒泡：View 触发事件 → 父容器 → Scene → App
- Scene 持有独立的 Camera 和 ViewTree，Scene 间互不干扰

---

## TransactionManager 事务提交协议

**✅ 已实施**

外部通过 `transactionManager.begin()` → `mutations` → `transactionManager.commit()` 提交原子变更。每次 commit 产生一个 UndoUnit 入栈。

**决策链：** 多步操作需要原子性 → begin/commit 对标数据库事务语义 → undo stack 支持 Ctrl+Z 体验。

**约束：**

- begin() 和 commit() 必须配对调用
- commit() 触发 dirty flag + onChange 通知
- undo() 弹出栈顶 UndoUnit 并执行逆操作
- redo() 将已撤销的 UndoUnit 重新应用
- 嵌套事务：内层 commit 不触发实际提交，由外层 commit 统一提交

---

## NodeExecutor 注册协议

**✅ 已实施**

FlowRunner 通过 `registerNode(kind, executor)` 注册节点执行器。`kind` 为字符串标识，`executor` 实现 `INodeExecutor` 接口。

**决策链：** FlowSchema 的 nodes[].kind 字符串需要映射到实际的执行逻辑 → 注册表模式解耦定义与实现 → 前后端各自注册不同的执行器集合。

**约束：**

- INodeExecutor 接口：`execute(node: FlowNode, context: FlowContext): Promise<NodeResult>`
- NodeResult 包含：输出数据 + 下一步走哪条 edge（通过 outputKey）
- 重复注册同一 kind 会覆盖（最后注册者生效）
- 未注册的 kind 在执行时抛出 UnknownNodeKindError

---

## 引擎 ↔ 宿主 Hook 层通信协议

**✅ 已实施**

React hook 通过 `useRef` 持有 App 实例，通过 `useEffect` 管理生命周期。hook 向引擎传递 Canvas DOM 元素和配置，引擎通过回调通知宿主状态变化。

**决策链：** 引擎不依赖 React，但需要与 React 宿主协同 → hook 是 React 端的集成层 → 通过 ref 持有实例避免重复创建。

**约束：**

- useCanvasInit：创建 App + Renderer + Camera，绑定 Canvas DOM 元素
- useDesignBanvas：在 useCanvasInit 基础上，注册编辑交互（选中/拖拽/键盘快捷键）
- useRuntimeBanvas：在 useCanvasInit 基础上，启用 FlowRunner 执行
- hook unmount 时调用 App.destroy() 清理资源
- hook 之间通过 React Context 共享 App 实例（如属性面板需要读取选中 View）

---

## View 序列化/反序列化协议

**✅ 已实施**

每个 View 实现 toJSON() 导出纯 JSON 对象，通过 View.fromJSON(json) 静态方法还原。JSON 格式即为持久化格式（存入 MongoDB pages 集合）。

**决策链：** 应用数据需要持久化到 MongoDB -> View 树必须可序列化为 JSON -> fromJSON 还原时重建实例及子视图树。

**约束：**

- toJSON() 输出不含循环引用、不含函数，纯 JSON-safe 对象
- FlowSchema 字段直接序列化为 JSON 子对象（已经是纯数据）
- fromJSON() 根据 viewType 字段分发到对应子类的构造逻辑
- addon 状态不序列化（attach 时按配置重建）
- ID 保持稳定（序列化/反序列化后 view.id 不变）