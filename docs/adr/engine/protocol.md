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
│              ┌──────────────────────────────────────┐                         │
│              │C15 FlowSchema 图结构契约              │  refines架构A5          │
│              │  （节点分类 + 统一边 + SESE + 插槽混合）│                         │
│              └──┬──────────────┬──────────────────┬──┘                         │
│   refines（语句层 │   defines（图形状）│   refines（源节点取值面）              │
│   两分+全集+错误）│                │              ┌─▼──────────────────────┐     │
│  ┌──────────────▼───────────┐    │              │C16 挂载点 ⇒ 上下文契约  │     │
│  │C17 语句层节点契约          │    │              │ （资源来向in/state/cap）│     │
│  │ （控制流/动作两分·节点全集·│    │              └─────────┬───────────────┘     │
│  │  condition判据沿入边求值·  │    │                        │ defines（context形状） │
│  │  错误经onError子图兜底）    │    └──────┐    ┌────────────▼─────────────┐       │
│  └────────────────────────────┘           └───▶│C5 FlowContext 构造与传递  │       │
│                                                 └────────────┬─────────────┘       │
│                                                              │ enables             │
│                                                 ┌────────────▼─────────────┐       │
│                                                 │C6 NodeExecutor 注册协议   │       │
│                                                 └────────────┬─────────────┘       │
│                                                              │ enables             │
│                                                 ┌────────────▼─────────────┐       │
│                                                 │C7 值解析协议（resolveValue）│      │
│                                                 └──────────────────────────┘       │
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

- **C9/C10（交互协议族）refines engine:A0**——InteractionDelegate 是 banvasgl 暴露的**机制接口**，InteractionCapability 取值是上层注入的**策略**，这组协议是 A0 机制/策略分离契约在协议层的落地
- C1→C2/C3：App/Scene/View 通信协议是事务提交和序列化的基础
- C3→C4：View 序列化依赖类型注册协议实现多态反序列化
- **C15 refines architecture:A5**——A5 定义 FlowSchema「是什么」（有向图形态的过程式 AST + Push-Pull 调度），C15 定义这张图「长什么样」（node 分类 / ControlEdge+DataEdge 二分边 / 顶层开放 DAG + 可调用子图 / 参数插槽混合模型）；C15 是流程执行协议族（C5/C6/C7）的**结构基础**，执行环境、执行器、值解析都消费 C15 固化的图形状
- **C16 refines protocol:C15**——C15 把值节点的取值源收敛为「按 `path` 从注入上下文取值」却留下「上下文长什么样」的指针；C16 补齐这一面：用单一维度**资源来向**把上下文封闭三分为 `in / state / cap`，并约定每个**挂载点**（View.events / View.lifetimes / Scene 生命周期 / 云函数入口）静态推导出的 context 形状。C16 既 defines C5 执行环境消费的 context 形状，也界定值节点可见的只读子集 `{in, state}`（cap 仅副作用节点执行器可见）
- **C17 refines protocol:C15**——C15 固化了图的「形状」（节点分类、ControlEdge+DataEdge 二分边、参数插槽混合），C17 在其上固化**语句层节点的语义**：以「会不会产生副作用」为唯一判据，把语句层节点显式两分为**控制流节点**（只改变「往哪走/怎么组织」，无副作用）与**动作节点**（产生副作用），并给出目标态的**节点全集**；同时把 `condition` 的判据外置为沿入边求值的 boolean（消除内联 condition 字段）、新增 `while`、把错误处理收进节点内嵌的 `onError` 子图（子图入口即 handler，作为块级子作用域、其 `in` 静态叠 `error` 字段——见 C16 约束四）、废除 `transform`/`script`/`setData`/`setVisible` 四个节点。C17 与 C16 正交——C16 管「数据从哪来」，C17 管「语句怎么走、谁有副作用」
- C5→C6→C7：FlowContext 定义执行环境 → NodeExecutor 在此环境中执行 → resolveValue 解析节点输入值
- C9→C10：Delegate 接口定义能力需求（机制），Capability 配置决定启用哪些能力（策略）
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
- NodeResult 包含：输出数据 + 多出口节点（如 condition）走哪条出边（通过 `branch` 匹配出边的 `branch` 字段；单出口节点沿唯一出边走，无需指定）
- 重复注册同一 kind 会覆盖（最后注册者生效）
- 未注册的 kind 在执行时抛出 UnknownNodeKindError

---

### C7. 值解析协议（resolveValue）

**✅ 已实施** · 依赖 C6 · refines protocol:C15

FlowNode 的输入参数通过 `resolveValue()` 统一解析。**当前 `1.0.0` 实现**按 `valueType` 分发五种值来源；**C15 落地后（`2.0.0`）值来源收敛为「源节点 + 计算节点 + 插槽连边」三条路径**，下表给出当前态与目标态的对照。

**决策链：** 节点输入可能来自字面量、上下文取值、上游节点输出等多种来源 → 需要统一的值解析协议 → 值由三种路径获取：源节点直接出值、计算节点对输入求值后产出、插槽内联默认字面量。引用类来源统一为「按 path 从单一注入上下文对象取值」。Pull 调度下，resolveSlot 沿数据边反向递归完成求值。

**约束：**

- `literal`（直接使用字面量值）⇒ **源节点 `from:'literal'`**：单一 `value` 字段承载任意 JSON 值，或作为插槽内联默认
- `dataRef`（引用 View 数据属性，viewId + path）⇒ **源节点 `from:'context'`**，path 形如 `state.view.<id>.<...>`（视图级状态，C16 约束一）
- `pageDataRef`（引用页面级变量）⇒ **源节点 `from:'context'`**，path 形如 `state.page.<...>`（页面级状态）
- `eventArg`（引用事件 payload 字段）⇒ **源节点 `from:'context'`**，path 形如 `in.<...>`（入参，C16 约束二中由挂载点提供）
- `nodeRef`（引用上游节点输出，nodeId + outputKey）⇒ **一条边**（`from` 为上游节点、`fromPort` 定位哪个输出、`toPort` 定位本插槽）：求值依赖显式化为边，而非内联引用；上游可以是源节点或计算节点

**目标态求值规则：** 解析一个插槽时——若有一条边（`toPort` 指向该插槽）连入，递归求值上游节点（源节点直接产值、计算节点对输入求值后经 `fromPort` 产值），否则取插槽内联 JSON 字面量默认（`FlowSlot = unknown`；旧 `FlowValue` 5-kind 别名已随 C17 废除）；其中 `from:'context'` 的求值 = 从挂载位置注入的上下文对象按 `path` 取值，`path` 首段限定为 `in` / `state`（值节点只见只读子集 `{in, state}`，不可见 `cap`）。上下文的三分形状（`in / state / cap`）与各挂载点的静态推导见 protocol:C16。

---

### C15. FlowSchema 图结构契约（节点分类 + 二分边 + 插槽混合模型）

**🔜 待实施** · refines architecture:A5 · 流程执行协议族的结构基础

A5 确立了 FlowSchema「是有向图形态的过程式 AST」这一本质，本协议固化这张图的**具体形状契约**：节点如何分类、控制边和数据边各自承担什么职责、节点参数如何承载取值。外壳层、执行器（C6）、值解析（C7）、序列化都以本契约为准。

**图结构：顶层开放 DAG，子图为可调用闭包。** Blender GN 强制 SESE——适合纯数据流图，但对事件驱动的过程式程序过于约束。Houdini VOP 顶层完全开放，用 Block Begin/End 标记局部控制流——额外引入了标记节点复杂度。Banyuan 取两者之间：顶层开放 DAG（出度 0 即结束，汇合可选），子图是可调用闭包（显式 subEntry/subExit 定义参数注入和产出收集）。

**决策链：** A5 定义 FlowSchema 是过程式 AST → 三个设计问题：值节点收敛、边要不要区分控制/数据、参数取值模型 → 值节点收敛为 source + compute 两亚种 → 边显式拆分为 ControlEdge 和 DataEdge（Blueprints exec+data 是业界唯一大规模验证的混合图方案）→ 参数用插槽混合模型（内联默认 + 数据边覆盖）。

**约束一 · 节点分四类，值节点收敛为 source + compute：**

- **source**：纯数据源，`from: 'literal'` 或 `from: 'context'`。输出端口名为 `"value"`。
- **compute**：纯变换（math/compare/logic/concat/format/get），可级联。输出端口名为 `"value"`。
- **action**：有副作用，可暴露多个命名输出端口（如 dbQuery 的 `"rows"` 和 `"count"`）。
- **control**：选路（condition/while/forEach/parallel/subFlow）。

**约束二 · 边分两种：ControlEdge + DataEdge：**

```ts
interface FlowControlEdge {
  id: string;
  from: string;       // 源节点 ID
  to: string;         // 目标节点 ID
  branch?: string;    // condition 分支标签（匹配 case.label 或 "default"）
}

interface FlowDataEdge {
  id: string;
  fromNode: string;   // 源节点 ID
  fromPort: string;   // 源节点的输出端口名
  toNode: string;     // 目标节点 ID
  toSlot: string;     // 目标节点的输入插槽名
}
```

**分工：**
- ControlEdge 串起整个流程的执行顺序，不携带业务数据。Push 沿它遍历，编辑时校验有向无环。
- DataEdge 连接输出端口到输入插槽，承载值依赖。Pull 沿它反向递归求值，编辑时校验 forward-reference（fromNode 在控制序上先于 toNode）。
- 同一对节点可同时有 ControlEdge 和 DataEdge（如 dbQuery ─Control→ condition，dbQuery.result ─Data→ condition.caseSlot）。这是 Blueprints exec+data 双线的标准模式。

**为什么不用统一一种边：** 旧 SESE 架构下"拓扑即顺序"使统一边成为可能——一条边同时表达执行顺序和值依赖。Push-Pull + 开放 DAG 下控制边和数据边的职责、调度行为、校验规则都不相同，隐式靠字段推断（有无 fromPort/toPort）增加运行时代码和外壳渲染层的歧义。显式二分消除这种歧义——类型即语义。

**约束三 · 参数采用插槽混合模型（Blender 式 socket 默认字面量 + 数据边覆盖，互斥）：**

- 插槽默认内联 JSON 字面量（`FlowSlot = unknown`）。
- 有 DataEdge（toSlot 指向该插槽）连入时，边获胜——忽略内联值，Pull 该数据边。
- 内联与连边互斥。内联用于简单默认，连边用于复用/计算/动态。

**约束四 · 节点不携带空间坐标：** `FlowNode` 不含 `x`/`y`。画布摆放归外壳层。

**反例：**

- 用统一一种边——控制流和数据流职责不同，隐式推断增加歧义。
- 在顶层图强制 SESE——出度 0 即自然结束。
- 参数允许内联值与数据边并存。
- 把计算能力塞进参数的内联表达式字符串。
- 给 source/compute 节点赋予副作用。

**承接契约：** source `from:'context'` 依赖 **C16（挂载点 ⇒ 上下文契约）**。

**实施方案：** [FlowSchema 图结构契约](../../specs/engine/flow-graph-structure.md)

### C16. 挂载点 ⇒ 上下文契约（资源来向三分 · 挂载点描述符）

**🔜 目标态（随 2.0.0 落地）** · refines protocol:C15 · 依赖 C5

C15 把值节点的取值源收敛为「按 `path` 从注入上下文取值」，但**上下文长什么样**留作指针。C16 补齐这一面：**用单一维度——「资源来向」——把上下文封闭三分为 `in / state / cap`**，前后端差异、作用域层次差异全部被这一个维度吸收，新域进来不再重划顶层。

> **设计语境（为什么是「资源来向」这一个维度）：** 上下文字段曾受多个维度叠加干扰——前后端能力域（前端 navigate / 后端 db）、域内作用域层次（view / page / app / flow）、入口数据（事件参数 / navigate params）。把它们拍平成同级字段会得到一个「拼凑」出来的信封，且每来一个新域就得在顶层硬塞字段。C16 的解法是退回到解释器运行时环境的本质：流程求值时向外界索取的东西，按**来向**只有三类——一次性带入的**入参**、可读写的分层**状态**、发起副作用的**能力句柄**。这三类正交且封闭，前后端差异被自动收拢进「能力」一类，作用域层次降级为「状态」的子维度。

**决策链：** C15 需要一份上下文契约 → 直接列字段会混入多个维度且不可扩展 → 提炼单一维度「资源来向」→ 顶层封闭三分 `in / state / cap`（入参 / 状态 / 能力）→ 作用域层次降为 `state` 子维度、前后端差异收进 `cap` → 每个挂载点的 context 形状由「挂载点描述符」静态声明 → 值节点作为纯函数只被授予只读子集 `{in, state}`。

**约束一（资源来向三分，顶层封闭）：** 上下文顶层有且仅有三个字段，对应三类资源来向：

| 顶层 | 来向 | 解释器类比 | 可变性 | 内部结构 |
| --- | --- | --- | --- | --- |
| `in` | 触发流程时一次性带入 | 入口函数 argv | 只读 | 由挂载点决定（事件对象 / navigate params / 云函数 args） |
| `state` | 跨节点可读写的分层状态 | 环境 / 变量绑定表 | 可读写 | 按**作用域层次**再分（`view` / `page` / `app` / `flow`） |
| `cap` | 向外界发起副作用的句柄 | 系统调用 / 标准库 | 句柄不可变 | 前后端各注入一套（前端 navigate / 持久化；后端 db / httpClient） |

- 三类正交且封闭：新增「一类新数据来源」（如定时器触发）归入 `in`、新增「一类新能力」（如 WebSocket / 文件系统）归入 `cap`，**顶层永远是 `in / state / cap` 三个，不再扩张**。
- 作用域层次（view/page/app/flow）不占顶层，而是 `state` 的子维度：`state.page.<key>` / `state.view.<key>` / `state.flow.<key>`。这收编了既有 scope 模型（前端 `'self'`→`view`、`'page'`→`page`；后端 `'local'/'flow'`→`flow`）。
- `state` 是三类中**唯一可读写**的（`in` 只读、`cap` 句柄不可变）；写入它的**唯一动作节点**是 `setVariable`（见 protocol:C17 约束五）。这里的「可变」指 `state` 子树里的**值**可改，而 context 信封的**形状**（顶层永远 `in/state/cap` 三分）始终不可变。注意「形状不可变」约束的单位是**单个作用域帧**而非整条流程——子作用域（forEach/while body、subFlow、错误 handler）会压入**新的一帧**，但每一帧进入时其顶层依然且永远是 `in/state/cap` 三分、字段在编排期静态定死、运行期不增减（见约束四）。

**约束二（挂载点描述符，静态推导 context 形状）：** 每个 FlowSchema 挂载位置由一份**挂载点描述符**声明三件事——`in` 提供什么、`state` 开放到哪几层、`cap` 注入哪一套。四类挂载点形状统一（顶层都是 `in/state/cap`），差异仅由描述符表达：

| 挂载点 | `in` | `state` 可达层次 | `cap` 能力集 |
| --- | --- | --- | --- |
| `View.events.*`（onClick 等 13 个） | 事件对象（坐标等） | view / page / app | 前端：navigate / 持久化 / markDirty |
| `View.lifetimes.*`（onCreated/onAttach/onDestroy） | 空 | view / page / app | 前端能力集 |
| `Scene.lifetimes.*`（onLoad/onUnload/onShow/onHide） | onLoad：navigate params；其余空 | page / app | 前端能力集 |
| 云函数入口 | 调用 args | flow（单次执行局部变量） | 后端：db / httpClient |

- context 不是「一份定义的两副面孔」，而是**两个不同结构的协议**：编排期是**词法环境**（静态嵌套树，只有名字+类型、无值，供 path 合法性校验与 AI 推导可用字段），运行期是 **context 栈**（帧链，装实际值）——见约束四。挂载点描述符静态推导的是**根作用域**那一帧的形状。
- 云函数无 page/view（无页面无视图），`state` 仅 `flow` 一层；数据库不是上下文来源而是 `cap.db` 能力——查询结果是某个副作用节点的输出，经边流转，不进 context 信封。

**约束三（值节点 context 是 FlowSchema context 的只读子集）：** context 是 **FlowSchema** 在编排期与运行期的属性，不是值节点的属性。值节点（C15 源节点 / 计算节点）是纯函数，求值时仅被授予一个**只读子集**：

```
值节点可见 context = { in, state }  ⊂  FlowSchema.context = { in, state, cap }
```

- `cap` 被裁掉——这不是「path 语法上禁写 cap」，而是值节点所处的 context 子集里**根本没有 cap 这一维**。能力是调用句柄而非可读值，只对**副作用节点执行器**可见。
- 由此形成**能力梯度**：数据流图里越靠近副作用处，可见 context 越大（副作用节点见 `{in,state,cap}`，值节点只见 `{in,state}`）。
- **推论（外部数据须先经节点产出）：** 想把数据库 / HTTP 结果当值用，必须先经一个副作用节点（其执行器用 `cap.db`）产出，再由一条边喂给下游值节点——值节点永远不能直接「读」一次外部调用。
- 源节点 `from:'context'; path` 的 `path` 首段即 `in` / `state` 二选一（`cap` 对值节点不可见）：`in.<...>` 取入参、`state.<层次>.<key>` 取分层状态。

**约束四（作用域链：编排期词法环境 vs 运行期 context 栈）：** 一张 FlowSchema 不是「一个挂载点一个 context 用到底」，而是一棵**作用域树**。约束一～三描述的是**单个作用域帧**的形状，本约束补齐**多帧如何嵌套与查找**——这是 forEach/while 循环变量、subFlow 局部入参、错误 handler 的 error 得以存在、又不破坏「信封形状不可变」的前提。

- **两个结构彻底分家**：编排期是**词法环境**（静态嵌套树，与子图嵌套同构，只记「在某位置能看见哪些名字+类型」，无值，供 path 校验与 AI 提示），运行期是 **context 栈**（帧链，每帧装 `in/state/cap` 的实际值）。**编排期一份词法结构，运行期 N 个帧**——一个 forEach body 画布上只画一次（一个词法作用域），运行时循环 N 轮就压 N 帧。二者不再是「同一份 context 的两副面孔」。

- **只有引入新名字的节点开新作用域帧**，共三种（其余节点——含 `condition` 及其选中的后续流程——都沿用所在帧，不开新帧）：

| 开帧节点 | 作用域类型 | 查找规则 | 新帧 `in` | 新帧 `state` |
| --- | --- | --- | --- | --- |
| 挂载点（事件 / 生命周期 / 云函数入口） | 根作用域 | — | 挂载点描述符（约束二） | 描述符开放的层次 |
| `forEach` / `while` 的循环体（内嵌的 SESE `body` 子图） | 块级作用域 | **穿透**（沿帧链向上读外层，同名就近遮蔽） | forEach：`{ <itemVar>, <indexVar> }`（节点可配字段名，默认 `item`/`index`）；while：`{}` | 透传外层（view/page/app/flow 同一份引用） |
| 节点 `onError` 子图（错误 handler 子图入口） | 块级作用域 | **穿透** | 在外层基础上叠 `{ error }` | 透传外层 |
| `subFlow` | 函数作用域 | **隔离**（不穿透，读不到任何外层名字） | subFlow 定义声明的形参（inputs 契约） | 仅 `flow` 一层（与云函数入口同构） |

- **块 vs 函数二分（对标高级语言）**：`forEach`/`while` body 与错误 handler 是**块级作用域**，词法上嵌在母流程里，沿帧链**穿透**读外层（读 `state.page.x` 时向上找到持有真实 state 的帧；因 state 共享实即同一份），同名时内层遮蔽——故 forEach 的 `itemVar`/`indexVar` 可配，嵌套循环时改名避免遮蔽。`subFlow` 是**函数作用域**，**隔离**且必须**闭合（无自由变量）**：它要进物料市场被任意业务方复用（类比 React Hook 的可移植性），绝不能隐式依赖调用方的外层变量——只能读自己的 `in`（形参）与 `state.flow`，外部值一律经 inputs 显式传入、结果经 outputs 显式传出（见 spec 的 subFlow 闭合契约）。

- **形状不可变在每一帧内严格成立**：每个子帧进入时其 `in` 由「开帧节点」静态声明（forEach→`{item,index}`、subFlow→形参、handler→外层叠 `{error}`），编排期即定死、运行期只读不增减。变化的是**整帧的压入/弹出**，没有任何一帧被运行期改过形状——约束一的「信封形状不可变」由此与循环/子流程/错误处理自洽。

**反例（不符合本契约）：**

- 把事件对象 / navigate params / db 等当作平级顶层字段直接列进 context——这是多维度拍平的「拼凑信封」，新域进来必然重划，违背约束一的单一维度封闭性。
- 让值节点能按 `path` 读到 `cap`（如 `cap.db`）当数据——能力是句柄非值，违背约束三的能力梯度。
- 为「跨页面共享状态」扩大默认 scope（把 page 提成全局）——应走 `state.app` 或 navigate params / 后端 API，避免破坏页面隔离（沿用 C5 页面级 scope 设计初衷）。
- 把 forEach 的 item / subFlow 的形参 / handler 的 error **塞进母帧的 `in`**（运行期给某一帧加字段）——违背约束一「单帧形状不可变」；正确做法是压**新的一帧**，新字段是该子帧静态声明的 `in`（约束四）。
- 让 `subFlow` 沿帧链读外层 `state.view/page/app` 或外层循环变量——破坏 subFlow 的闭合性（函数作用域隔离），使其无法进物料市场被复用；外部值必须经 inputs 显式传入（约束四）。

**实施方案：** [FlowSchema 图结构契约 — 类型重构/迁移/外壳适配](../../specs/engine/flow-graph-structure.md)

---

### C17. 语句层节点契约（控制流/动作两分 · 节点全集 · 错误消费）

**🔜 目标态（随 2.0.0 落地）** · refines protocol:C15 · 依赖 C5

C15 固化了图的**形状**（节点怎么分类、边只有一种且拓扑即顺序、参数怎么承载），C16 固化了**数据从哪来**（上下文资源来向三分）。C17 固化最后一面——**语句层节点的语义**：语句层（A5 中的「动作节点」一侧，即非值节点）究竟有哪些节点、各自是什么语义、彼此如何分型。本契约以一条判据贯穿，给出目标态节点全集，并清掉历史冗余。

> **设计语境（为什么要在 C15 之上再立语句层契约）：** C15 把节点粗分为「值节点 / 动作节点」，但「动作节点」这一侧其实混着两种语义完全不同的东西——一种只改变「执行往哪走、怎么组织」（如 if/while/forEach），它本身**不碰外部世界**；另一种真正**产生副作用**（如改状态、发请求、写库、跳页）。把它们笼统叫「动作节点」会导致：控制流节点被误以为有副作用、错误处理边界不清、节点全集既有缺口（缺 while、缺多分支）又有冗余（transform↔script↔计算节点、setData↔setVariable、callFlow↔subFlow 职责重叠）。C17 退回到「解释器的语句分类」本质重新切分。

**决策链：** A5 把语句层笼统称「动作节点」→ 实际混着控制流与副作用两种语义 → 取唯一判据「会不会产生副作用」把语句层显式两分（控制流 / 动作）→ 据此重整节点全集：补缺口（新增 `while`、`condition` 升级多分支）、清冗余（废 `transform`/`script`/`setData`/`setVisible`）、正归属（`callFlow`=动作、`subFlow`=控制流）→ 条件判据外置为沿入边求值的 boolean（去内联 condition 字段，与 C15 插槽模型一致）→ 错误处理双维度（执行器内 try-catch 兜底机制 + 节点内嵌 `onError` 子图消费语句层）→ 再把 C15 的值节点（源 / 计算）一并纳入同一 `category` 判别，全节点收敛为**四分**（control / action / source / compute）。

**约束一（节点全集四分，顶层判据字段 `category`）：** 语句层节点先以「执行它**会不会改变外部世界**（状态、页面、网络、数据库）」为判据两分为控制流 / 动作；再叠加 C15 值节点（源 / 计算），全节点统一由顶层 `category: 'control' | 'action' | 'source' | 'compute'` 判别。语句层两分如下：

| 类别 | 判据 | 它改变什么 | 副作用 |
| --- | --- | --- | --- |
| **控制流节点** | 只决定「往哪走 / 怎么组织执行」 | 仅改变控制流走向与节点编排 | **无** |
| **动作节点** | 真正作用于外部世界 | 改 `state` / 跳页 / 发请求 / 读写库 | **有** |

- 控制流节点是「纯」的（对外部世界无副作用），只读取输入（含 boolean 判据）后决定走哪条出边（多出口按 `branch` 选边）、或如何组织内嵌子图的执行。
- 动作节点是副作用的唯一载体，且其执行器是唯一能看到 `cap`（能力句柄，C16 约束三）的地方。

**节点全集是四分，不是两分——`category: 'control' | 'action' | 'source' | 'compute'`：** 上面的「副作用两分」只切分了**沿控制路径被推进执行**的节点；C15 的值节点（源节点 / 计算节点）压根不在控制路径上，而是经带 `toPort` 的边**被引用时才拉取求值**，它们既不是 control 也不是 action。所以统一的顶层判别是**四类**，由两个正交维度叠出：

| 维度一：在不在控制路径上 | 维度二：子判据 | category | 节点 | 求值/执行模型 |
| --- | --- | --- | --- | --- |
| 在控制路径上（推进式） | 无副作用 | `control` | condition/while/forEach/parallel/subFlow | 被调度递进，决定走哪条出边/下钻哪张子图 |
| 在控制路径上（推进式） | **有副作用** | `action` | setVariable/navigate/callFlow/httpRequest/dbXxx(4) | 轮到它就执行副作用、产出数据 |
| 不在控制路径上（拉取式） | **无输入**（叶子源） | `source` | SourceNode（literal/context） | 被引用时直接出值，不递归上游 |
| 不在控制路径上（拉取式） | **有输入**（变换） | `compute` | math/concat/format/compare/logic | 被引用时先递归求上游输入、再变换出值 |

- 一句话：`control`=选路、`action`=干活（副作用）、`source`=出值（叶子）、`compute`=算值（变换）。
- control/action 之间切「有无副作用」（本约束开头的两分判据）；source/compute 之间切「有无输入」（叶子源 vs 纯变换）。control/action 与 source/compute 之间切「在不在控制路径上」（推进式执行 vs 拉取式求值）。
- 这与 C15「值节点收敛为源+计算两亚种」、C16「`cap` 只对 action 执行器可见」一致：四分只是把 C15（值节点）与 C17（语句层节点）各自的分类合并进同一个 `category` 判别字段，不改各自语义。

**约束二（目标态节点全集）：** 语句层（control + action）目标态节点全集如下（值节点 source/compute 见 C15，按上面四分同属 `FlowNode`）：

*控制流节点（5 个，无副作用）：*

| 节点 | 语义 | 关键点 |
| --- | --- | --- |
| `condition` | 多分支选择（if/switch 的统一形态） | 见约束三：判据沿入边求值为 boolean，按 `branch` 选出边，`cases[] + default` |
| `while` | 条件循环 | 每轮重新求值 boolean 判据；循环体是内嵌的 SESE `body` 子图（循环边界封在子图内，主链路上无回环边）；带 `MAX_STEPS` 安全阀防死循环 |
| `forEach` | 集合遍历 | 遍历 `collection`，逐项下钻内嵌的 SESE `body` 子图执行循环体、遍历完走出边（循环体是节点内嵌子图，非主图拓扑圈定） |
| `parallel` | 并行编排 | 多分支并发 + join 汇聚 |
| `subFlow` | 可复用流程片段 | **控制流集合**——把一段流程组织为可复用单元，进物料系统共享；输出由子图内输出端口标记为 output 的节点产出（纯数据流，无 return） |

> 无 `delay`：“延时”不是顶层 DAG AST 的真实需求——时间流逝是宿主运行时能力（同 setTimeout/sleep），不是可被用户编排的控制流原语（不选择/不循环/不并发/不复用），详见约束九。

*动作节点（8 个，有副作用）：*

| 节点 | 语义 | 副作用面 | 端 |
| --- | --- | --- | --- |
| `setVariable` | 写分层状态 | 唯一写 `state.*` 的节点（见约束五） | 前后端 |
| `navigate` | 页面跳转 | 改页面栈（跨页面，state 表达不了） | 前端 |
| `callFlow` | 调用本业务后端云函数 | **网络调用即副作用** | 前端唯一对外口 |
| `httpRequest` | 发起 HTTP 请求 | 网络 I/O | 后端 |
| `dbQuery` | 查询数据库 | 库 I/O（结果经边流转） | 后端 |
| `dbInsert` | 插入 | 库写 | 后端 |
| `dbUpdate` | 更新 | 库写 | 后端 |
| `dbDelete` | 删除 | 库写 | 后端 |

> 无 `animate` 及一切页面内表现型动作（toast/弹窗/滚动/聚焦/播动…）：前端副作用节点只保留「跨渲染 / 跨页面 / 跨会话」的能力（navigate + 持久化），页面内表现一律由 `setVariable` 写 `state`、由渲染层下一帧消费，详见约束九。
- **图层/引擎层不提供任何事务语义**：事务是**业务语义**不是**编排语义**——图无资格、也无能力假定哪几个节点构成原子单元（一个云函数里若掺入 httpRequest 等外部副作用，DB 可回滚而外部请求回滚不了，"云函数 = 原子事务"从物理上就不成立）。要原子性，由用户用**编排**表达：正向节点出错时下钻其 `onError` 子图接一段逆操作（补偿）子图（Saga 风格）。**图层无事务控制流节点、dbXxx 无事务字段**；云函数内部若恰好只碰自己的 DB 而用了 DB 事务，那是云函数实现私事，对图透明、图不感知不承诺（详见约束九）。

- **前端唯一对外口是 `callFlow`**：前端 `cap` 不含 `db`/`httpClient`，一切跨域数据/网络都经 `callFlow` 调云函数、由后端转发；`httpRequest`/`dbXxx` 仅后端可用（与 C16 `cap` 前后端分注一致）。
- `callFlow` 是**动作**而非控制流：调云函数本质是一次网络调用，网络调用即副作用。`subFlow` 是**控制流**：它只是把一段流程组织成可复用集合，本身不碰外部世界——区别在于 `callFlow` 跨进程发起远程副作用，`subFlow` 只是本地的流程内联展开。

**约束三（`condition` 多分支，判据外置为一条 boolean 边）：** `condition` 升级为多分支（switch 形态），二分支只是 `cases` 长度为 2 的特例：

- 结构形如 `condition { cases: [{ slot, label }...], default }`：每个 case 持有一个 boolean **判据输入插槽** + 一个分支标签；运行时按顺序求值各 case 的 boolean，**走首个命中**的出边（其 `branch` 等于该 case 的 label），都不命中走 `branch:'default'` 的出边。
- 判据**不再是内联 `condition` 字段**，而是经一条 boolean 边接入（`toPort` 指向判据插槽）——复合条件（如 `a > b && c < d`）由 `compare` / `logic` 计算节点（C15）级联成一个产出 boolean 的表达式子图，`condition` 只吃这个子图的最终 boolean 输出。这把「条件」统一为「产出 boolean 的值节点」，与 C15 插槽混合模型一致，旧的 `FlowCondition` 类型被计算节点取代。

> **为什么判据要外置成一条边？** 内联 `condition` 字段无法表达 `a>b && c<d` 这类复合条件，只能塞进难以可视化、不可复用的表达式字符串（C15 反例）。外置为一条 boolean 边后，多级比较/逻辑运算在画布上可视化拼装、可复用、可级联，`condition` 退化为纯粹的「按门控值选路」开关——前置多级计算产出门控 boolean，命中后走对应 `branch` 的出边。

**约束四（错误处理双维度：执行器 try-catch + 节点内嵌 onError 子图消费）：** 错误处理分两个层次，各司其职：

- **机制兜底（执行器内 try-catch）：** 每个动作节点执行器内部 `try-catch`，捕获到异常后不就地吞掉，而是交由调度层判断：该节点有 `onError` 子图就下钻补偿、没有则冒泡到全局默认兜底。这一层是引擎机制，业务无需感知。
- **语句层消费（节点内嵌 `onError` 子图入口即 handler）：** 节点的 `onError` 是一张完整的 SESE 子图，其入口即该错误的 handler——错误处理本质就是「出错后走另一段流程」，handler 里能做的事和正常流程完全一样（记日志、提示、重试、回滚……都是普通节点）。`onError` 子图是一个**块级子作用域**（C16 约束四）：进入时压一帧新 context，其 `in` 在外层基础上静态叠一个 `error` 字段（不是给母帧的 `in` 加字段——那会违反「单帧形状不可变」）。handler 内的值节点可经 `from:'context'; path:'in.error'` 读取错误对象（沿帧链穿透仍可读外层名字）。
- **不引入专门的 catch 节点**：显式 catch 节点只是语法糖——其内部依然是「走另一段流程」，没有任何控制流原语之外的语义。这类语法糖应由业务方把常用错误处理流程提炼成 `subFlow` 上传物料市场共享，而非固化进 schema 增加节点种类。

**约束五（`setVariable` 是唯一写状态口，只写 `state.*`）：** 一切「设置」收编进 `setVariable`（废除 `setData`/`setVisible`，见约束六）：

- `setVariable` 是**唯一**能写状态的动作节点，写入目标限定为 `state.*`（C16 可读写的分层状态：`state.view.*` / `state.page.*` / `state.app.*` / `state.flow.*`）。
- **不能写 `in`，也不能写 `cap`**：`in` 是只读入参、`cap` 是能力句柄（C16 约束一）。所谓「上下文不可变」指的是 **context 信封的形状不可变**（顶层永远是 `in/state/cap` 三分，挂载点静态推导，运行期不增减字段），而 `state` 内部的值本就是可读写的——`setVariable` 改的正是 `state` 子树里的值，不违反信封形状不可变。

**约束六（废除七个节点，迁移到目标态）：** 以下节点在目标态被废除，各有去向：

| 废除节点 | 废除理由 | 迁移去向 |
| --- | --- | --- |
| `transform` | 表达式计算应是一等值节点，不该是副作用动作 | → C15 计算节点（math/concat/format/compare/logic 级联） |
| `script` | 在 FlowSchema 已能完备表达流程控制的前提下，注入任意脚本有悖「可视化、可审计」产品哲学；其定位其实对标 `subFlow`（组织可复用逻辑）而非计算 | → `subFlow`（可复用流程片段，进物料系统） |
| `setData` | 与 `setVariable` 职责重叠（都是「设置」） | → `setVariable`（写 `state.view.*`） |
| `setVisible` | 同上，是「设置可见性」的特例 | → `setVariable`（写视图的 visible 状态字段） |
| `return` | 顶层出度 0 即结束、子图走到 subExit 即结束，`return` 把命令式函数的「提前返回」塞进图是伪需求（见约束七） | → 无需迁移目标：删除节点；若在 subFlow 中携带返回值，该值沿边流入 subExit |
| `delay` | 时间流逝是宿主运行时能力（同 setTimeout/sleep），不是顶层 DAG AST 的可编排控制流原语；把宿主特性硬塞进与语言无关的图抽象（见约束九） | → 无等价图节点：纯时序等待落到下游副作用节点执行器内部时序属性（如重试退避）、或云函数实现内（无法自动转换，人工迁移项） |
| `animate` | 它是对前端渲染能力的封装，保留会让动作节点跟着「前端有什么 API」无限膨胀（toast/弹窗/滚动/聚焦…），把渲染层能力往流程层泄漏（见约束九） | → `setVariable`：把动画/表现改写为写 `state.view.*` 的样式/意图变量，由渲染层下一帧消费呈现 |

**约束七（顶层开放 DAG + 子图为可调用闭包；流程结束 = 出度 0 即自然结束，不设 `return` 节点）：** A5 已定义 FlowSchema 是「有向图」，流程靠边的流向推进，不是命令式代码块。顶层 FlowSchema 有显式 `entry: string` 标起点，不设 `exit`——出度 0 即自然结束，多分支可按需分别结束或汇合（多边汇入同一节点）。复合节点内嵌的子图（`FlowSubSchema`：subFlow body、while body、forEach body、onError）是可调用闭包，显式 `subEntry: string` + `subExit: string` 定义参数注入点和产出收集点。由此：

- **顶层图：出度 0 即自然结束。** condition 各分支可按需分别结束（各自到达出度为 0 的节点）或汇合（多边汇入同一节点）。不再强制所有分支汇流到唯一 `exit`。**子图：走到 `subExit` 即结束。** 循环体/补偿子图/子流程各自在其内嵌子图里走到 `subExit`（产出经连入 subExit 的边收集），回到母图当前节点沿出边继续。
- **不设 `return` 节点**：命令式语言的 `return` 表达「提前结束函数并回传值」，但在图里——顶层图中「结束」就是到达出度 0 的节点；子图中「结束」就是连一条边到 `subExit`。拓扑本身表达了结束，强行引入 `return` 等于把命令式解释器的控制语义偷塞进数据流图，与 A5 的图本质冲突。
- **subFlow 的「返回值」走纯数据流**：子流程的输出不靠 `return` 携带，而是沿连入子图 `subExit` 的 DataEdge 收集——每条连入 subExit 的 DataEdge 定义了一个输出端口（`fromPort` 为端口名），其值为上游节点的对应输出。
- **`navigate` 必须是终点节点**：navigate 切换 Scene 后当前 flow 的 context 失效，编辑时校验 navigate 的控制边出度必须为 0。跨页面通信（如等待目标页面返回回调）属 App 层路由模型迭代，不在 FlowSchema 调度范围内。
- **`onError` 执行后流程终止**：onError 是补偿（cleanup）非恢复（recovery）。补偿子图注入 `{ error, partialOutputs }`，执行完毕后流程终止——下游不应消费已失败节点的无效输出。
- **`subFlow` 是函数隔离闭包**：不穿透读取外层 state，所有依赖显式通过 inputs 传入。保持可复用性。

**约束八（执行调度模型 — Push-Pull 混合调度）：** 约束一～七固化图的静态形状，约束八固化运行期 FlowRunner 怎么沿两种边推进：

- **Push 主循环（沿控制边）：** 从 `entry` 出发，沿 ControlEdge 遍历节点。`category` 分流：control 节点 → 决定走向（匹配 `branch` 选出边或下钻内嵌子图）；action 节点 → 先 Pull 所有输入插槽 → 执行副作用 → 沿控制边继续。控制边出度 0 即该条路径结束。多条控制边汇入同一节点即 OR 汇合。
- **Pull 求值（沿数据边）：** action 执行前、control 判据求值前，检查各输入插槽。插槽有 DataEdge（`toSlot` 指向该插槽）→ 沿该 DataEdge 递归 Pull 上游节点的 `fromPort` 输出。source 直接出值，compute 递归 Pull 其输入后计算，已执行 action 取 `storedOutputs[fromPort]`。插槽无 DataEdge → 取内联默认值。
- **复合节点 = 递归下钻其内嵌子图（闭包调用）：** 遍历到复合节点（while/forEach/parallel/subFlow）时，栈式递归执行其内嵌的 `FlowSubSchema`。每次下钻压入新作用域帧（forEach 注入 item/index，subFlow 绑定形参，onError 注入 error+partialOutputs）。子图走到 `subExit` 即弹帧、回母图沿控制边继续。
- **parallel 帧快照 + Promise 汇聚：** `all`/`allSettled` 模式下每个分支拍独立帧快照，互不干扰。`race`/`any` 模式下共享帧，胜出后其余分支广播取消信号后丢弃。汇聚结果（由 mode 决定产出协议：all→数组/allSettled→含状态数组/race→首个值/any→首个成功值）作为 parallel 节点输出，下游经数据边取用。parallel 执行完沿控制边继续。
- **协作式取消（cooperative cancellation，非 parallel 私有职责）：** `race`/`any` 命中后，parallel 只负责**向未命中分支子图广播取消信号**；**「收到取消信号后怎么停」是节点内部实现**（动画可停、HTTP 可 abort、已落库的 dbInsert 不可逆）——parallel 不负责落实取消，更非事务回滚（与 C16/帧栈「无事务语义」一致）。取消信号传递是通用中断机制，未来超时等场景可复用。
- **error 走节点内嵌 onError 子图 + FlowRunner 双层兜底：** 节点可选的 `onError: FlowSubSchema` 内嵌补偿子图。executor 统一 try-catch，出错时——有 onError 子图则下钻补偿（子作用域注入 `{ error, partialOutputs }`，partialOutputs 为该节点已产出的部分输出，供补偿子图做回滚操作），补偿执行完毕后流程终止。无 onError 则走全局默认错误处理。控制流节点纯、出错是引擎级异常。

**约束九（图层不耦合宿主运行时能力；前端副作用只保留跨边界能力）：** 这是贯穿节点全集收敛的一条总原则——**执行器对用户透明，用户只能用图提供的能力；凡是「宿主运行时/执行宿主保证」的东西，都不进图，留给执行器/宿主**。据此做三处收敛：

- **时间 / 等待不进图（删 `delay`、不设 await/waitFor）：** 「让时间流逝」「等外部信号」和「让 HTTP 往返」一样，是执行器在其语言环境里的运行时能力，不是图给用户的一等积木。图只描述「副作用节点之间怎么编排」，至于某节点执行器内部会不会阻塞/等待，是该执行器实现细节（图只看到「它执行完、产出输出、往下走」）。上层抽象不耦合「这门语言有没有 setTimeout / 有没有 Promise」这类宿主特性。「干等 N 秒」要么是某副作用节点的内部时序属性（如重试退避），要么落到云函数实现内完成。
- **事务不进图（原子性由用户补偿编排表达，Saga 风格）：** 事务是**业务语义**不是**编排语义**——「这几步要么全成要么全不成」是用户对自己业务的诉求，图无资格也无能力替用户假定哪几个节点构成一个原子单元。而且「云函数 = 一个原子事务」从物理上就不成立：云函数里一旦掺入 `httpRequest` 等外部副作用，DB 可回滚而打出去的外部请求回滚不了，DB 事务边界包不住外部世界。所以图层/引擎层**不提供任何事务语义**——要原子性，由用户用**编排**显式表达：正向节点出错下钻其 `onError: FlowSubSchema` 内嵌一段逆操作（补偿）子图，正向产出的数据（如 dbInsert 出的 id）随 `partialOutputs` 沿补偿子图入口流给补偿节点去撤销。这与约束八「取消是协作式的、副作用不可逆、parallel 不做事务回滚」、与「帧栈无事务语义」三处自洽：引擎一以贯之地不承诺事务，原子性是用户编排出来的、不是图隐含的。云函数内部若恰好只碰自己的 DB 而用了 DB 事务，那是云函数实现私事，对图透明、图不感知不承诺。故**图层无事务控制流节点、`dbXxx` 无事务字段**。
- **前端副作用只保留跨边界能力（删 `animate` 及一切页面内表现型动作）：** 前端动作节点只保留「跨渲染边界 / 跨页面 / 跨会话」的能力（`navigate` 跨页面 + 持久化跨会话），**页面内的一切表现（toast/弹窗/滚动/聚焦/动画…）一律通过 `setVariable` 写 `state` 驱动，由渲染层在下一个渲染循环消费状态变化自然呈现**（toast 即写 `state.*.toastVisible=true`，动画即写目标样式变量让渲染层做过渡）。理由：`animate` 这类节点本质是对渲染能力的封装，保留会让动作节点跟着「前端有什么 API」无限膨胀、把渲染层能力往流程层泄漏；用「写 state + 渲染层响应」兜住后，前端副作用节点集就**封闭**了，只剩导航与持久化两类真正跨边界的副作用。

> **同一条原则的四次吻合：** 约束七（顶层出度 0 即结束/子图走到 subExit，不设 return）、约束九的时间/等待（不进图）、约束九的事务（原子性由用户补偿编排表达、图不提供事务语义）、约束九的前端表现（写 state 驱动）——本质都是「图是语言无关、宿主无关的纯编排抽象，凡运行时/宿主/渲染层能保证的语义都不下沉进图节点种类，业务语义（如事务原子性）由用户用编排自己表达」。这条原则同时防止了节点全集随宿主能力无限膨胀。

**反例（不符合本契约）：**

- 把控制流节点（condition/while/forEach）当作有副作用的节点对待，或给它们注入 `cap`——控制流必须纯，副作用归动作节点，否则约束一的两分判据失效。
- `condition` 继续用内联 `condition` 字段表达判据——无法承载复合条件，逼出不可视化的表达式字符串（C15 反例的语句层翻版）。
- 为错误处理新增专门的 catch 节点——错误 handler 就是普通流程，落点节点即 handler，专门节点是冗余语法糖（应提炼为 subFlow）。
- 让 `setVariable` 之外的动作节点直接写 `state`，或让任何节点写 `in`/`cap`——破坏「唯一写状态口」与「信封形状不可变」。
- 在前端流程里直接用 `httpRequest`/`dbQuery`——前端 `cap` 无此能力，一切对外须经 `callFlow` 调云函数（约束二）。
- 保留 `transform`/`script` 做计算——计算是值节点的事，副作用动作不该承担表达式求值（违背约束一与 C15 值/动作分离）。
- 引入 `return` 节点表达「提前结束流程」或「回传子流程返回值」——把命令式 return 塞进图，与 A5 图本质冲突；顶层出度 0 即结束、子流程走到 subExit（约束七）。
- 子图无显式 subEntry/subExit——子图是独立作用域（闭包），必须显式入口/出口来绑定参数、注入作用域、收集产出（约束七/八）。
- 让 parallel 负责「取消其余分支并回滚已发生的副作用」——取消的落实是节点内部实现、副作用不可逆，parallel 只发协作式取消信号、不做事务回滚（约束八）。
- 用图上的独立 error 边/跨节点 error 通道做错误处理——错误处理是节点内嵌的 `onError: FlowSubSchema` 补偿子图，主链路上无跨节点 error 边；控制流节点纯、出错走全局默认兜底（约束八）。
- 新增 `delay`/`sleep`/`await`/`waitFor` 节点表达「等一段时间」或「挂起等外部信号」——时间与等待是宿主运行时能力，收进副作用节点执行器或云函数实现，不进图（约束九）。
- 新增 `animate`/`toast`/`scrollTo`/`focus` 等页面内表现型动作节点——前端副作用只保留跨页面/跨会话能力，页面内表现一律写 `state` 由渲染层下一帧消费，否则动作节点集随渲染能力无限膨胀（约束九）。
- 在 FlowSchema 里给 dbXxx 加事务字段、新增事务控制流节点、或靠「一个云函数 = 一个事务」隐含原子性——事务是业务语义不是编排语义，图不提供事务；原子性由用户在节点 `onError` 子图内编排补偿（Saga）显式表达（约束九）。

**实施方案：** [FlowSchema 图结构契约 — 类型重构/迁移/外壳适配](../../specs/engine/flow-graph-structure.md)

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

**✅ 已实施** · refines engine:A0

InteractionStateMachine 通过 `InteractionDelegate` 接口声明所有外部能力需求。宿主实现此接口并注入状态机。

> **A0 机制/策略定位：** InteractionDelegate 是 A0 中 banvasgl 暴露的**机制接口**——它声明的 moveViews/resizeView/rotateView/beginTransaction 等都是几何与事务机制原语。交互状态机（策略）仅通过该机制接口表达需求，不直接持有机制对象，从而保证机制与策略的边界。

**决策链：** A0 机制/策略分离 → 状态机（策略）需要操作 View/Scene（机制对象，如移动、缩放、选中）→ 但策略不应直接持有机制层引用 → Delegate 接口定义机制能力契约。

**约束：**

- Delegate 方法包括：getSelectedViews / setSelection / moveViews / resizeView / rotateView / beginTransaction / commitTransaction 等（均为机制原语）
- 状态机只调用 delegate 方法，不直接操作 View/Scene/TransactionManager
- 不同模式（编辑/预览）注入不同 delegate 实现——这是策略差异，机制接口不变
- 测试时注入 mock delegate 即可验证状态机逻辑

---

### C10. InteractionCapability 配置协议

**✅ 已实施** · 依赖 C9 · refines engine:A0

通过 `InteractionCapability` 集合配置状态机启用的交互能力，不同运行态配置不同能力集。

> **A0 机制/策略定位：** InteractionCapability 集合本身是**策略取值**——「在什么运行态启用哪些能力」是 A0 中明确由上层注入的策略，banvasgl 不内置该取值。能力所对应的底层操作（C9 Delegate 原语）是机制，启用哪些是策略；三态差异全部收敛于这个能力集取值上。

**决策链：** A0 机制/策略分离 → 「启用哪些交互能力」是策略（编辑态需全部、预览态只需 pan）→ 策略应可配置而非硬编码进 banvasgl → 集合模式灵活组合，由上层按运行态注入。

**约束：**

- 能力枚举：pan / move / resize / rotate / connect / box-select / text-selection / edit-point / drop
- 编辑态：全部启用
- 预览态/线上态：仅启用 pan（或全部禁用）
- 能力集可在运行时动态修改（如进入文本编辑模式时启用 text-selection）
- 能力集取值由上层按运行态注入（策略），banvasgl 不内置默认三态映射

---

## 宿主集成协议

### C11. 引擎 ↔ 宿主集成通信协议

**✅ 已实施**

引擎核心零 DOM / 零 React 依赖，通过 `subscribe` / `getVersion` / `notify` 三件套暴露外部状态订阅能力。React hook（`useCanvasInit` / `useCanvasCamera`）在独立包 `@banyuan/banvasgl-react` 中，通过 `useRef` 持有 App 实例，通过 `useEffect` 管理生命周期。hook 向引擎传递 Canvas DOM 元素和配置，引擎通过回调通知宿主状态变化。

**决策链：** 引擎不依赖 React，但需要与 React 宿主协同 → hook 是 React 端的集成层 → 抽取为独立包 banvasgl-react 使 banvasgl 核心保持平台无关 → 通过 ref 持有实例避免重复创建。

**约束：**

- `@banyuan/banvasgl-react` 导出 useCanvasInit 和 useCanvasCamera
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

---

## Addon 管线协议

### C14. Addon 注册与管线分发协议

**✅ 已实施**

Addon 通过 mixin 模式附加到 View 上，管线调度器在渲染和命中测试时按固定阶段顺序分发给已注册的 Addon。

**设计语境：** 渲染一个 View 不是单纯"画内容"——需要依次处理装饰（背景/边框/阴影）、内容本体、顶点手柄、选中框等辅助元素。命中测试同理，需要判断点击命中了装饰区域、内容区域还是操作手柄。这些关注点由不同的 Addon 负责，引擎需要一个确定性的协议来编排它们。

**交互协议：**

- **注册时：** Addon 通过 mixin 模式附加到 View 实例上，声明自己参与的管线阶段（如 BoxDecorationAddon 参与渲染阶段的"装饰层"、BoundingBoxAddon 参与"选中层"、VertexAddon 参与"操作层"）
- **渲染分发：** Renderer 遍历可见 View 列表时，对每个 View 按管线阶段顺序调用已附加 Addon 的渲染方法（装饰 → 内容 → 选中框 → 顶点手柄）
- **命中测试分发：** 命中测试按逆序（上层优先）检查各 Addon 的命中区域，第一个命中的 Addon 决定交互行为（如命中顶点手柄 → 进入缩放模式，命中内容区 → 进入移动模式）
- **动态挂载/卸载：** Addon 可在 View 生命周期内动态挂载和卸载（如进入编辑态时附加 TextSelectionAddon），挂载后立即参与后续管线分发

**约束：**

- 管线阶段顺序由引擎定义，Addon 不可自行修改顺序
- 同一管线阶段允许多个 Addon 参与，按注册顺序执行
- Addon 的渲染输出必须在自己负责的 Canvas 层级（不可越权绘制到其他层）
- Addon 之间不直接通信，通过 View 的公共状态协调
