# FlowSchema 完整数据结构与调度设计（v2.0.0 / v2.1.0）

## 关联决策

- **engine:A5** — FlowSchema 是 BanvasGL 的内置流程控制子系统（过程式 AST + Push-Pull 调度）
- **engine:A5a** — Flow 子模块通过子路径导出实现物理隔离
- **engine:A5b** — 前后端执行器共享 FlowSchema 但物理隔离

---

## 一、核心设计：边消解为节点内嵌引用

v2.0.0 最初将边分为 ControlEdge / DataEdge 两种独立实体存储在顶层数组中。但边的本质是**节点之间的关系**，不是独立存在的事物——控制边是"A 执行完后去 B"这一语义在 A 身上的属性，数据边是"B 的输入来自 A 的输出"这一语义在 B 身上的属性。

因此 v2.0.0 终稿将边消解为节点内部的引用字段：

| 原边类型 | 消解为 | 所在位置 |
|----------|--------|----------|
| `FlowControlEdge` | `slots[*].next: string` | control / action / function 节点的 slot |
| `FlowDataEdge` | `SlotValue = unknown \| DataRef` | 所有节点的 `slot.input` |

**设计优势**：`DataRef { nodeId, field }` 天然编码了"谁连到我"——`nodeId` 指向源节点，`field` 指向源节点的输出字段名。Runner 的 Pull 阶段遇到 DataRef 时递归 `stepNode` 求值源节点并取对应 field。正向遍历时直接读 `slot.next`，无需扫描边数组。

---

## 二、顶层 Schema

```ts
interface FlowSchema {
  version: "2.0.0"
  entry: string
  nodes: Record<string, FlowNode>
  // ★ controlEdges / dataEdges 已移除 —— 边消解在节点内部
}
```

`FlowSchema` 现在只有两个字段：`entry` + `nodes`。图的全部信息（拓扑 + 数据依赖）都在节点自身内部。

> **v2.0.0 变更**：`FlowSubSchema`（含 `subEntry`/`subExit`）已移除。所有内嵌子图（Function body、Loop body、Parallel body、onError）统一使用 `FlowSchema`，入口均为 `entry`。子图的返回值由 `Return` 节点写入帧的 `returnRef.value`，`runSubGraph()` 返回该值。

---

## 三、DataRef 与 SlotValue

```ts
/** 跨节点数据引用 —— 指向上游节点的某个输出字段 */
interface DataRef {
  nodeId: string
  field: string            // 上游节点的输出字段名（如 "value"、"rows"、"status"）
}

/** 判断一个值是否为 DataRef（类型守卫） */
function isDataRef(v: unknown): v is DataRef {
  return typeof v === 'object' && v !== null && 'nodeId' in v && 'field' in v
}

/**
 * 槽值：内联字面量 或 跨节点数据引用。
 * 运行时 pull() 先检查是否为 DataRef，是则 Pull 该引用，否则直接使用内联值。
 */
type SlotValue = unknown | DataRef
```

**插槽混合模型**：每个输入参数都是 `SlotValue`。取值规则——有 DataRef 时 Pull 该引用，否则取内联值。DataRef 天然编码了"谁连到我"，不需要在顶层维护 DataEdge 数组。

---

## 四、节点

### 4.1 统一插槽模型

所有节点通过 `slots` 数组承载控制流和数据依赖：

```ts
type FlowNode =
  | FlowSourceNode     // Literal / Context
  | FlowComputeNode    // Math / Compare / Logic / Concat / Format / Get
  | FlowControlNode    // Condition / Loop / Parallel / Return
  | FlowActionNode     // SetVariable / SetViewData / ... / DbDelete
  | FlowFunctionNode   // Function
```

每个节点有 `id`、`category`、`kind`、`slots` 字段。`slots` 是一个类型化的数组——不同 NodeKind 有不同形状的 slot。

### 4.2 next 统一控制流

所有 control、action、function 节点的 slot 内嵌 `next` 字段：

```ts
/**
 * 下一节点 ID，空字符串 "" 表示流程终点。
 *
 * - 单出口节点: next = "nextNodeId"
 * - condition:   每个 slot 有自己的 next
 * - navigate:    next = ""（终点节点）
 * - return:      无 next（nextNodeId 始终 null）
 *
 * "" = 控制流终止
 */
type Next = string
```

### 4.3 节点分类（25 种 NodeKind）

| category | kind | 控制出 (next) | 数据入 (slot.input) | 数据出 (outputs) | 副作用 | 调度 |
|----------|------|:---:|:---:|:---:|:---:|------|
| source | literal | - | - | { value } | ❌ | Pull |
| source | context | - | - | { value } | ❌ | Pull |
| compute | math | - | { op, a, b } | { value } | ❌ | Pull |
| compute | compare | - | { op, a, b } | { value } | ❌ | Pull |
| compute | logic | - | { op, a, b } | { value } | ❌ | Pull |
| compute | concat | - | { a, b, separator? } | { value } | ❌ | Pull |
| compute | format | - | { template, values } | { value } | ❌ | Pull |
| compute | get | - | { path, object } | { value } | ❌ | Pull |
| control | condition | 每 slot 独立 next | 每 slot 有 filter | - | ❌ | Push |
| control | loop | slot.next | slot.filter + slot.body | - | ❌ | Push |
| control | parallel | slot.next | slot.body[] + slot.mode | - | ❌ | Push |
| control | return | null | slot.input | = inputs | ❌ | Push |
| function | function | slot.next | slot.body + slot.input | = returnRef | ❌ | Push |
| action | setVariable | slot.next | { target, value } | - | ✅ | Push |
| action | setViewData | slot.next | { viewId, key, value } | - | ✅ | Push |
| action | setViewVisible | slot.next | { viewId, visible } | - | ✅ | Push |
| action | playAnimation | slot.next | { viewId, animationId } | - | ✅ | Push |
| action | navigate | slot.next="" | { target } | - | ✅ | Push |
| action | cloudFunction | slot.next | { functionId, method?, args? } | { status, body, headers } | ✅ | Push |
| action | httpRequest | slot.next | { url, method?, headers?, body? } | { status, body, headers } | ✅ | Push |
| action | dbQuery | slot.next | { collection, filter? } | { rows, count } | ✅ | Push |
| action | dbInsert | slot.next | { collection, document } | { id } | ✅ | Push |
| action | dbUpdate | slot.next | { collection, filter, update } | { matchedCount, modifiedCount } | ✅ | Push |
| action | dbDelete | slot.next | { collection, filter? } | { deletedCount } | ✅ | Push |

source/compute 无 `next`（不在控制路径上，只被 Pull）。

### 4.4 Control 节点

```ts
/** Condition 节点 —— 多 slot，每条 slot 是一个条件分支 */
interface FlowConditionNode {
  category: NodeCategory.Control
  kind: NodeKind.Condition
  slots: FlowConditionSlot[]    // 每 slot = { filter, next }
}

interface FlowConditionSlot extends SlotBase {
  filter: Filter               // Condition | ConditionGroup
  next: Next                   // 该分支匹配后的下一节点 ID
}

/** Loop 节点 —— 单 slot = while(filter) { body } */
interface FlowLoopNode {
  category: NodeCategory.Control
  kind: NodeKind.Loop
  slots: FlowLoopSlot[]
}

interface FlowLoopSlot extends SlotBase {
  filter: Filter
  body: FlowSchema             // ★ 内嵌循环体子图
  next: Next                   // 循环退出后的后继
}

/** Parallel 节点 —— 单 slot 包含多个并行分支 */
interface FlowParallelNode {
  category: NodeCategory.Control
  kind: NodeKind.Parallel
  slots: FlowParallelSlot[]
}

interface FlowParallelSlot extends SlotBase {
  body: FlowSchema[]           // ★ 多个并行子图
  mode: ParallelMode           // All | AllSettled | Race | Any
  next: Next                   // 收敛后的后继
}

/** Return 节点 —— 收集 inputs，写入 returnRef，终止子图 */
interface FlowReturnNode {
  category: NodeCategory.Control
  kind: NodeKind.Return
  slots: FlowReturnSlot[]      // 无 filter/body/next，仅 input
}
```

### 4.5 Function 节点

```ts
interface FlowFunctionNode {
  category: NodeCategory.Function
  kind: NodeKind.Function
  slots: FlowFunctionSlot[]
}

interface FlowFunctionSlot extends SlotBase {
  body: FlowSchema             // ★ 内嵌函数体子图
  next: Next                   // 函数返回后的后继
  onError?: FlowSchema         // 错误补偿子图
}
```

### 4.6 Action 节点

所有 Action 节点有统一的 `next` 和可选的 `onError`：

```ts
/** 设置帧变量（前后端共享） */
interface FlowSetVariableNode {
  category: NodeCategory.Action
  kind: NodeKind.SetVariable
  slots: FlowSetVariableSlot[]
}
interface FlowSetVariableSlot extends SlotBase {
  input: { target: SlotValue; value: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 设置 View 数据（前端） */
interface FlowSetViewDataNode {
  category: NodeCategory.Action
  kind: NodeKind.SetViewData
  slots: FlowSetViewDataSlot[]
}
interface FlowSetViewDataSlot extends SlotBase {
  input: { viewId: SlotValue; key: SlotValue; value: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

// setViewVisible / playAnimation / navigate / cloudFunction 同理
// httpRequest / dbQuery / dbInsert / dbUpdate / dbDelete 同理（后端）
```

### 4.7 Source 节点

```ts
/** 字面量 —— 内联值 */
interface FlowLiteralSourceNode {
  category: NodeCategory.Source
  kind: NodeKind.Literal
  slots: FlowLiteralSourceSlot[]
}
interface FlowLiteralSourceSlot extends SlotBase {
  value: unknown
  output: ['value']
}

/** 上下文 —— 从帧栈按 path 取变量 */
interface FlowContextSourceNode {
  category: NodeCategory.Source
  kind: NodeKind.Context
  slots: FlowContextSourceSlot[]
}
interface FlowContextSourceSlot extends SlotBase {
  path: string               // 如 "in.userId"、"local.counter"
  output: ['value']
}
```

### 4.8 Compute 节点

```ts
// 所有 compute 节点的 slot.input 均为类型化的 SlotValue 字段，output 统一为 ['value']
interface FlowMathSlot extends SlotBase {
  input: { op: MathOp; a: SlotValue; b: SlotValue }
  output: ['value']
}
interface FlowCompareSlot extends SlotBase {
  input: { op: CompareOp; a: SlotValue; b: SlotValue }
  output: ['value']
}
interface FlowLogicSlot extends SlotBase {
  input: { op: LogicOp; a: SlotValue; b: SlotValue }
  output: ['value']
}
interface FlowConcatSlot extends SlotBase {
  input: { a: SlotValue; b: SlotValue; separator?: string }
  output: ['value']
}
interface FlowFormatSlot extends SlotBase {
  input: { template: SlotValue; values: SlotValue }
  output: ['value']
}
interface FlowGetSlot extends SlotBase {
  input: { path: string; object: SlotValue }
  output: ['value']
}
```

---

## 五、上下文与帧栈

```ts
/**
 * 帧栈 —— 一维调用栈，每条执行路径持有独立实例。
 * Parallel 分支各自持有独立 FrameStack 避免竞态。
 */
interface FrameRecord {
  in:          Readonly<Record<string, unknown>>  // 只读入参
  local:       Record<string, unknown>            // 可读写临时变量
  nodes:       Record<string, FlowNode>           // 节点注册表
  entry:       string                             // 入口节点 ID
  returnRef:   { value: Record<string, unknown> } // 返回值槽
  steps:       number                             // 全局步数计数器
  outputCache: Map<string, NodeEvalResult>        // 节点输出缓存
}
```

资源来向三分：
- **`in`**：子图调用时传入的只读入参（Context 节点可读取）
- **`local`**：帧内可读写临时变量（SetVariable 节点写入，leave 随帧销毁）
- **`cap`**：全局能力代理（整个执行链共享同一引用，Runner 持有，executor 通过 `ctx.cap` 访问）

---

## 六、执行器系统（v2.1.0）

### 6.1 NodeExecutor

```ts
/** 节点求值结果 */
interface NodeEvalResult {
  outputs?: Record<string, unknown>
  error?: Error
  nextNodeId: string | null      // null = 终止
}

/**
 * 节点执行器 —— 纯函数签名。
 * registry key 本身已承载 kind 信息，无需 executor 声明 kind 字段。
 */
type NodeExecutor<
  N extends FlowNode = FlowNode,
  C extends CapProxy = CapProxy,
> = (
  node: N,
  resolvedInputs: Record<string, unknown>,
  ctx: IRunnerCtx<C>,
) => Promise<NodeEvalResult>

/** 运行时执行上下文 */
interface IRunnerCtx<C extends CapProxy = CapProxy> {
  stack: IFrameStack
  readonly executors: ExecutorRegistry<C>
  readonly cap: C
  runSubGraph(schema: FlowSchema, inputs: Record<string, unknown>, stack?: IFrameStack): Promise<Record<string, unknown>>
  evaluateFilter(filter: Filter): Promise<boolean>
}
```

### 6.2 类型化注册表（v2.1.0 核心升级）

```ts
/** 从 FlowNode 联合中按 kind 提取具体节点类型 */
type NodeForKind<K extends NodeKind> = Extract<FlowNode, { kind: K }>

/**
 * 类型化执行器注册表 —— 按 NodeKind 索引的映射类型。
 * 每个字段的 node 参数类型由 NodeForKind 自动推导，消除 as 断言。
 * 所有条目可选：前端/后端 preset 各自填充不同子集。
 */
type ExecutorRegistry<C extends CapProxy = CapProxy> = {
  [K in NodeKind]?: NodeExecutor<NodeForKind<K>, C>
}
```

Runner 的 `dispatch` 通过 `switch (node.kind)` 实现 discriminated union 收窄，从 registry 取出的 executor 类型天然匹配 `node` 的具体类型。

### 6.3 预组装工厂

```ts
/** 前端 preset：source + compute + control + function + 前端 action */
function createClientFlowRunner(cap: FrontendCapProxy): FlowRunner<FrontendCapProxy>
// 注册：literal, context, math, compare, logic, concat, format, get,
//       condition, loop, parallel, return, function,
//       setVariable, setViewData, setViewVisible, playAnimation, navigate, cloudFunction

/** 后端 preset：source + compute + control + function + 后端 action */
function createServerFlowRunner(cap: BackendCapProxy): FlowRunner<BackendCapProxy>
// 注册：literal, context, math, compare, logic, concat, format, get,
//       condition, loop, parallel, return, function,
//       setVariable, httpRequest, dbQuery, dbInsert, dbUpdate, dbDelete
```

---

## 七、FlowRunner 调度器（v2.1.0）

### 7.1 统一执行循环

```
runGraph(schema, inputs):
    stack.enter(inputs, schema)
    node = nodes[entry]
    steps = 0

    while node != null:
        if ++steps > MAX_STEPS (1000): throw
        result = stepNode(node, stack)
        if result.error:
            if node.slots 有 onError:
                enter onError(error, partialOutputs) → runGraph → leave
            else throw error
        node = result.next

    return stack.returnRef.value

stepNode(node, stack):
    // 1. 查缓存
    if stack.outputCache.has(node.id):
        cached = stack.outputCache.get(node.id)
        return { outputs: cached.outputs, error: cached.error, next: cached.nextNodeId }

    // 2. dispatch → executor
    result = dispatch(node, stack)

    // 3. 写缓存
    stack.outputCache.set(node.id, result)
    return { outputs: result.outputs, error: result.error, next: result.nextNodeId }

dispatch(node, stack):
    switch node.kind:
        case Literal / Context → execSource(registry[node.kind], node)
        // Source: 无输入，直接调 executor
        case Math / Compare / Logic / ... → exec(registry[node.kind], node, stack)
        // Compute: pullSlots 解析 SlotValue → executor
        case Condition / Loop / Parallel / Return → exec(registry[node.kind], node, stack)
        // Control: pullSlots 解析 SlotValue → executor（Condition/Loop 通过 ctx.evaluateFilter 求值）
        case SetVariable / SetViewData / ... / DbDelete → exec(registry[node.kind], node, stack)
        // Action: pullSlots 解析 SlotValue → executor（通过 ctx.cap 产生副作用）
        case Function → exec(registry[node.kind], node, stack)
        // Function: pullSlots → executor（ctx.runSubGraph 执行内嵌 body）
        default → never（TypeScript 穷尽检查）
```

### 7.2 Pull 核心

```
pull(slot, stack):
    if !isDataRef(slot): return slot           // 内联字面量
    upstream = stack.nodes[slot.nodeId]
    step = stepNode(upstream, stack)            // 递归求值 + 写缓存
    if step.error: throw step.error
    return step.outputs[slot.field]             // 取对应字段

pullSlots(stack, node):
    遍历 node.slots[*].input:
        result[name] = pull(slotValue, stack)
    return result
```

### 7.3 Filter 求值

```
evaluateFilter(filter):
    if filter 是 Condition  { left, op, right }:
        return compareEval(pull(left), op, pull(right))
    if filter 是 ConditionGroup { op, conditions }:
        switch op:
            And: 逐一求值，首个 false 返回 false（短路）
            Or:  逐一求值，首个 true 返回 true（短路）
            Not: !evaluateFilter(conditions[0])
```

### 7.4 执行保证

| 保证 | 说明 |
|------|------|
| 控制路径无环 | 编辑时 DFS next 引用链（出度为 0 终止） |
| Pull 惰性求值 | source/compute/action 均参与，沿 DataRef 递归执行，不跟 next |
| 多前序用 parallel | parallel 保证所有分支执行后才收敛，跨分支 DataRef 安全 |
| 步数安全阀 | MAX_STEPS=1000，防止无限循环 |
| 帧级缓存 | stepNode 首次执行后写 outputCache，同帧内后续引用命中缓存直接返回 |
| onError=补偿 | 注入 partialOutputs 供回滚，执行后终止（Saga 模式） |
| navigate=终点 | next 必须为空字符串——跳转后 context 失效 |
| compute 纯函数 | 不访问 cap/stack，输入完全来自 DataRef 或内联值 |

---

## 八、编辑时校验

| 校验项 | 规则 |
|--------|------|
| 控制路径无环 | entry DFS next 引用链 |
| entry 约束 | 必须是 control 或 action 节点 |
| navigate 终点 | `next` 必须为 `""` |
| condition 完整性 | 至少一个 slot；全部不匹配时流程终止（可接受） |
| 引用完整性 | DataRef.nodeId 存在于 nodes 中；DataRef.field 匹配上游 output 字段 |
| category 约束 | source/compute 无 next；action/control/function 的 slot 含 next |

---

## 九、语义边界

- **navigate = 终点**：切换 Scene 后 flow context 失效，next 必须为空字符串
- **onError = 补偿**：执行完毕后流程终止，非恢复（Saga 模式）
- **Function = 隔离闭包**：不穿透读取外层帧变量，所有依赖显式通过 inputs 传入
- **Return = 写 returnRef**：Return 节点将 inputs 写入当前帧 `returnRef.value`，仅用于子图
- **Flow 间正交**：不同 FlowSchema 独立执行，不共享帧栈

---

## 十、关键决策取舍

| 决策 | 取舍 |
|------|------|
| **边消解为节点内嵌引用** | 边不是独立实体——控制流是"A 之后去 B"（A 的属性），数据流是"B 的输入来自 A"（B 的属性）。两层边数组消失，O(1) 直接读取。代价：删除节点需扫描所有节点的 next 和 DataRef 做级联清理 |
| **Next = string** | 统一单出口（`"nextId"`）、终点（`""`）。多分支（condition）通过多 slot 各自 next 承载 |
| **DataRef { nodeId, field }** | 字段名天然跟随引用。pull 直接取 `outputs[field]` |
| **SlotValue 混合模型** | 内联 + 引用二合一，不需要在顶层区分"已连线/未连线" |
| **Function 替代 subFlow** | body 内嵌，无需外部 loadSubFlow。可复用函数仍可通过物料系统实现 |
| **Loop（while）替代 forEach** | 更小节点全集（25 → 25，无独立的 forEach） |
| **Pull 可递归执行 action** | DataRef 指向未缓存 action 时，Pull 递归执行它并写 cache。不跟 next |
| **parallel 帧隔离** | 各分支独立 FrameStack，全模式收敛 |
| **onError = 补偿** | slot 级别，注入 partialOutputs，执行后终止 |
| **compute 不可见 cap/stack** | 纯函数——输入完全来自 DataRef 或内联值 |
| **ExecutorRegistry 映射类型** | 每个字段的 node 参数类型由 NodeForKind 自动推导，消除 as 断言 |
| **v2.1.0 Runner 退化为纯编排** | 所有 NodeKind 通过 registry 分发，Runner 不包含任何节点特定逻辑 |

---
