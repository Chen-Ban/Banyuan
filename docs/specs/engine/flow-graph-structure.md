# FlowSchema 图结构契约 — 实施方案

## 关联决策

- **engine:C15** — FlowSchema 图结构契约（节点分类 + 统一边 + SESE 结构 + 插槽混合模型）【本方案主决策】
- **engine:A5** — FlowSchema 顶层定义（有向图形态的过程式 AST）【上位本质定义】
- **engine:C7** — 值解析协议（resolveValue）【随值节点两亚种收敛与插槽模型演进至 2.0.0】
- **engine:C16** — 挂载点 ⇒ 上下文契约（资源来向三分 `in / state / cap`）【源节点 `from:'context'` 的 path 解析目标】
- **engine:C17** — 语句层节点契约（控制流/动作两分 · 节点全集 · 错误消费）【语句层节点的语义两分、目标态全集、condition 多分支、节点 onError 子图消费错误、废除项】
- **engine:M19 / M19a** — NodeView 内联参数编辑 / NodeKindDescriptor【外壳侧机制实现】
- **schema:mechanism M（数据迁移）** — FlowSchema 嵌套数据随版本演进需迁移
- **上游依赖**：M14/M15/M16（流程执行）、C5/C6（执行环境与执行器）

---

## 目标

将 C15 固化的四项契约落到 `@banyuan/banvasgl` 的 `src/flow/` 类型层与执行层：

1. 值节点**收敛为两亚种**：**源节点（SourceNode）**（合并字面量与取值，用 `from` 判别）+ **计算节点（ComputeNode）**，删除旧的 3 种引用节点（variable/pageVar/eventParam）
2. 边保持**单一 `FlowEdge`**（拓扑即顺序、边上流值）：FlowSchema 升级为显式 `entry + exit` 的单入口单出口（SESE）结构后，控制与数据合为一种边，多输入/多输出靠 `fromPort/toPort` 定位，多出口靠 `branch` 区分（见第 3 节）
3. 节点参数统一为**插槽（slot）混合模型**：默认内联 `FlowValue`，一条边（`toPort` 指向该 slot）接入时边获胜（互斥）
4. `FlowNode` 移除 `x?/y?`（对齐 A5「职责回归」）

并提供一条**安全迁移路径**，把已持久化的 `1.0.0` schema 升级到 `2.0.0`，做到运行态、外壳态、AI 生成端三方同步。

---

## 现状分析

`packages/banvasgl/src/flow/types/` 当前形态：

- `schema.ts`：`FlowNode = { id; x?; y? } & (FlowActionNode | FlowValueNode)`；`FlowEdge { id; from; to; branch?: 'true'|'false'|'error'; toParam?: string }`——控制流与数据流**混在一条边类型上**，靠 `branch`/`toParam` 两个可选字段隐式区分。
- `schema.ts`：`FlowValueNode = FlowVarNode | FlowPageVarNode | FlowEventParamNode`——3 种**纯引用**节点，无计算能力。三者实质只是「从不同作用域取值」的三个变体，应收敛为单一**源节点 `from:'context'`** + path 首段表作用域。
- `values.ts`：`FlowValue` 有 5 种 kind（literal / dataRef / pageDataRef / eventArg / nodeRef）。其中 literal → 源节点 `from:'literal'`；dataRef / pageDataRef / eventArg → 源节点 `from:'context'`（与三种引用节点**语义重叠**，旧 R1 冗余，现被 `from` 维度收编）；nodeRef → 显式化为一条连接上游节点输出口的边（统一边的 fromPort）。
- 动作节点参数直接内联 `FlowValue`（如 `FlowSetVariableNode.value: FlowValue`、`FlowSetDataNode.value: FlowValue`、`FlowForEachNode.collection: FlowValue`）——已是「插槽默认内联」雏形，但缺少「数据边覆盖」的互斥规则与显式 slot 标识。

三个结构缺陷（对应 C15 反例）：

- **P0**：控制/数据靠 `branch`/`toParam` 两个可选字段隐式区分，外壳/执行器需靠字段推断，数据依赖易被误判。目标态：SESE 结构下控制与数据合为一种边，拓扑即顺序、边上流值（第 3 节）。
- **R1**：内联 `FlowValue` 与值节点是两套等价机制，职责重叠，无规则界定何时用哪个。
- **R3**：`branch: 'error'` 把错误通道与 true/false 分支挤在同一字段，语义混杂。目标态：错误处理收进节点的 `onError` 内嵌子图，不再占用边上字段（第 5 节）。

---

## 目标类型设计（schema 版本 → `2.0.0`）

### 1. 值节点收敛为「源节点 + 计算节点」两亚种

`schema.ts` 删除三种引用节点，改为**源节点（字面量 ∪ 取值，`from` 判别）** + **计算节点**两亚种。二者均**纯**（无副作用）。

```ts
/**
 * 源节点：纯数据源，无输入、单输出。合并「字面量」与「取值」两个维度，用 from 判别。
 * - from:'literal' —— 内联任意 JSON 值（类型差异交给外壳控件，schema 层单一 value 字段）
 * - from:'context' —— 从注入的上下文对象按 path 取值（path 首段为 in/state，C16 资源来向三分，无需 scope/ScopeRef）
 */
export interface FlowLiteralSourceNode {
  kind: "source";
  from: "literal";
  value: unknown; // 任意 JSON：string | number | boolean | null | array | object
}
export interface FlowContextSourceNode {
  kind: "source";
  from: "context";
  path: string; // 首段限定 in/state（C16）：如 'state.page.user.name' / 'in.0' / 'state.view.btn1.text'
}
export type FlowSourceNode = FlowLiteralSourceNode | FlowContextSourceNode;

/** 计算节点：纯函数式，输入插槽 → 单一输出。对标 Blender Math/Mix 节点 */
export interface FlowMathNode {
  kind: "math";
  op: "add" | "sub" | "mul" | "div" | "mod" | "pow" | "min" | "max";
  a: FlowSlot; // 插槽：默认内联 FlowValue，可被一条边（toPort 指向该 slot）覆盖
  b: FlowSlot;
}
export interface FlowConcatNode {
  kind: "concat";
  parts: FlowSlot[]; // 变长输入插槽
  separator?: string;
}
export interface FlowFormatNode {
  kind: "format";
  template: string; // 如 "共 {0} 件，合计 {1} 元"
  args: FlowSlot[];
}
export interface FlowCompareNode {
  kind: "compare";
  left: FlowSlot;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  right: FlowSlot;
}
export interface FlowLogicNode {
  kind: "logic";
  op: "and" | "or" | "not";
  operands: FlowSlot[];
}

export type FlowComputeNode =
  | FlowMathNode
  | FlowConcatNode
  | FlowFormatNode
  | FlowCompareNode
  | FlowLogicNode;

export type FlowValueNode =
  | FlowSourceNode // 源节点（字面量 ∪ 取值）
  | FlowComputeNode; // 计算节点
```

> **为何字面量不按类型拆节点？** string/number/boolean/array/object 的差异只是输入控件的事（M19 外壳层），schema 层单一 `value: unknown` 即可承载，拆分徒增节点种类。**为何取值不包 ScopeRef？** 上下文已是单一注入对象，`path` 首段（C16 资源来向三分中的 `in`/`state`，`state` 下再分 view/page/app/flow 层次）即定位，额外包装冗余。计算节点初始集合（math/concat/format/compare/logic）是**可扩展完备集**的起点；`compare`/`logic` 落地后，`FlowCondition`（values.ts）可逐步用 compare 计算节点替代，统一为「条件 = 产出 boolean 的值节点」。

### 2. 插槽混合模型

新增 `FlowSlot` 类型，统一所有节点输入参数的取值。**互斥规则在结构上无法表达"并存"**——slot 只持有内联默认值，是否被数据边覆盖由 edges 决定，运行时裁决。

```ts
/**
 * 参数插槽：默认持有内联 FlowValue。
 * 当存在一条边（toPort 指向该节点的该 slot）连入时，运行时忽略内联值，取该边上游输出。
 * 内联值与连线互斥——schema 中不存在“既写内联又标记已连线”的字段，连线信息只存在于 edges。
 */
export type FlowSlot = FlowValue;
```

> 设计取舍：`FlowSlot` 直接复用 `FlowValue`（内联默认），**不在 slot 内嵌“是否已连线”标志**。“是否被边覆盖”是 edges 的拓扑事实，唯一事实源在 `edges`，避免 slot 与 edge 双写导致不一致。外壳层渲染时通过“该 slot 是否有一条 toPort 指向它的边接入”决定显示内联控件还是连线（M19）。

现有动作节点的 `FlowValue` 字段语义升级为 `FlowSlot`（值不变，仅语义/命名澄清），并为每个参数赋予稳定的 **slot 标识**（即字段名，边的 toPort 用它定位目标插槽）。

### 3. 统一一种边（拓扑即顺序，边上流值）

**设计转向（取代早期"三型边联合"）：** 早期方案曾把边按职责拆成 ControlEdge / DataEdge / ErrorEdge 三型联合，根因是当时 FlowSchema **只有入口、没有出口**，执行路径不确定——调度只能靠"控制边推进 + 数据边拉取"两套语义拼出顺序与依赖，于是边被迫分型。一旦 FlowSchema 升级为**显式 entry + exit 的单入口单出口（SESE）结构**（见第 7 节），执行路径就由拓扑唯一确定：FlowRunner 从 entry 沿边线性遍历到 exit，**边既表达执行顺序、又承载流动的值**，控制与数据合一，无需再分型。

`schema.ts` 收敛为**单一边类型**：

```ts
/**
 * 统一边：表达「from 节点执行后流向 to 节点」，同时承载控制顺序与数据传递。
 * - 拓扑即顺序：FlowRunner 沿 from→to 推进，无需 ControlEdge 标记"这是执行边"。
 * - 边上流值：from 的某个输出口流到 to 的某个输入口，无需 DataEdge 单独表达依赖。
 * - 分支靠 branch 标签：condition/parallel 等多出口节点用 branch 区分走哪条边。
 */
export interface FlowEdge {
  id: string;
  from: string; // 上游节点 id
  to: string; // 下游节点 id
  /**
   * 源输出口 / 目标输入口（定位「from 的哪个输出 → to 的哪个输入」）。
   * 纯控制流推进（无数据传递）时两者皆省略；多输入/多输出节点用其精确定位。
   */
  fromPort?: string;
  toPort?: string;
  /**
   * 分支标签：多出口节点（condition/parallel）用它区分走哪条出边。
   * - true/false 或 condition 的具名 case 出口 —— 命中分支
   * - default —— 普通顺序后继（单出口节点省略）
   * - 其余具名出口用于 parallel 的分支编号等
   * 注：循环体（while/forEach）、异常处理（onError）不再用 branch 圈定，
   *     而是封进复合节点内嵌的 SESE 子图（见第 5 节复合节点 / 第 7 节）。
   */
  branch?: "true" | "false" | "default" | string;
}
```

> **为什么不再有 ErrorEdge / 跨节点循环回边：** 错误处理与循环体都已**封进复合节点内嵌的 SESE 子图**（第 5 节）——异常处理是节点的 `onError: FlowSubSchema`，循环体是 `while`/`forEach` 的 `body: FlowSubSchema`，递归是 `subFlow` 的子图。主链路上**不存在跨节点的 error 边、不存在回流到循环头的环边**，每张（子）图都是从 entry 到 exit 的有向无环线性路径。这让"边只有一种、拓扑即顺序、图永远无环"三件事同时成立。

### 4. 移除节点坐标

```ts
// FlowNode 不再带 x?/y? 坐标。完整的四分判别（control/action/source/compute）见第 5 节末
// 「统一四分顶层判别」——此处仅强调：节点信封不含坐标，画布状态由外壳层独立持久化。
```

`x?/y?` 删除。画布坐标由外壳层（M19a 的 NodeKindDescriptor / 画布视图状态）独立持久化，与 FlowSchema 分离存储。

### 5. 语句层节点全集与重整（C17）

语句层节点（非值节点）以「会不会产生副作用」为唯一判据显式两分（`control` / `action`）。注意 `category` 判别字段的**全集是四分**——叠加第 1 节的值节点（`source` / `compute`）后，全节点统一为 `category: 'control' | 'action' | 'source' | 'compute'`（依据见 C17 约束一）；本节只覆盖语句层的 control/action 两类，source/compute 见第 1 节。目标态全集与旧 19 节点的对应见下。

```ts
/** 语句层节点顶层判别：control（无副作用）vs action（有副作用） */
export type FlowStatementNode =
  | (FlowControlNode & { category: "control" })
  | (FlowActionNode & { category: "action" });

/** 控制流节点（5）：condition / while / forEach / parallel / subFlow（无 return：return = 连一条边到所在（子）图的 exit；无 delay：时间流逝是宿主运行时能力，非图层可编排语义，见 C17 约束九） */
/** 动作节点（8）：setVariable / navigate / callFlow / httpRequest / dbQuery / dbInsert / dbUpdate / dbDelete（无 animate：页面内表现统一写 state、渲染层下一帧消费，前端副作用只保留跨页面/跨会话能力，见 C17 约束九） */
```

> `FlowStatementNode` 只是四分全集里**在主控制流上被调度推进**的那两类（control + action，按「有无副作用」切分）；另两类 source / compute 是**被下游拉取求值**的纯值节点（第 1 节已定义，按「有无输入」切分）。统一边后（第 3 节），控制与数据合为一种边：节点间沿边推进即控制顺序，边上所携值即数据依赖。四类合起来的统一顶层判别 `FlowNode`（带 `category` 字段）见本节末「统一四分顶层判别」。下文先补齐各控制流/动作节点字段，再给 parallel、8 动作节点、四分总览。

**condition 升级为多分支（判据外置为 boolean 数据边）：**

```ts
/**
 * 多分支选择（if/switch 统一形态，二分支是 cases.length===2 的特例）。
 * 不再有内联 condition 字段——每个 case 的判据是一个 boolean 输入插槽，
 * 经一条边接入（由 compare/logic 计算节点级联产出 boolean，支持 a>b && c<d）。
 * 运行时按序求值各 case，走首个命中 case 的同名 branch 边（branch 字段区分多出口），皆不中走 default。
 */
export interface FlowConditionNode {
  kind: "condition";
  cases: { slot: FlowSlot /* boolean */; label: string }[];
  default?: string; // 兜底分支标签
}
```

> 旧 `FlowCondition`（values.ts）被计算节点取代——「条件」统一为「产出 boolean 的值节点子图」，与 C15 插槽混合模型一致。

**复合节点的内嵌子图载体 `FlowSubSchema`（嵌套结构的基石）：**

```ts
/**
 * 内嵌 SESE 子图：复合节点（while/forEach/parallel 分支/onError handler）把一段流程
 * 封装为「自带 entry/exit 的完整子图」。整张 FlowSchema 因此是一棵**树**（嵌套），
 * 而非扁平节点集 + branch 标签圈定 body。
 * - 单入口单出口（SESE）：子图内从 entry 沿边线性遍历到 exit，无跨边界回边、无环。
 * - 闭合下钻：外壳可把整个子图折叠为一个复合节点外壳，下钻展开为内部画布。
 * - 与 C16 作用域链同构：每层子图嵌套 = LexicalEnv parent 链下探一层。
 */
export interface FlowSubSchema {
  entry: string; // 子图入口节点 id
  exit: string; // 子图出口节点 id（线性路径终点；return = 连一条边到这里，见第 7 节）
  nodes: FlowNode[];
  edges: FlowEdge[];
}
```

**新增 `while`（条件循环，带安全阀；循环体为内嵌 SESE 子图）：**

```ts
export interface FlowWhileNode {
  kind: "while";
  cond: FlowSlot; // boolean 输入插槽，每轮重新求值（同 condition 经数据边接入）
  body: FlowSubSchema; // 循环体内嵌 SESE 子图——cond 为真则进入 body 跑一遍（entry→exit），跑完回到本节点重判
  // 循环「回流」封在节点内部：body 走到自己的 exit 即一轮结束，主链路上不出现回到 while 头的环边
  // 执行器内置 MAX_STEPS 安全阀，超限抛错（经本节点 onError 处理），防死循环
  // 注意：while 不引入循环变量，其 body 子作用域帧的 in 为空（C16 约束四）
}
```

**`forEach` 字段补全（循环变量可配，落到 body 子帧的 `in`；循环体为内嵌 SESE 子图）：**

```ts
export interface FlowForEachNode {
  kind: "forEach";
  collection: FlowSlot; // 待遍历集合（数组），经插槽/数据边接入
  itemVar?: string; // 当前项字段名，默认 'item'   → 循环体子帧的 in.<itemVar>
  indexVar?: string; // 索引字段名，默认 'index'    → 循环体子帧的 in.<indexVar>
  body: FlowSubSchema; // 循环体内嵌 SESE 子图——逐项进入 body 跑一遍（entry→exit），跑完取下一项
  // 循环「回流」封在节点内部：body 走到自己的 exit 即一项处理完，主链路上不出现回到 forEach 头的环边
  // 每轮迭代压一帧新 context，其 in = { [itemVar]: 当前项, [indexVar]: 当前索引 }（C16 约束四）
  // 块级作用域：body 内可沿帧链穿透读外层 state/外层循环变量；嵌套同名时改 itemVar 避免遮蔽
}
```

**`subFlow` 字段补全（函数作用域 · 闭合契约 inputs/outputs）：**

```ts
/** 形参/返回值声明：名字 + 类型（类型用于编排期校验与 AI 提示） */
export interface FlowParam {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "any";
}

/** subFlow 定义：进物料市场的可复用流程片段，必须闭合（无自由变量）。body 即内嵌 SESE 子图 */
export interface FlowSubFlowDef {
  id: string; // 子流程定义 id（物料市场引用键）
  version: string; // 版本（物料市场按 id+version 锁定，复用方引用固定版本）
  inputs: FlowParam[]; // 形参 → 注入 subFlow 调用帧的 in.<name>
  outputs: FlowParam[]; // 返回值声明 → 子图 exit 节点流出的值按 name 对应（纯数据流，无 return 节点）
  body: FlowSubSchema; // 子流程体（自带 entry/exit/nodes/edges）；递归在此封闭
  // 函数作用域：调用时压一帧新 context，in = 实参（按 inputs 绑定），state 仅 flow 一层
  // 隔离：subFlow 内读不到任何外层名字（不穿透），保证可移植（类比 React Hook）
  // 输出表达：子图走到 exit 时，沿入 exit 边流入的值即为 subFlow 输出（return = 连边到 exit，非“提前返回”）
}

/** subFlow 调用节点：在流程中引用一个 subFlow 定义并传实参 */
export interface FlowSubFlowNode {
  kind: "subFlow";
  ref: { id: string; version: string }; // 引用物料市场中的 subFlow 定义
  args: Record<string, FlowSlot>; // 实参：按 inputs 形参名绑定，经插槽/数据边传入
  // 输出端口 = outputs，下游经统一边的 fromPort 取用（第 3 节）
}
```

**`parallel` 字段补全（自持 fork + 单一 join，mode 裁决汇聚）：**

```ts
/**
 * 并行 fork-join：本节点同时跑 branches 列出的各内嵌 SESE 子图，按 mode 汇聚后从本节点单一出口流出。
 * - 每个分支是一张完整 SESE 子图（自带 entry/exit），并发互不串读（各压各的帧，C16 约束四）。
 * - fork/join 全封在本节点内部：主链路上 parallel 仍是「单入口单出口」的一个节点。
 * - join 时机由 mode 裁决（见第 7 节）；取消是协作式的：race/any 命中后向未命中分支广播取消信号，不做事务回滚。
 */
export interface FlowParallelNode {
  kind: "parallel";
  mode: "all" | "allSettled" | "race" | "any"; // 对标 Promise 四个静态汇聚方法
  branches: FlowSubSchema[]; // 各并行分支（每条是一张内嵌 SESE 子图；并发度 = branches.length）
  // 汇聚结果作为本节点输出端口（下游经统一边 fromPort 取用），形态随 mode：
  //   all → 各分支结果数组；allSettled → {status,value|reason}[]；race/any → 命中分支的单一结果
}
```

**8 个动作节点字段（副作用节点，唯一判据=有副作用；参数皆 FlowSlot，可内联可被一条边覆盖）：**

```ts
/** setVariable：唯一写 state.* 的口（C17 约束五）。target 是 state 路径，value 是写入值 */
export interface FlowSetVariableNode {
  kind: "setVariable";
  target: string; // state 路径，首段限 state.*（如 'state.view.toast.visible'、'state.page.count'）
  value: FlowSlot; // 写入值（内联或一条 toPort=value 的边）
}

/** navigate：前端跨页面（唯一保留的页面级前端副作用之一，state 表达不了页面栈） */
export interface FlowNavigateNode {
  kind: "navigate";
  to: FlowSlot; // 目标页/路由（内联或一条 toPort=to 的边）
  params?: Record<string, FlowSlot>; // 透传给目标页 in 的参数
  mode?: "push" | "replace" | "back"; // 默认 push
}

/** callFlow：调云函数（远程黑盒，网络副作用；不冒泡被调流程的 return 信号，见 C17 约束六） */
export interface FlowCallFlowNode {
  kind: "callFlow";
  functionId: string; // 云函数标识
  args?: Record<string, FlowSlot>; // 入参
  // 输出端口 = 云函数返回值，下游经一条边（fromPort）取用
}

/** httpRequest：后端发起 HTTP（网络副作用）。retry 是该节点的内部时序属性——
 *  「干等/退避」落在这里，不引入 delay 节点（C17 约束九） */
export interface FlowHttpRequestNode {
  kind: "httpRequest";
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: FlowSlot;
  headers?: Record<string, FlowSlot>;
  body?: FlowSlot;
  retry?: { times: number; backoffMs: number }; // 时序属性内置于执行器，非图层 delay
  // 输出端口 = 响应（status/headers/body）
}

/** dbXxx：后端库操作（库读/库写副作用）。无任何事务字段——
 *  图层不提供事务语义，原子性由用户走 error 边接补偿子图 Saga 编排（C17 约束九） */
export interface FlowDbQueryNode {
  kind: "dbQuery";
  collection: string;
  where?: FlowSlot;
  limit?: FlowSlot;
  sort?: FlowSlot;
} // 输出 rows
export interface FlowDbInsertNode {
  kind: "dbInsert";
  collection: string;
  doc: FlowSlot;
} // 输出 insertedId
export interface FlowDbUpdateNode {
  kind: "dbUpdate";
  collection: string;
  where: FlowSlot;
  patch: FlowSlot;
} // 输出 matchedCount
export interface FlowDbDeleteNode {
  kind: "dbDelete";
  collection: string;
  where: FlowSlot;
} // 输出 deletedCount

export type FlowActionNode =
  | FlowSetVariableNode
  | FlowNavigateNode
  | FlowCallFlowNode
  | FlowHttpRequestNode
  | FlowDbQueryNode
  | FlowDbInsertNode
  | FlowDbUpdateNode
  | FlowDbDeleteNode;
```

**统一四分顶层判别（`category` 由两个正交维度叠出）：**

```ts
/**
 * FlowNode 四分：在不在主控制流上被推进（调度推进 vs 被下游拉取求值） × 子维度。
 * - control：选路/组织，无副作用，在主链路上被调度推进（condition/while/forEach/parallel/subFlow）
 * - action ：干活，有副作用，在主链路上执行 + 输出沿边流给下游（上述 8 个）
 * - source：出值，无输入、单输出的叶子源，被下游引用时直接出值，不递归上游
 * - compute：算值，有输入有输出的纯变换，被下游引用时先递归求上游输入、再变换
 * 判据：control/action 切「有无副作用」；source/compute 切「有无输入」。
 */
export type FlowNode = { id: string; meta?: NodeMeta } & (
  | (FlowControlNode & { category: "control" })
  | (FlowActionNode & { category: "action" })
  | (FlowSourceNode & { category: "source" })
  | (FlowComputeNode & { category: "compute" })
);

export type FlowControlNode =
  | FlowConditionNode
  | FlowWhileNode
  | FlowForEachNode
  | FlowParallelNode
  | FlowSubFlowNode;

/** 编辑器展示信息，运行时执行器不读；坐标等画布状态由外壳层独立持久化（见第 4 节） */
export interface NodeMeta {
  label?: string;
  comment?: string;
}
```

**执行结果协议（`NodeExecResult`，含补偿数据通道）：**

```ts
/**
 * 每个执行器执行后返回统一结果。统一边后（第 3 节），节点不再返回 “选哪几条控制边” 的 next 数组：
 * - 纯控制推进 / 动作节点：SESE 单出口，沿唯一出边走下一个，无需选边。
 * - 多出口节点（condition）：调度层据求值结果匹配出边的 branch 字段选路（见第 7 节）。
 * 节点只负责产出 outputs（沿边流给下游）与可选的 branch 选择依据。
 */
export interface NodeExecResult {
  outputs?: Record<string, unknown>; // 产出到本节点输出端口的数据（沿出边的 fromPort 流给下游）
  branch?: string; // 多出口节点（condition）命中的出边 branch 标签；单出口节点省略
  error?: {
    // 出错时填；有 onError 子图则下钻补偿子图，否则冲顶终止
    message: string;
    partialOutputs?: Record<string, unknown>; // 出错前已产出的部分结果（如已 insert 的 id），
    //  流给 onError 内嵌补偿子图——补偿是业务语义、由用户编排（Saga），执行器只负责把数据递出去（C17 约束九）
  };
}
```

**节点重整对照（旧 19 → 目标态）：**

| 旧节点                                                           | 目标态去向                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `condition`（FlowCondition 内联判据）                            | 升级为多分支 `FlowConditionNode`（cases + default，判据沿一条 boolean 边接入、按 `branch` 选出边）                                                                                                                            |
| `forEach` / `parallel` / `subFlow`                               | 保留为控制流节点（category:'control'）                                                                                                                                                                |
| `delay`                                                          | **废除** → 无迁移目标：时间流逝是宿主运行时能力（同 setTimeout/sleep），非图层可编排的副作用语义；“干等 N 秒”要么是某副作用节点执行器内的时序属性（如重试退避）、要么在云函数实现内完成（C17 约束九） |
| `return`                                                         | **废除** → return = 连一条边到所在（子）图的 `exit` 节点（SESE 单出口）；“提前返回”即某分支直连 exit，不需独立节点                                                                        |
| `callFlow`                                                       | 保留为**动作**节点（category:'action'，调云函数=网络副作用）                                                                                                                                          |
| `setVariable`                                                    | 保留为动作节点，且为**唯一**写 `state.*` 的口（C17 约束五）                                                                                                                                           |
| `navigate`                                                       | 保留为前端动作节点（跨页面：改页面栈，state 表达不了）                                                                                                                                                |
| `animate`                                                        | **废除** → 页面内表现统一由 `setVariable` 写样式/动画意图变量，渲染层下一帧消费（前端副作用节点只保留跨页面/跨会话能力，防能力封装无限膨胀，C17 约束九）                                              |
| `dbQuery` / `dbInsert` / `dbUpdate` / `dbDelete` / `httpRequest` | 保留为后端动作节点（图层无事务节点、dbXxx 无事务字段；原子性由用户走 error 边接补偿子图 Saga 显式编排，见 C17 约束九）                                                                                |
| `transform`                                                      | **废除** → C15 计算节点（math/concat/format/compare/logic 级联）                                                                                                                                      |
| `script`                                                         | **废除** → `subFlow`（其定位对标可复用流程，非计算；有悖可视化/可审计哲学）                                                                                                                           |
| `setData`                                                        | **废除** → `setVariable`（写 `state.view.*`）                                                                                                                                                         |
| `setVisible`                                                     | **废除** → `setVariable`（写视图 visible 状态字段）                                                                                                                                                   |
| 新增                                                             | `while`（控制流，带 MAX_STEPS 安全阀）                                                                                                                                                                |

### 6. 作用域模型（编排期词法环境 / 运行期 context 栈 · C16 约束四）

C16 把单个作用域帧的形状收敛为 `in/state/cap` 三分，约束四进一步约定**多帧如何嵌套与查找**。本节给出落地结构——这是 forEach/while 循环变量、subFlow 局部入参、错误 handler 的 error 得以存在、又不破坏「单帧形状不可变」的实现基础。

**两个结构分家（不再是「一份 context 两副面孔」）：**

```ts
/** 编排期：词法环境（静态嵌套树，与子图嵌套同构，只有名字+类型、无值） */
export interface LexicalEnv {
  parent: LexicalEnv | null; // 父作用域（根作用域 parent=null）
  kind: "root" | "block" | "function"; // root=挂载点；block=forEach/while/handler；function=subFlow
  names: Record<string, FlowParam["type"]>; // 本帧 in 引入的名字+类型（root 由挂载点描述符给）
  // 查找：block 沿 parent 向上穿透（就近遮蔽）；function 不穿透（parent 仅用于物料定位，不参与名字查找）
}

/** 运行期：context 栈帧（每帧装 in/state/cap 的实际值） */
export interface ContextFrame {
  parent: ContextFrame | null;
  scopeKind: "root" | "block" | "function";
  in: Record<string, unknown>; // 本帧入参实际值（root=挂载点入参；block=循环变量/error；function=实参）
  state: StateLayers; // C16 分层状态 { view?, page?, app?, flow }；block 透传外层同一引用、function 仅 flow 一层
  cap: Capabilities; // C16 能力句柄（前端 navigate/持久化等跨边界能力 | 后端 db/httpClient），仅副作用节点执行器可见
}
// 注：StateLayers / Capabilities 为 C16 资源来向三分中 state/cap 的形状（其内部结构由 C16 约束一~二界定，本方案不展开）
```

> **编排期一份、运行期 N 个**：一个 forEach body 在画布上只有一个 `LexicalEnv`（block），运行时循环 N 轮压出 N 个 `ContextFrame`。path 校验/AI 提示走 `LexicalEnv`，取值走 `ContextFrame`。

**三种作用域开法与查找规则：**

| 开帧节点                                    | scopeKind | 查找                                 | 新帧 `in`                                      | 新帧 `state`         |
| ------------------------------------------- | --------- | ------------------------------------ | ---------------------------------------------- | -------------------- |
| 挂载点（事件/生命周期/云函数）              | root      | —                                    | 挂载点描述符（C16 约束二）                     | 描述符开放层次       |
| `forEach`/`while` 的循环体（`body: FlowSubSchema`） | block     | **穿透**（沿 parent 向上，就近遮蔽） | forEach：`{[itemVar],[indexVar]}`；while：`{}` | 透传外层（同一引用） |
| 节点 `onError` 补偿子图（`FlowSubSchema`）  | block     | **穿透**                             | 外层叠 `{ error }`                             | 透传外层             |
| `subFlow`                                   | function  | **隔离**（不穿透）                   | inputs 实参绑定                                | 仅 `flow` 一层       |

- **取值查找（resolveValue 内）**：解析 `from:'context'; path:'in.x'` 时，从当前帧起按 `path` 首段（in/state）在本帧找；找不到且本帧是 **block** → 沿 `parent` 向上逐帧找（首次命中即停，实现就近遮蔽）；本帧是 **function** → **不向上找**，未命中即报错（保证 subFlow 闭合）。
- **state 透传**：block 帧的 `state.view/page/app/flow` 与外层指向**同一份引用**（共享长生命周期状态，非副本）；function 帧只新建一个空的 `state.flow`，无 view/page/app。

**subFlow 闭合契约（进物料市场的前提）：**

- 编排期**闭合性校验**：subFlow 定义内所有 `from:'context'` 源节点的 `path`，其首段名字必须落在「本 subFlow 的 `inputs` ∪ `state.flow`」内——出现任何外层自由变量即校验失败，禁止上架物料市场。
- 调用处 `FlowSubFlowNode.args` 按 `inputs` 形参名绑定实参（经插槽/数据边传入）；`outputs` 由子图 `body` 走到其 `exit` 节点时、沿入 exit 边流入的值产出（纯数据流，不依赖 return 节点），这些值回到调用方作为输出端口（下游沿出边 fromPort 取用）。
- 物料市场按 `id + version` 锁定，复用方引用固定版本（避免上游改动破坏下游）。

**节点输出端口与 `fromPort`（多输出定位）：**

- 动作节点/subFlow 可有**多个输出**（如 dbQuery 输出 `rows`+`count`，subFlow 输出按 `outputs` 多个）。统一边的 `from` 仅有节点 id 不足以定位是哪个输出，故用边上 `fromPort?: string` 指定源输出端口（缺省取节点默认输出）。
- 单输出节点（源节点/计算节点）`fromPort` 省略。derivePorts（M19a）把每个输出端口投影为一个可连接端口。

**帧生命周期与职责切分（帧栈是纯作用域机制，无事务语义）：**

context 栈是 FlowRunner 在运行期为「名字查找」维护的作用域机制，**不承载任何事务语义**——它与 C2 的 `TransactionManager`（业务层编排态的操作事务）完全无关。帧栈没有 begin/commit/rollback，副作用（发请求、写库、跳页）本质不可回滚，错误处理一律下钻节点的 `onError` 内嵌子图（C17 约束四），不存在「整帧回滚」一说。

- **FlowRunner 管帧的生命周期**：开帧节点（forEach/while 的 `body` 子图、subFlow 的 `body`、节点 `onError` 子图）被调度执行时，FlowRunner 压入一帧新 `ContextFrame`（按第 6 节表绑定其 `in`，`state` 按 block 透传 / function 仅 flow，`cap` 沿挂载点）；子图从 `entry` 线性遍历走到 `exit` 时整帧弹出。多层嵌套则依次压栈、各自弹出，栈深恒等于子图嵌套深。
- **节点执行器只消费栈顶帧**：每个 NodeExecutor 不感知帧的压弹，只面向「当前栈顶帧」工作——读 `in`/`state`、用 `cap` 发副作用、把结果写回 `state`（仅 `setVariable`，C17 约束五）。block 帧的取值穿透由 resolveValue 沿 `parent` 链完成（见执行层适配第 2 步），执行器无需关心帧链结构。

---

## 7. 执行调度模型（entry→exit 线性遍历 / 递归下钻子图 · C17）

第 1～6 节固化了图的**静态形状**（节点、边、插槽、作用域）。本节固化**运行期怎么跑**：FlowRunner 从哪起步、怎么沿边推进、复合节点如何递归下钻子图、帧何时压弹、parallel 如何并发汇聚、出错往哪走。

### 7.1 入口/出口双指针 `entry` + `exit`（SESE）

FlowSchema 顶层增设入口、出口双指针：

```ts
export interface FlowSchema {
  version: string; // FLOW_SCHEMA_VERSION，本次升至 '2.0.0'
  entry: string; // 入口节点 id —— 挂载点触发时 FlowRunner 从此节点起步
  exit: string; // 出口节点 id —— 线性路径终点；return = 连一条边到此（C17 约束七）
  nodes: FlowNode[];
  edges: FlowEdge[];
}
```

- **单入口单出口（SESE）**：起点与终点都由指针唯一确定，执行路径由拓扑唯一确定——FlowRunner 从 `entry` 沿边线性遍历到 `exit`，无需「就绪队列 + 选边」拼出顺序。与复合节点内嵌的 `FlowSubSchema`（第 5 节，同样 entry/exit）完全同构：整张图是一棵嵌套树，每张（子）图都是一段 SESE 区间。
- **return 即连边到 exit**：「提前返回」就是某分支直接连一条边到 `exit` 节点，无独立 return 节点（C17 约束七）。
- **图永远无环**：循环体、错误处理、递归都封进复合节点的内嵌子图，主链路上无回流环边、无跨节点 error 边——每张（子）图都是 entry→exit 的有向无环线性路径。

### 7.2 线性遍历 + 递归下钻（与节点类型解耦）

所有 NodeExecutor 统一返回结果对象（`NodeExecResult`，唯一定义见第 5 节末「执行结果协议」），调度层据此沿边推进，**不对节点类型做 if 分支**：节点只产出 `outputs`（沿出边 `fromPort` 流给下游）与可选的 `branch`（多出口节点的选路依据）。

- **单出口节点（动作节点 / 纯控制推进）**：执行后沿其**唯一出边**走下一个，无需选边。
- **多出口节点（condition）**：执行后据 `result.branch` 匹配出边的 `branch` 字段选路；皆不中走 `default` 边。
- **复合节点（while/forEach/parallel/subFlow）**：执行 = **递归下钻其内嵌子图**——FlowRunner 对 `body`/`branches`/子图各自再跑一遍「从子图 entry 线性遍历到 exit」的同一过程（栈式递归），子图跑完回到外层节点的出边继续。复合节点不在主图上展开节点，而是把一整段 SESE 子图折叠成一个外壳。
- **出错填 `error` 字段**：executor 内 try-catch 兜底，捕获后在 `NodeExecResult.error` 里填 `message` 与 `partialOutputs`（出错前已产出的部分结果）；FlowRunner 据此下钻该节点的 `onError` 内嵌补偿子图（见 7.5），补偿数据（partialOutputs）作为子图 `in.error` 流入（Saga，C17 约束九）。

### 7.3 遍历循环

FlowRunner 对每张（子）图执行同一个 `runSubgraph(sub, frame)` 过程，从主图 `entry` 起步：

1. `cur = sub.entry`。
2. 循环：解析 `cur` 的输入插槽（`resolveValue`，见执行层适配）→ 调用 executor → 拿 `NodeExecResult`；若 `cur` 是复合节点，则按 7.2 **递归** `runSubgraph` 跑其内嵌子图。
3. 据节点类型选出边：单出口取唯一出边；多出口（condition）按 `result.branch` 匹配；`cur` 推进到出边的 `to`。
4. `cur === sub.exit` ⇒ 本（子）图结束，返回流入 exit 的值。

主链路恒线性推进（一次一个活跃节点）；只有 `parallel`（7.4）在其内部对 `branches` 各子图并发 `runSubgraph`。

### 7.4 帧压弹与递归下钻的绑定（含并发帧树）

帧的压入/弹出严格绑定在 FlowRunner **下钻内嵌子图**时，分三种：

- **forEach/while 的 body 子图**：每轮进入 `body: FlowSubSchema` 前，FlowRunner 压一帧 block（forEach：`in={item,index}`；while：`in={}`），`runSubgraph(body)` 跑完 body 的 entry→exit，**该帧弹出**；外层循环节点重新求值（取下一项 / 重判条件）→ 命中则再压**新的一帧**跑下一轮。**N 轮 = N 次独立压弹**，绝非压一帧改 N 次值——后者会让嵌套引用、并发读取错乱，也违反「单帧形状不可变」。条件不再满足时直接沿循环节点出边推进，不再下钻。
- **parallel 的并发帧树**：`parallel.branches` 是 N 个 `FlowSubSchema`，FlowRunner 对每条分支**各压各的帧**并发 `runSubgraph`——此时 context 帧不再是线性栈而是**帧树**：每条分支持有自己从根到叶的一条帧链，分支间作用域隔离（符合并发直觉，互不串读）。所有分支按 `mode` 满足 join 条件后，回到 parallel 所在帧、沿其出边继续。
- **subFlow 的 function 帧**：调用 subFlow 时压一帧 function（隔离不穿透，`in`=实参，`state` 仅 flow 一层）；`runSubgraph(body)` 走到 `body.exit` → 收集沿入 exit 边流入的值 → **弹帧** → 这些值回到调用方作为输出端口（下游沿出边 fromPort 取用）。

### 7.5 parallel fork/join 四模式（对标 Promise 静态方法）

`parallel` 把 N 个内嵌子图（`branches: FlowSubSchema[]`）并发跑，join 只有一个出口，「何时到达 join、到达后往哪走」由 `mode` 裁决，对标 Promise 的四个汇聚静态方法：

| mode         | 对标                 | join 时机                        | 失败处理                                                |
| ------------ | -------------------- | -------------------------------- | ------------------------------------------------------- |
| `all`        | `Promise.all`        | 等**所有**分支抵达               | **任一**分支出错 ⇒ 整个 parallel 走错误处理（快速失败） |
| `allSettled` | `Promise.allSettled` | 等**所有**分支结束（不论成败）   | 不抛错；各分支成败结果都收集后往下传                    |
| `race`       | `Promise.race`       | **首个**分支结束（成或败）即继续 | 首个若失败 ⇒ 走错误处理                                 |
| `any`        | `Promise.any`        | **首个成功**分支即继续           | 全部失败才走错误处理                                    |

- **协作式取消（cooperative cancellation）**：`race`/`any` 命中后，parallel 向**未命中分支的下游链路广播取消信号**，信号在该分支子图内沿边向下游节点传递。「节点收到取消信号后做什么」是**节点内部实现**（动画可停、HTTP 可 abort、已发生的副作用如 dbInsert 不可逆）——parallel 只负责发信号、不负责落实取消。取消是**尽力而为的协作式中断，非事务回滚**（与「无事务语义」一致）。取消信号传递是通用机制，非 parallel 私有（未来超时等中断场景可复用）。

### 7.6 双层错误兜底（节点模型 error 全集 / 外壳仅副作用可见）

错误处理在**节点模型**与**外壳渲染**两层语义不同：

- **节点模型层**：每个节点都可能抛异常（任何一条语句执行都可能出错，含 setVariable 写深层 path），executor 统一 try-catch 捕获后填入 `NodeExecResult.error`。错误兜底能力在模型上是**全集**。
- **外壳渲染层（M19）**：**只有副作用节点（动作节点）渲染可挂 `onError` 的入口**；控制流节点（condition/forEach/while/parallel）纯、出错基本是引擎级异常，不给每个 if 挂错误子图（避免画布被无意义结构淹没）。

FlowRunner 据此**双层兜底**：

1. **节点挂了 `onError` 子图**（用户在动作节点上配了 `onError: FlowSubSchema`）⇒ executor 出错 → FlowRunner 下钻这张补偿子图（block 子作用域、`in` 叠 `error`，第 6 节 / C17 约束四），跑完回到原节点出边继续。
2. **节点没挂 `onError`**（控制流节点，或动作节点用户未配）⇒ executor 出错 → 沿当前子图链冲顶，最终走**全局默认错误处理**（兜底：终止当前流程 / 记录 / 冒泡到挂载点）。

---

## 执行层适配（C7 resolveValue）

`resolveValue()` 的解析逻辑扩展，以支持「插槽被数据边覆盖」与「计算节点求值」：

1. **插槽解析**：解析某节点的某 slot 时，先查 `edges` 中是否有边接入该插槽（`FlowEdge { to: nodeId, toPort: slot }`）。
   - 有 → 解析该边 `from` 节点的 `fromPort` 输出（多输出节点取指定端口，单输出取默认），作为 slot 值（边获胜）。
   - 无 → 使用 slot 内联的 `FlowValue` 默认值。
2. **源节点求值**：`from:'literal'` 直接返回 `value`；`from:'context'` 从**当前 `ContextFrame`**（第 6 节）按 `path` 取值，`path` 首段限定 `in`/`state`（值节点只见只读子集 `{in, state}`，不可见 `cap`）；本帧未命中且为 block 作用域时沿 `parent` 帧链向上穿透查找（function 作用域不穿透）。上下文三分形状、作用域帧与查找规则见 engine:C16 约束一~四。
3. **计算节点求值**：递归解析计算节点各输入插槽 → 应用 op → 返回结果。计算节点可级联，按边形成的数据依赖 DAG 拓扑求值，需做**环检测**（计算子图必须无环）。
4. **nodeRef 兼容**：旧 `FlowValue.nodeRef` 引用值节点输出，迁移后等价于「slot 由一条边（fromPort 定位上游输出口）接入」，迁移期可保留双通道，最终统一为边上 fromPort。

> 求值缓存：同一次 `FlowRunner.run` 内，同一计算节点的输出可缓存（memoize），避免被多个下游 slot 重复求值。计算节点纯，缓存安全。

执行器（C6 各 NodeExecutor）读取参数时，从「直接读 `node.xxx: FlowValue`」改为「`resolveSlot(node, 'xxx', context)`」，由 resolveValue 统一裁决内联 vs 数据边。

---

## 迁移方案（`1.0.0` → `2.0.0`）

属于 schema:mechanism「FlowSchema 嵌套数据迁移」范畴。迁移函数对 View.events/lifetimes 中每个 FlowSchema 执行：

| 旧结构                                              | 迁移动作                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶层无 `entry`/`exit`（旧 1.0.0）                     | **推导补 `entry`/`exit`**：`entry` 取入度为 0 的节点、`exit` 取出度为 0 的节点；各唯一则直接置定，多个出度为 0 则新增一个汇聚 exit 节点、原各终点连边到它（补齐 SESE），保证起止唯一确定（C17 7.1）                                                   |
| `node.x` / `node.y`                                 | 剥离坐标，写入外壳侧坐标存储（无外壳存储则丢弃，不影响语义）                                                                                                                                       |
| `FlowEdge { branch: 'true'\|'false' }`              | → 统一 `FlowEdge { branch }`（多出口选路保留）                                                                                                                                       |
| `FlowEdge { branch: 'error' }`                      | → **删除边** → 转为源节点的 `onError: FlowSubSchema`，原 handler 子树裹成该子图（边上不再有 error 通道）                                                                            |
| `FlowEdge { toParam: 'x' }`（无 branch）            | → 统一 `FlowEdge { toPort:'x' }`（由 from 节点输出沿边流入该插槽）                                                                                                                |
| `FlowEdge`（无 branch 无 toParam）                  | → 统一 `FlowEdge`（纯控制推进，fromPort/toPort/branch 皆省）                                                                                                                          |
| 节点 `{ kind:'variable'\|'pageVar'\|'eventParam' }` | → `FlowContextSourceNode { kind:'source', from:'context', path }`，path 由旧字段拼接成 C16 三分路径（variable→`state.view.<viewId>.<key>`、pageVar→`state.page.<key>`、eventParam→`in.<index>`）   |
| 内联 `FlowValue.literal`                            | → `FlowLiteralSourceNode { from:'literal', value }`，或保留为 slot 内联默认值                                                                                                                      |
| 内联 `FlowValue.dataRef/pageDataRef/eventArg`       | → 接入一个 `from:'context'` 源节点的边，或转为 slot 内联的 context 取值                                                                                                                     |
| 动作节点内联 `FlowValue` 字段                       | 原样保留为 slot 内联默认值（语义升级，值不变）                                                                                                                                                     |
| `FlowValue.nodeRef` 引用值节点                      | 转换为接入对应 slot 的一条边（from=被引用值节点，to=持有该 slot 的节点，toPort=slot）                                                                                                                            |
| 节点打上 `category`                                 | 控制流节点（condition/while/forEach/parallel/subFlow）→ `category:'control'`；其余 → `category:'action'`（C17 约束一；delay/animate 已废除，不在列）                                               |
| `return` 节点（旧 1.0.0 若有）                      | **删除** → 原 return 点连一条边到所在（子）图的 `exit` 节点；若 return 携带返回值，该值沿边流入 exit（C17 废除 return）                                           |
| `delay` 节点（旧 1.0.0 若有）                       | **删除** → 无等价图节点：纯时序等待落到下游副作用节点执行器内部或云函数实现（无法自动转换，标记为人工迁移项；理由：时间流逝是宿主能力，C17 约束九）                                                |
| `animate` 节点（旧 1.0.0 若有）                     | **转 `setVariable`** → 把动画目标改写为写对应视图的样式/动画意图状态变量（`state.view.<viewId>.*`），由渲染层下一帧消费呈现（C17 约束九）                                                          |
| `condition`（内联 FlowCondition 判据）              | → 多分支 `FlowConditionNode`：旧 true/false 折叠为 `cases:[{label:'true'},{label:'false'}]`，判据 FlowCondition 转为 compare/logic 计算子图经 boolean 边接入对应 case 的 slot（C17 约束三） |
| `transform` 节点                                    | → 拆为 C15 计算节点子图（表达式按 op 拆 math/concat/format/compare/logic），其输出经一条边喂给原下游 slot                                                                                      |
| `script` 节点                                       | → 提示迁移为 `subFlow`（无法自动转换，标记为人工迁移项；理由：脚本对标可复用流程而非计算，C17 约束六）                                                                                             |
| `setData { viewId, key, value }`                    | → `setVariable { 写 state.view.<viewId>.<key> = value }`（C17 约束五）                                                                                                                             |
| `setVisible { viewId, visible }`                    | → `setVariable { 写 state.view.<viewId>.visible = visible }`                                                                                                                                       |
| 旧 error 落点节点（原 `branch:'error'` 目标）       | 裹成源节点 `onError: FlowSubSchema` 的入口；该补偿子图为块级子作用域，进入时压新帧、其 `in` 在外层基础上静态叠 `error` 字段（C16 约束四 / C17 约束四）                                            |

迁移要求：

- 幂等——对已是 `2.0.0` 的 schema 不重复迁移（依据 `FLOW_SCHEMA_VERSION`）。
- 无损——迁移前后控制流 + 数据流拓扑等价（可用执行结果回归测试验证）。
- `FLOW_SCHEMA_VERSION` 升至 `'2.0.0'`，记入 schema:mechanism 迁移登记。

OSS 已发布产物自包含、冻结，不迁移（符合 schema:mechanism 既有约定）。

---

## 外壳层适配（M19 / M19a）

- **边 ↔ 插槽控件互斥渲染**：M19 的 NodeView 在渲染某参数行时，查询是否有一条 toPort 指向该 slot 的边接入；有则隐藏内联控件、显示连线锚点（边获胜），无则显示可编辑 FlowValue 控件。
- **derivePorts 投影**：M19a 的 `NodeKindDescriptor.derivePorts()` 把节点的每个 slot 投影为一个输入端口（toPort）、把值节点/计算节点输出投影为输出端口（fromPort）；统一边根据是否携带 fromPort/toPort 在外壳呈现为执行连线（无 port，纯推进）或数据连线（有 port，值流动），外壳可据此渲染为双色 pin（对标 Unreal Blueprint exec/data 双色）。
- **计算节点 Descriptor**：为 math/concat/format/compare/logic 各新增 Descriptor，定义其输入端口数（含变长）、运算选择控件、可级联连线规则。
- **回写无损**：用户在画布连/断边、编辑插槽内联值、拼装计算节点，均经 TransactionManager 写回 schema，保证 C15「外壳⇄schema 双向无损可逆」。

---

## AI 生成端适配（xiangdi-agent）

- `@banyuan/xiangdi-agent` 的 AI Projection / FlowSchema 生成需感知新结构（entry/exit SESE、统一边、复合节点内嵌 FlowSubSchema、slot、计算节点）。
- SubAgent 输出的 Zod Schema（`orchestration/schemas.ts`）更新为 `2.0.0` 形状。
- 提示词/知识种子（knowledge-server）补充源节点（`from:'literal'`/`from:'context'`）与计算节点用法、`path` 写法惯例，以及「内联 vs 连边」的选择惯例（简单默认走内联、复用/计算/动态走数据边）。
- 按 AGENTS.md「修改 banvasgl 接口类型时检查 xiangdi-agent 的 AI Projection 转换器是否需同步」执行。

---

## 实施阶段

1. **类型层**（`src/flow/types/`）：`FlowSchema` 顶层新增 `entry: string` + `exit: string`（SESE），复合节点内嵌 `FlowSubSchema`，新增计算节点、`FlowSlot`、统一 `FlowEdge`（含 fromPort/toPort/branch），移除 x/y，导出更新；`FLOW_SCHEMA_VERSION='2.0.0'`。
2. **执行层**（C7 resolveValue + 各 executor）：插槽解析、计算节点求值、环检测、memoize。
3. **迁移函数**（schema:mechanism）：`1.0.0 → 2.0.0`，幂等 + 无损，附回归测试。
4. **外壳层**（M19/M19a）：边↔控件互斥渲染、derivePorts 投影（fromPort/toPort）、计算节点 Descriptor。
5. **AI 端**（xiangdi-agent + knowledge-server）：Projection / Zod / 知识种子同步。
6. **验证**：`pnpm build:all` 零错误；迁移前后执行结果回归一致；外壳⇄schema 往返无损用例。

---

## 验收标准

- 类型层编译通过，`FlowValueNode` 只剩 `FlowSourceNode | FlowComputeNode`（无 variable/pageVar/eventParam），`FlowEdge` 不再含 `toParam`，`FlowNode` 不再含 `x/y`。
- 一个 `from:'context'` 源节点能按 `path` 从注入上下文对象取到正确值（如 `page.user.name`）。
- 一个含「单价 × 数量 × (1−折扣)」的计算节点子图能在画布拼装、序列化、执行得正确结果。
- 一段 `1.0.0` schema 经迁移后执行结果与迁移前完全一致（含 condition true/false 多出口与 onError 补偿子图）。
- 某参数 slot 接入一条 toPort 指向它的边后，其内联默认值被忽略（边获胜）；断开后回落到内联值。
- AI 生成的 FlowSchema 符合 `2.0.0` 形状并能直接执行。
