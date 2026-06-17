# FlowSchema 完整数据结构与调度设计

## 关联决策

- **engine:A5** — FlowSchema 是 BanvasGL 的内置流程控制子系统（过程式 AST + Push-Pull 调度）
- **engine:C15** — 图结构契约（节点分类 + 边消解为节点内嵌引用 + 开放 DAG + 可调用子图 + 插槽混合模型）
- **engine:C16** — 挂载点 ⇒ 上下文契约（资源来向三分 `in / state / cap`）
- **engine:C17** — 语句层节点契约（控制流/动作两分 · 节点全集 · 错误消费 · 语义边界）
- **engine:M15** — Push-Pull 混合调度机制

---

## 一、核心设计：边消解为节点内嵌引用

v2.0.0 最初将边分为 ControlEdge / DataEdge 两种独立实体存储在顶层数组中。但边的本质是**节点之间的关系**，不是独立存在的事物——控制边是"A 执行完后去 B"这一语义在 A 身上的属性，数据边是"B 的输入来自 A 的输出"这一语义在 B 身上的属性。

因此 v2.0.0 终稿将边消解为节点内部的引用字段：

| 原边类型 | 消解为 | 所在位置 |
|----------|--------|----------|
| `FlowControlEdge` | `next: Record<string, string>` | control / action 节点 |
| `FlowDataEdge` | `FlowSlot = unknown \| DataRef` | 所有节点的输入插槽 |

**设计优势**：端口和引用统一——`DataRef.port` 就是原来的 `fromPort`，`next` 的 key 就是原来的 `branch`，不需要在边数组和节点之间维护引用完整性。FlowRunner 正向遍历时直接读 `node.next`，无需扫描边数组。

---

## 二、顶层 Schema

```ts
interface FlowSchema {
  version: "2.0.0"
  entry: string
  nodes: Record<string, FlowNode>
  // ★ controlEdges / dataEdges 已移除 —— 边消解在节点内部
}

interface FlowSubSchema {
  subEntry: string
  subExit: string
  nodes: Record<string, FlowNode>
  params?: { name: string; type: "string"|"number"|"boolean"|"object"|"array" }[]
  // ★ controlEdges / dataEdges 已移除 —— 子图同样消解
}
```

`FlowSchema` 现在只有两个字段：`entry` + `nodes`。图的全部信息（拓扑 + 数据依赖）都在节点自身内部。

---

## 三、DataRef 与 FlowSlot

```ts
/** 跨节点数据引用 —— 指向上游节点的某个输出端口 */
interface DataRef {
  nodeId: string
  port: string            // 上游节点的输出端口名
}

/** 判断一个 slot 值是否为 DataRef */
function isDataRef(v: unknown): v is DataRef {
  return typeof v === 'object' && v !== null && 'nodeId' in v && 'port' in v
}

/**
 * 插槽值：内联字面量 或 跨节点数据引用（互斥，DataRef 优先）。
 * 运行时 resolveSlot 先检查是否为 DataRef，是则 Pull，否则直接使用内联值。
 */
type FlowSlot = unknown | DataRef
```

**插槽混合模型（C15 约束三）**：每个输入参数都是 `FlowSlot`。取值规则——有 DataRef 时 Pull 该引用，否则取内联值。DataRef 天然编码了"谁连到我"，不需要在顶层维护 DataEdge 数组。

---

## 四、节点

### 4.1 next 统一控制流

所有 control 和 action 节点内嵌 `next` 字段，替代原来的 ControlEdge 数组：

```ts
/**
 * next: branch → targetNodeId
 *
 * - 单出口节点: { "": "nextNodeId" }
 * - condition:   { "matched": "A", "else": "B" }
 * - navigate:    {}（终点节点，控制流到此终止）
 * - while/forEach/parallel: { "": "afterLoop" }
 *
 * {} 或缺失 = 控制流终止（对应原 ControlEdge 出度 0）
 */
type Next = Record<string, string>
```

多分支（condition）和单出口统一为同一结构——key 就是原来的 `branch`，value 就是原来的 `to`。

### 4.2 节点分类

```ts
type FlowNode = { id: string } & (
  FlowControlNode | FlowActionNode | FlowSourceNode | FlowComputeNode
)
```

| category | 控制入 | 控制出 next | 数据入 slot | 数据出 port | 副作用 | 调度 |
|----------|:---:|:---:|:---:|:---:|:---:|------|
| control | - | >=1 键（多分支） | >=0 | 0 | ❌ | Push |
| action | - | <=1 键（navigate = {}） | >=0 | >=0 | ✅ | Push |
| source | - | - | 0 | "value" | ❌ | Pull |
| compute | - | - | >=0 | "value" | ❌ | Pull |

source/compute 无 `next`（不在控制路径上，只被 Pull）。

### 4.3 control 节点

```ts
/** 条件分支 —— cases + default + ControlEdge.branch 三合一 */
interface FlowConditionNode {
  category: "control"; kind: "condition"
  /** key = branch label，value = { 判据 DataRef, 分支后继 nodeId } */
  branches: Record<string, { condition: FlowSlot; next: string }>
  onError?: FlowSubSchema
}

interface FlowWhileNode {
  category: "control"; kind: "while"
  condition: FlowSlot
  body: FlowSubSchema
  next: Next                    // ★ 循环结束后的后继
  onError?: FlowSubSchema
}

interface FlowForEachNode {
  category: "control"; kind: "forEach"
  collection: FlowSlot
  itemVar?: string
  indexVar?: string
  body: FlowSubSchema
  next: Next                    // ★ 遍历结束后的后继
  onError?: FlowSubSchema
}

interface FlowParallelNode {
  category: "control"; kind: "parallel"
  branches: { body: FlowSubSchema; next?: Next }[]
  mode: "all"|"allSettled"|"race"|"any"
  onError?: FlowSubSchema
  // 输出端口: "result"
}

interface FlowSubFlowNode {
  category: "control"; kind: "subFlow"
  subFlowId: string
  inputs: Record<string, FlowSlot>
  next: Next                    // ★ 子流程返回后的后继
  onError?: FlowSubSchema
}
```

### 4.4 action 节点

所有 action 节点新增 `next`：

```ts
interface FlowSetVariableNode {
  category: "action"; kind: "setVariable"
  target: string; value: FlowSlot
  next?: Next
  onError?: FlowSubSchema
}

interface FlowNavigateNode {
  category: "action"; kind: "navigate"
  target: FlowSlot
  next?: Next         // ★ 编辑时校验必须为 {}（终点）
}

interface FlowCallFlowNode {
  category: "action"; kind: "callFlow"
  functionId: string; args: Record<string, FlowSlot>
  next?: Next
  onError?: FlowSubSchema
  // 输出端口: "result"
}

interface FlowHttpRequestNode {
  category: "action"; kind: "httpRequest"
  method: "GET"|"POST"|"PUT"|"DELETE"
  url: FlowSlot; headers?: Record<string, FlowSlot>; body?: FlowSlot
  next?: Next
  onError?: FlowSubSchema
  // 输出端口: "status","body","headers"
}

// dbQuery / dbInsert / dbUpdate / dbDelete 同样加 next
```

### 4.5 source 节点（不变）

```ts
interface FlowLiteralSourceNode {
  category: "source"; kind: "source"; from: "literal"
  value: unknown              // 输出端口 "value"
}
interface FlowContextSourceNode {
  category: "source"; kind: "source"; from: "context"
  path: string                // 输出端口 "value"
}
```

### 4.6 compute 节点（不变）

```ts
// 所有 compute 节点的输入插槽均为 FlowSlot（可内联值或 DataRef）
interface FlowMathNode     { category:"compute"; kind:"math";     op:"add"|"sub"|"mul"|"div"|"mod"|"pow"|"min"|"max"; a:FlowSlot; b:FlowSlot }
interface FlowCompareNode  { category:"compute"; kind:"compare";  op:"eq"|"neq"|"gt"|"gte"|"lt"|"lte"; a:FlowSlot; b:FlowSlot }
interface FlowLogicNode    { category:"compute"; kind:"logic";    op:"and"|"or"|"not"; operands:FlowSlot[] }
interface FlowConcatNode   { category:"compute"; kind:"concat";   parts:FlowSlot[]; separator?:string }
interface FlowFormatNode   { category:"compute"; kind:"format";   template:string; values:Record<string,FlowSlot> }
interface FlowGetNode      { category:"compute"; kind:"get";      object:FlowSlot; path:string }
// 输出端口统一为 "value"
```

---

---

## 五、上下文（不变）

与调度方式正交，C16 三分模型保持不变。详见引擎决策文档 engine:C16。

```ts
interface ContextFrame {
  in:   Readonly<Record<string, unknown>>
  state: StateProxy
  cap:  CapProxy
  pushScope(extraIn: Record<string, unknown>): ContextFrame
  pushIsolatedScope(opts: { in: Record<string, unknown>; state: Partial<StateProxy> }): ContextFrame
  snapshot(): ContextFrame
}
```

---

## 六、执行器

### 6.1 NodeExecutor（branch 字段移除）

```ts
interface NodeExecutor<T extends FlowNode = FlowNode> {
  readonly kind: string
  readonly outputPorts: string[]

  execute(
    node: T,
    resolvedInputs: Record<string, unknown>,
    ctxIn: Readonly<Record<string, unknown>>,
    ctxState: StateProxy,
    ctxCap: CapProxy
  ): Promise<NodeExecResult>
}

interface NodeExecResult {
  outputs?: Record<string, unknown>
  // ★ branch 字段移除 —— condition 分支走向由 FlowConditionNode.branches[label].next 决定
  error?: Error
}
```

### 6.2 注册与预组装（不变）

```ts
class NodeExecutorRegistry {
  private executors = new Map<string, NodeExecutor>()
  register(ex: NodeExecutor): void { this.executors.set(ex.kind, ex) }
  get(kind: string): NodeExecutor { ... }
}

function createClientFlowRunner(): FlowRunner { ... }  // 注册前端执行器
function createServerFlowRunner(): FlowRunner { ... }  // 注册后端执行器
```

---

## 七、FlowRunner 调度器

### 7.1 runGraph

```
runGraph(graph, frame):
    isSubgraph = "subEntry" in graph
    entryId = isSubgraph ? graph.subEntry : graph.entry
    exitId  = isSubgraph ? graph.subExit  : null

    node = graph.nodes[entryId]
    steps = 0
    outputCache = new Map()

    while node != null:
        if ++steps > MAX_STEPS: throw

        switch node.category:
            case "control":
                node = executeControl(node, graph.nodes, frame)
            case "action":
                executeAction(node, graph.nodes, frame)
                node = nextNode(node)
            default:
                throw

        if isSubgraph && node?.id == exitId:
            return collectExitOutputs()
        if !isSubgraph && node == null:
            return {}

function nextNode(node): FlowNode | null:
    next = node.next ?? {}
    return next[""] ? nodes[next[""]] : null
```

### 7.2 executeControl

```
executeControl(node, nodes, frame, cache):
    switch node.kind:
        case "condition":
            for [label, { condition, next }] of node.branches:
                if resolveSlot(condition, nodes, cache) == true:
                    return nodes[next]         // ★ 直接读 branches[label].next
            throw NoMatch

        case "while":
            while resolveSlot(node.condition, nodes, cache) == true:
                runGraph(node.body, frame.pushScope({}))
            return nodes[node.next[""]]        // ★ 直接读 node.next

        case "forEach":
            items = resolveSlot(node.collection, nodes, cache) as any[]
            for (item, idx) of items ?? []:
                scope = { [itemVar]: item }
                runGraph(node.body, frame.pushScope(scope))
            return nodes[node.next[""]]

        case "parallel":
            results = executeParallel(node, nodes, frame, cache)
            cache.set(node.id, { result: results })
            // 各分支汇入各自的 branch.next
            return nodes[node.next[""]]

        case "subFlow":
            subSchema = loadSubFlow(node.subFlowId)
            inputs = resolveSlots(node.inputs, nodes, cache)
            subFrame = frame.pushIsolatedScope({ in: inputs, state: {...} })
            outputs = runGraph(subSchema, subFrame)
            cache.set(node.id, outputs)
            return nodes[node.next[""]]
```

### 7.3 executeAction

```
executeAction(node, nodes, frame):
    executor = registry.get(node.kind)
    inputs = resolveSlots(getInputSlots(node), nodes, frame)
    result = await executor.execute(node, inputs, frame.in, frame.state, frame.cap)

    if result.error:
        if node.onError:
            errFrame = frame.pushScope({ in: { error, partialOutputs } })
            runGraph(node.onError, errFrame)
        else:
            throw result.error
        return
```

### 7.4 resolveSlot（Pull 核心 —— 重写）

```
resolveSlot(slot, nodes, cache):
    // ★ 不再扫描 dataEdges 数组 —— 直接判断 slot 本身
    if !isDataRef(slot):
        return slot                  // 内联字面量

    upstream = nodes[slot.nodeId]
    switch upstream.category:
        case "source":
            if upstream.from == "literal": return upstream.value
            return contextGet(upstream.path, frame.in, frame.state)

        case "compute":
            return executeCompute(upstream, nodes, frame)

        case "action":
            // ★ 惰性执行（不跟 next，只取输出）
            executeActionForPull(upstream, nodes, frame)
            return getNodeOutput(upstream)[slot.port]
```

### 7.5 executeCompute（不变）

```
executeCompute(node, nodes, frame):
    executor = registry.get(node.kind)
    inputs = resolveSlots(getInputSlots(node), nodes, frame)
    result = await executor.execute(node, inputs, {}, {}, {})
    // compute 不可见 in/state/cap

    if result.error: throw result.error
    return result.outputs?.["value"]
```

### 7.6 executeActionForPull（Pull 触发的懒惰执行）

```
executeActionForPull(node, nodes, frame):
    executor = registry.get(node.kind)
    inputs = resolveSlots(getInputSlots(node), nodes, frame)
    result = await executor.execute(node, inputs, frame.in, frame.state, frame.cap)

    if result.error:
        if node.onError:
            errFrame = frame.pushScope({ in: { error: result.error, partialOutputs: result.outputs ?? {} } })
            runGraph(node.onError, errFrame)
        else:
            throw result.error
        return

    // ★ 不沿 next 推进——Pull 只取数据
```

### 7.7 collectExitOutputs

```
collectExitOutputs(subExit):
    outputs = {}
    // 子图产出由 runGraph 返回值承载
    return outputs
```

### 7.8 执行保证

**Push 沿控制链推进**：entry 出发，沿 node.next 逐节点执行。source/compute 不在控制路径上，永不被 Push。

**Pull 惰性递归求值**：沿 DataRef 反向递归，遇到 source/compute/action 直接执行（含 action——未执行则执行，不跟 next）。Pull 不推进控制流，只取数据。

**设计约束**：多前序分支必须通过 parallel 包裹。不包裹时，Pull 可能在另一条控制链尚未执行的状态下触发 action——副作用时序由用户负责。

| 保证 | 说明 |
|------|------|
| 控制路径无环 | 编辑时 DFS node.next 引用链 |
| Pull 惰性求值 | source/compute/action 均参与，沿 DataRef 递归执行，不跟 next |
| 多前序用 parallel | parallel 保证所有分支执行后才收敛，跨分支 DataRef 安全 |

---

## 八、编辑时校验

| 校验项 | 规则 |
|--------|------|
| 控制路径无环 | entry DFS node.next 引用链。子图 subEntry 独立校验 |

| entry 约束 | 必须是 control 或 action |
| navigate 终点 | `next` 必须为 `{}` |
| condition 完整性 | branches 含判据 + next；若缺默认分支，须至少一个 cases 必真 |
| 子图完整性 | subEntry + subExit；subEntry 不被任何 next 指向；subExit next 为 {} |
| 引用完整性 | subFlowId 存在；path 首段 in/state；DataRef.nodeId 存在；DataRef.port 匹配上游 outputPorts |
| category 约束 | source/compute 无 next；action next 键数 ≤ 1；control next 键数匹配 kind |
| next 键约束 | 单出口用 `""`；condition 键匹配 branches 的 key；parallel 键为 `""` |

---

## 九、语义边界

保持不变：navigate=终点、onError=补偿、subFlow=隔离、flow 间正交。

---

## 十、关键决策取舍

| 决策 | 取舍 |
|------|------|
| **边消解为节点内嵌引用** | 边不是独立实体——控制流是"A 之后去 B"（A 的属性），数据流是"B 的输入来自 A"（B 的属性）。两层边数组消失，O(n) 扫描变为 O(1) 直接读取。代价：删除节点需扫描所有节点的 next 和 DataRef 做级联清理 |
| **next: Record<string, string>** | 统一单出口、多分支、终点。空 Record = 终止，`""` 键 = 默认后继。condition 的 cases + default + ControlEdge.branch 三合一为 `branches` |
| **DataRef { nodeId, port }** | 端口名天然跟随引用。resolveSlot 不需 fromPort 参数——DataRef 自带 |
| **异步在执行器内** | FlowRunner 只看到 Promise，不需要 latent/suspend/resume |
| **Pull 可递归执行 action** | DataRef 指向未缓存 action 时，Pull 递归执行它并写 cache。不跟 next——控制流推进是 Push 的专属职责。多前序场景下 Pull 可能触发另一条控制链上的懒惰执行，副作用时序由用户负责 |
| **parallel 帧快照** | all/allSettled snapshot 隔离，race/any 共享帧 |
| **onError=补偿** | 注入 partialOutputs 供回滚，执行后终止。Saga 模式 |
| **navigate** | 切换 Scene 后 context 失效，但不强制 next 为空——用户自行判断后续节点是否在有效上下文中运行 |
| **上下文三分** | 与调度正交。cap 仅 action 可见，值节点只读 {in,state} |
| **compute 不可见 in/state/cap** | 纯函数——输入完全来自 DataRef 或内联值 |
| **NodeExecResult 无 branch** | condition 分支走向由 FlowConditionNode.branches[label].next 决定，执行器只需产出 outputs |

---
