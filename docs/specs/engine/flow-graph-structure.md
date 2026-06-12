# FlowSchema 完整数据结构与调度设计

## 关联决策

- **engine:A5** — FlowSchema 是 BanvasGL 的内置流程控制子系统（过程式 AST + Push-Pull 调度）
- **engine:C15** — 图结构契约（节点分类 + ControlEdge/DataEdge 二分边 + 开放 DAG + 可调用子图 + 插槽混合模型）
- **engine:C16** — 挂载点 ⇒ 上下文契约（资源来向三分 `in / state / cap`）
- **engine:C17** — 语句层节点契约（控制流/动作两分 · 节点全集 · 错误消费 · 语义边界）
- **engine:M15** — Push-Pull 混合调度机制

---

## 一、节点与边

### 1.1 顶层 Schema

```ts
interface FlowSchema {
  version: "2.0.0";
  entry: string;
  nodes: Record<string, FlowNode>;
  controlEdges: FlowControlEdge[];
  dataEdges: FlowDataEdge[];
}

interface FlowSubSchema {
  subEntry: string;
  subExit: string;
  nodes: Record<string, FlowNode>;
  controlEdges: FlowControlEdge[];
  dataEdges: FlowDataEdge[];
  params?: { name: string; type: "string"|"number"|"boolean"|"object"|"array" }[];
}
```

### 1.2 边

```ts
interface FlowControlEdge {
  id: string;
  from: string;
  to: string;
  branch?: string;    // condition 分支标签
}

interface FlowDataEdge {
  id: string;
  fromNode: string;
  fromPort: string;   // 源节点输出端口名
  toNode: string;
  toSlot: string;     // 目标节点输入插槽名
}
```

ControlEdge 只管执行顺序，不携带业务数据。DataEdge 只连端口到插槽。同一对节点可同时有两条边——ControlEdge 串执行，DataEdge 传值。Blueprints 的 exec + data 双线已验证此模式二十年。

### 1.3 节点

```ts
type FlowNode = { id: string } & (
  FlowControlNode | FlowActionNode | FlowSourceNode | FlowComputeNode
);
```

| category | 控制边入 | 控制边出 | 数据边入 | 数据边出 | 副作用 | 调度 |
|----------|:---:|:---:|:---:|:---:|:---:|------|
| control | >=0 | >=1(多分支) | >=0 | 0 | ❌ | Push |
| action | >=0 | <=1(navigate=0) | >=0 | >=0 | ✅ | Push |
| source | 0 | 0 | 0 | >=0 | ❌ | Pull |
| compute | 0 | 0 | >=0 | >=0 | ❌ | Pull |

输出端口约定: source/compute 统一为 `"value"`。action 由执行器定义命名端口(如 dbQuery 的 `"rows"`/`"count"`)。

#### control 节点

```ts
interface FlowConditionNode {
  category: "control"; kind: "condition";
  cases: { slot: FlowSlot; label: string }[];
  default?: string;
  onError?: FlowSubSchema;
}

interface FlowWhileNode {
  category: "control"; kind: "while";
  condition: FlowSlot;     // 判据插槽
  body: FlowSubSchema;
  onError?: FlowSubSchema;
}

interface FlowForEachNode {
  category: "control"; kind: "forEach";
  collection: FlowSlot;
  itemVar?: string;        // 默认 "item"
  indexVar?: string;       // 默认 "index"
  body: FlowSubSchema;
  onError?: FlowSubSchema;
}

interface FlowParallelNode {
  category: "control"; kind: "parallel";
  branches: FlowSubSchema[];
  mode: "all"|"allSettled"|"race"|"any";
  onError?: FlowSubSchema;
  // 输出端口: "result"
}

interface FlowSubFlowNode {
  category: "control"; kind: "subFlow";
  subFlowId: string;
  inputs: Record<string, FlowSlot>;
  onError?: FlowSubSchema;
  // 输出端口: 由被调子图连入 subExit 的 DataEdge.fromPort 定义
}
```

#### action 节点

```ts
interface FlowSetVariableNode {
  category: "action"; kind: "setVariable";
  target: string;    // "state.view.<id>.<prop>"|"state.page.<key>"|"state.app.<key>"|"state.flow.<key>"
  value: FlowSlot;
  onError?: FlowSubSchema;
}

interface FlowNavigateNode {
  category: "action"; kind: "navigate";
  target: FlowSlot;
  // 约束: 控制边出度必须为 0
}

interface FlowCallFlowNode {
  category: "action"; kind: "callFlow";
  functionId: string;
  args: Record<string, FlowSlot>;
  onError?: FlowSubSchema;
  // 输出端口: "result"
}

interface FlowHttpRequestNode {
  category: "action"; kind: "httpRequest";
  method: "GET"|"POST"|"PUT"|"DELETE";
  url: FlowSlot;
  headers?: Record<string, FlowSlot>;
  body?: FlowSlot;
  onError?: FlowSubSchema;
  // 输出端口: "status","body","headers"
}

interface FlowDbQueryNode {
  category: "action"; kind: "dbQuery";
  collection: string; filter: FlowSlot;
  onError?: FlowSubSchema;
  // 输出端口: "rows","count"
}

interface FlowDbInsertNode {
  category: "action"; kind: "dbInsert";
  collection: string; document: FlowSlot;
  onError?: FlowSubSchema;
  // 输出端口: "id"
}

interface FlowDbUpdateNode {
  category: "action"; kind: "dbUpdate";
  collection: string; filter: FlowSlot; update: FlowSlot;
  onError?: FlowSubSchema;
  // 输出端口: "matchedCount","modifiedCount"
}

interface FlowDbDeleteNode {
  category: "action"; kind: "dbDelete";
  collection: string; filter: FlowSlot;
  onError?: FlowSubSchema;
  // 输出端口: "deletedCount"
}
```

#### source 节点

```ts
interface FlowLiteralSourceNode {
  category: "source"; kind: "source"; from: "literal";
  value: unknown;
}

interface FlowContextSourceNode {
  category: "source"; kind: "source"; from: "context";
  path: string;        // 首段限定 "in"|"state"
}
```

#### compute 节点

```ts
interface FlowMathNode     { category:"compute"; kind:"math";     op:"add"|"sub"|"mul"|"div"|"mod"|"pow"|"min"|"max"; a:FlowSlot; b:FlowSlot; }
interface FlowCompareNode  { category:"compute"; kind:"compare";  op:"eq"|"neq"|"gt"|"gte"|"lt"|"lte"; a:FlowSlot; b:FlowSlot; }
interface FlowLogicNode    { category:"compute"; kind:"logic";    op:"and"|"or"|"not"; operands:FlowSlot[]; }
interface FlowConcatNode   { category:"compute"; kind:"concat";   parts:FlowSlot[]; separator?:string; }
interface FlowFormatNode   { category:"compute"; kind:"format";   template:string; values:Record<string,FlowSlot>; }
interface FlowGetNode      { category:"compute"; kind:"get";      object:FlowSlot; path:string; }
```

### 1.4 FlowSlot

```ts
type FlowSlot = unknown;
// 取值规则(互斥): DataEdge(toSlot指向该slot)存在→Pull该数据边; 否则→取内联值
```

---

## 二、上下文

### 2.1 设计原则

调度架构从 SESE 改为 Push-Pull + 开放 DAG，不影响上下文模型。C16 的三分模型（`in`/`state`/`cap`）与调度方式正交——上下文回答"节点执行时能看见什么数据"，与 Push-Pull 如何遍历节点无关。

### 2.2 ContextFrame

```ts
interface ContextFrame {
  in:   Readonly<Record<string, unknown>>;
  state: StateProxy;
  cap:  CapProxy;

  pushScope(extraIn: Record<string, unknown>): ContextFrame;
  pushIsolatedScope(opts: { in: Record<string, unknown>; state: Partial<StateProxy> }): ContextFrame;
  snapshot(): ContextFrame;  // 深拷贝 state，用于 parallel all/allSettled
}
```

### 2.3 StateProxy

```ts
interface StateProxy {
  view: Record<string, Record<string, unknown>>;  // state.view.<viewId>.<prop>
  page: Record<string, unknown>;                   // state.page.<key>
  app:  Record<string, unknown>;                   // state.app.<key>
  flow: Record<string, unknown>;                   // state.flow.<key>
}
```

setVariable 只能写 `state.*`，值节点只能读 `{in, state}`。

### 2.4 CapProxy

```ts
// 前端
interface CapProxy {
  navigate(target: string, params?: Record<string, unknown>): Promise<void>;
  callFlow(functionId: string, args: Record<string, unknown>): Promise<unknown>;
  persist(key: string, value: unknown): Promise<void>;
}

// 后端
interface CapProxy {
  db: {
    query(coll: string, filter: object): Promise<{rows:unknown[]; count:number}>;
    insert(coll: string, doc: object): Promise<{id:string}>;
    update(coll: string, filter: object, update: object): Promise<{matched:number; modified:number}>;
    delete(coll: string, filter: object): Promise<{deleted:number}>;
  };
  httpClient: {
    request(method:string, url:string, headers?:object, body?:unknown): Promise<{status:number; body:unknown; headers:object}>;
  };
}
```

cap 仅 action 节点执行器可见。source/compute 看不见 cap（C16 约束三）。

### 2.5 挂载点描述符（C16，不变）

| 挂载点 | `in` | `state` 可达层次 | `cap` |
|--------|------|-----------------|------|
| `View.events.*` | 事件对象 `{x,y,target,...}` | view/page/app | 前端 |
| `View.lifetimes.*` | 空 | view/page/app | 前端 |
| `Scene.lifetimes.*` | onLoad: navigate params; 其余空 | page/app | 前端 |
| 云函数入口 | 调用 args | flow | 后端 |

### 2.6 作用域帧管理

```
pushScope(extraIn):
  → 新帧: { in: {...parent.in, ...extraIn}, state: parent.state, cap: parent.cap }
  → forEach body / while body / onError 使用

pushIsolatedScope({in, state}):
  → 新帧: { in: opts.in, state: opts.state, cap: parent.cap }
  → subFlow 专有: 不继承外层 in/state

snapshot():
  → 深拷贝 state，用于 parallel all/allSettled 分支隔离
```

---

## 三、执行器

### 3.1 NodeExecutor

```ts
interface NodeExecutor<T extends FlowNode = FlowNode> {
  readonly kind: string;
  readonly outputPorts: string[];

  execute(
    node: T,
    resolvedInputs: Record<string, unknown>,
    ctxIn: Readonly<Record<string, unknown>>,
    ctxState: StateProxy,
    ctxCap: CapProxy
  ): Promise<NodeExecResult>;
}

interface NodeExecResult {
  outputs?: Record<string, unknown>;
  branch?: string;     // condition 命中分支
  error?: Error;
}
```

异步约定: 执行器内部处理所有异步。FlowRunner 只看到 Promise，不区分同步/异步节点——不需要 latent/suspend/resume 机制。

### 3.2 source 执行器

```ts
const sourceExecutor: NodeExecutor<FlowSourceNode> = {
  kind: "source", outputPorts: ["value"],
  async execute(node, _inputs, ctxIn, ctxState) {
    if (node.from === "literal") return { outputs: { value: node.value } };
    return { outputs: { value: contextGet(node.path, ctxIn, ctxState) } };
  }
};

function contextGet(path: string, in_: Record<string,unknown>, state: StateProxy): unknown {
  const [root, ...rest] = path.split(".");
  if (root === "in")  return deepGet(in_, rest);
  if (root === "state") {
    const [layer, ...rest2] = rest;
    return deepGet((state as any)[layer], rest2);
  }
  throw new Error(`Invalid context path: ${path}`);
}
```

### 3.3 compute 执行器（math 为例）

```ts
const mathExecutor: NodeExecutor<FlowMathNode> = {
  kind: "math", outputPorts: ["value"],
  async execute(node, inputs) {
    const a = inputs.a as number, b = inputs.b as number;
    const ops: Record<string,(a:number,b:number)=>number> = {
      add:(a,b)=>a+b, sub:(a,b)=>a-b, mul:(a,b)=>a*b, div:(a,b)=>a/b,
      mod:(a,b)=>a%b, pow:(a,b)=>a**b, min:Math.min, max:Math.max
    };
    return { outputs: { value: ops[node.op](a,b) } };
  }
};
```

### 3.4 action 执行器（dbQuery 为例）

```ts
const dbQueryExecutor: NodeExecutor<FlowDbQueryNode> = {
  kind: "dbQuery", outputPorts: ["rows","count"],
  async execute(node, inputs, _in, _state, cap) {
    const result = await cap.db.query(node.collection, inputs.filter as object);
    return { outputs: { rows: result.rows, count: result.count } };
  }
};
```

### 3.5 注册与预组装

```ts
class NodeExecutorRegistry {
  private executors = new Map<string, NodeExecutor>();
  register(ex: NodeExecutor): void { this.executors.set(ex.kind, ex); }
  get(kind: string): NodeExecutor {
    const ex = this.executors.get(kind);
    if (!ex) throw new UnknownNodeKindError(kind);
    return ex;
  }
}

// 前端
function createClientFlowRunner(): FlowRunner {
  const reg = new NodeExecutorRegistry();
  for (const ex of [sourceExecutor, mathExecutor, compareExecutor, logicExecutor,
    concatExecutor, formatExecutor, getExecutor, setVariableExecutor,
    navigateExecutor, callFlowExecutor]) { reg.register(ex); }
  return new FlowRunner(reg);
}

// 后端
function createServerFlowRunner(): FlowRunner {
  const reg = new NodeExecutorRegistry();
  for (const ex of [sourceExecutor, mathExecutor, compareExecutor, logicExecutor,
    concatExecutor, formatExecutor, getExecutor, setVariableExecutor,
    httpRequestExecutor, dbQueryExecutor, dbInsertExecutor,
    dbUpdateExecutor, dbDeleteExecutor]) { reg.register(ex); }
  return new FlowRunner(reg);
}
```

---

## 四、FlowRunner 调度器

### 4.1 核心类型

```ts
class FlowRunner {
  private registry: NodeExecutorRegistry;
  private static MAX_STEPS = 1000;

  constructor(registry: NodeExecutorRegistry) { this.registry = registry; }

  async run(graph: FlowSchema, mountCtx: MountContext): Promise<void> {
    const frame = ContextFrame.fromMount(mountCtx);
    await this.runGraph(graph, frame);
  }
}
```

### 4.2 runGraph（顶层 + 子图共用）

```
runGraph(graph, frame):
    isSubgraph = "subEntry" in graph
    entryId = isSubgraph ? graph.subEntry : graph.entry
    exitId  = isSubgraph ? graph.subExit  : null

    node = graph.nodes[entryId]
    steps = 0
    outputCache = new Map<string, Record<string, unknown>>()

    while node != null:
        if ++steps > MAX_STEPS: throw MaxStepsExceeded

        switch node.category:
            case "control":
                node = executeControl(node, graph, frame, outputCache)
            case "action":
                executeAction(node, graph, frame, outputCache)
                node = nextByControlEdge(node, graph)
            default:
                throw UnexpectedCategory  // source/compute 不应被 Push

        if isSubgraph && node?.id == exitId:
            return collectExitOutputs(graph, outputCache)
        if !isSubgraph && node == null:
            return {}

    return {}
```

### 4.3 executeControl

```
executeControl(node, graph, frame, cache):
    switch node.kind:
        case "condition":
            for case in node.cases:
                if resolveSlot(case.slot) == true:
                    return followControlEdge(node, graph, case.label)
            return followControlEdge(node, graph, node.default ?? "default")

        case "while":
            while resolveSlot(node.condition) == true:
                runGraph(node.body, frame.pushScope({}))
            return followControlEdge(node, graph)

        case "forEach":
            items = resolveSlot(node.collection) as any[]
            for (item, idx) in enumerate(items ?? []):
                scope = { [node.itemVar ?? "item"]: item }
                if node.indexVar: scope[node.indexVar] = idx
                runGraph(node.body, frame.pushScope(scope))
            return followControlEdge(node, graph)

        case "parallel":
            results = executeParallel(node, graph, frame, cache)
            cache.set(node.id, { result: results })
            return followControlEdge(node, graph)

        case "subFlow":
            subSchema = loadSubFlow(node.subFlowId)
            inputs = resolveSlots(node.inputs)
            subFrame = frame.pushIsolatedScope({
                in: inputs, state: { view:{}, page:{}, app:{}, flow:{} }
            })
            outputs = runGraph(subSchema, subFrame)
            cache.set(node.id, outputs)
            return followControlEdge(node, graph)
```

### 4.4 executeAction

```
executeAction(node, graph, frame, cache):
    executor = registry.get(node.kind)
    inputs = resolveSlots(node.inputSlots)

    result = await executor.execute(node, inputs, frame.in, frame.state, frame.cap)

    if result.error:
        if node.onError:
            errFrame = frame.pushScope({
                in: { error: result.error, partialOutputs: result.outputs ?? {} }
            })
            runGraph(node.onError, errFrame)
        else:
            throw result.error
        return  // onError 是补偿，流程终止

    cache.set(node.id, result.outputs)
```

### 4.5 executeParallel

```
executeParallel(node, graph, frame, cache):
    makeFrame = (mode == "all" || mode == "allSettled")
        ? () => frame.snapshot()
        : () => frame

    tasks = branches.map(b => runGraph(b, makeFrame()))

    switch mode:
        case "all":       return Promise.all(tasks)
        case "allSettled": return (await Promise.allSettled(tasks)).map(...)
        case "race":      return Promise.race(tasks)
        case "any":       return Promise.any(tasks)
```

### 4.6 resolveSlot（Pull 核心）

```
resolveSlot(slot, graph, cache, caller):
    if !caller: return slot  // 顶层传入的纯内联值

    dataEdge = graph.dataEdges.find(e =>
        e.toNode == caller.nodeId && e.toSlot == caller.slotName
    )
    if !dataEdge: return slot  // 无数据边 → 取内联值

    upstream = graph.nodes[dataEdge.fromNode]
    switch upstream.category:
        case "source":
            if upstream.from == "literal": return upstream.value
            return contextGet(upstream.path, frame.in, frame.state)

        case "compute":
            if cache.has(upstream.id): return cache.get(upstream.id)["value"]
            return executeCompute(upstream, graph, cache)

        case "action":
            outputs = cache.get(upstream.id)
            if !outputs: throw ActionNotExecuted
            return outputs[dataEdge.fromPort]
```

### 4.7 executeCompute

```
executeCompute(node, graph, cache):
    if cache.has(node.id): return cache.get(node.id)["value"]

    executor = registry.get(node.kind)
    inputs = resolveSlots(node.inputSlots)
    result = await executor.execute(node, inputs, {}, {}, {})
    // compute 节点不可见 in/state/cap —— 输入完全来自 DataEdge 或内联值

    if result.error: throw result.error
    cache.set(node.id, result.outputs ?? {})
    return result.outputs?.["value"]
```

### 4.8 collectExitOutputs

```
collectExitOutputs(sub, cache):
    outputs = {}
    for edge in sub.dataEdges:
        if edge.toNode == sub.subExit:
            upstreamOut = cache.get(edge.fromNode)
            if upstreamOut && edge.fromPort in upstreamOut:
                outputs[edge.fromPort] = upstreamOut[edge.fromPort]
    return outputs
```

### 4.9 三个不变量

| 不变量 | 保证方式 |
|--------|----------|
| 控制路径无环 | 编辑时 DFS 校验 ControlEdge 拓扑 |
| 数据边 forward-reference | 编辑时: DataEdge.fromNode 控制序 <= toNode |
| Pull 不遇未执行 action | forward-reference 推论——被引用 action 必已 Push 执行 |

---

## 五、编辑时校验

| 校验项 | 规则 |
|--------|------|
| 控制路径无环 | entry DFS ControlEdge。子图 subEntry 独立校验 |
| 数据边 forward-reference | fromNode 拓扑序 <= toNode(source/compute 天然通过) |
| entry 约束 | 必须是 control 或 action |
| navigate 终点 | 控制边出度必须为 0 |
| 子图完整性 | subEntry+subExit; subEntry 控制入度0; subExit 控制出度0 |
| 引用完整性 | callFlow/subFlow ID存在; path 首段 in/state; branch 匹配 case; fromPort 匹配输出端口 |
| category 约束 | source/compute 无控制边; action<=1 控制出边; control 出边匹配 kind |

---

## 六、语义边界

| 边界 | 定义 |
|------|------|
| navigate=终点 | 切换 Scene 后 context 失效，控制边出度 0 |
| onError=补偿 | 注入 {error, partialOutputs}，执行后终止 |
| subFlow=隔离 | 不穿透外层 state，显式 inputs |
| flow 间正交 | 独立执行，不通信不等事件 |

---

## 七、数据迁移（1.0.0 → 2.0.0）

1. 顶层 `exit` 移除——控制边出度 0 即终点
2. `FlowValueNode` → `FlowSourceNode(from:"context")`
3. `FlowValue.literal` → `FlowSourceNode(from:"literal")` 或插槽内联
4. `FlowValue.dataRef/pageDataRef/eventArg` → `FlowSourceNode(from:"context")` + path
5. `FlowValue.nodeRef` → 显式 DataEdge（fromPort/toSlot）
6. `FlowEdge` 拆分：`branch`/`toParam` 判断 → 无 port → ControlEdge；有 port → DataEdge
7. `FlowEdge.branch: "error"` → action 的 `onError: FlowSubSchema`
8. 七个废除节点按 C17 约束六迁移
9. 节点移除 `x`/`y`，增加 `category`

---

## 八、关键决策取舍

| 决策 | 取舍 |
|------|------|
| **二分边** | ControlEdge 不携带数据，DataEdge 不决定执行顺序。Blueprints exec+data 二十年验证。统一边是旧 SESE 遗留 |
| **异步在执行器内** | FlowRunner 只看到 Promise，不需要 latent/suspend/resume。牺牲多链并发，换极简主循环 |
| **source/compute Pull时求值** | 不在控制路径的节点永不被 Push。cache 防重复计算 |
| **parallel 帧快照** | all/allSettled 分支 snapshot 隔离，race/any 共享帧。不限制重叠写入——编排问题 |
| **onError=补偿** | 注入 partialOutputs 供回滚，执行后终止。Saga 模式 |
| **navigate=终点** | context 失效，出度强制 0。跨页面通信属 App 层迭代 |
| **上下文三分** | 与调度正交。cap 仅 action 可见，值节点只读 {in,state} |
| **compute 不可见 in/state/cap** | 纯函数——输入完全来自 DataEdge 或内联值 |
| **cache 按节点 ID** | 简单有效。compute 幂等缓存。action 不重复执行 |
