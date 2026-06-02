# Flow —— 声明式流程引擎

> `@banyuan/banvasgl/flow` · `@banyuan/banvasgl/flow/client` · `@banyuan/banvasgl/flow/server`

Flow 是 BanvasGL 的内置流程引擎模块，以声明式节点图（nodes + edges）驱动流程执行。它不是独立的 npm 包，而是通过 `@banyuan/banvasgl` 的子路径导出供外部使用。

---

## 设计理念

Flow 引擎采用 **kind-agnostic** 设计 —— FlowRunner 本身不关心具体有哪些节点类型，而是通过 `NodeExecutorRegistry` 按 `kind` 查找对应的执行器函数。新增节点类型只需注册新执行器，无需修改调度器代码。

前后端执行器物理隔离：前端节点（animate/navigate/setData/setVisible）和后端节点（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/script/transform）分别预组装，互不干扰。共享节点（condition/delay/setVariable/callFlow/subFlow）两端复用。

---

## 子路径导出

| 导入路径 | 用途 |
|----------|------|
| `@banyuan/banvasgl/flow` | 核心运行时 + 全部类型 + 执行器注册表 |
| `@banyuan/banvasgl/flow/client` | 前端预组装：`createClientFlowRunner()` |
| `@banyuan/banvasgl/flow/server` | 后端预组装：`createServerFlowRunner()` |

---

## 核心数据结构

### FlowSchema

流程图的完整描述，由节点数组和有向边数组组成：

```typescript
interface FlowSchema {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
```

### FlowNode

每个节点包含唯一 `id` 和 `kind` 字段。节点分为两大类：

**动作节点**（参与控制流执行）：

- 共享节点：`condition` · `delay` · `setVariable` · `callFlow` · `subFlow`
- 前端节点：`setData` · `navigate` · `animate` · `setVisible`
- 后端节点：`dbQuery` · `dbInsert` · `dbUpdate` · `dbDelete` · `httpRequest` · `transform` · `script`

**值节点**（不参与控制流，仅产出值供参数引用）：

- `variable`：引用指定 View 的数据字段
- `pageVar`：引用页面级变量
- `eventParam`：引用事件触发参数

### FlowEdge

有向边连接两个节点，支持条件分支和数据流：

```typescript
interface FlowEdge {
  id: string
  from: string
  to: string
  branch?: 'true' | 'false'  // 条件分支标签
  toParam?: string            // 数据流目标参数槽
}
```

### FlowValue

动态值来源，5 种 kind 覆盖所有数据引用场景：

- `literal`：硬编码字面量
- `dataRef`：引用指定 scope 下的变量（前端=View.data，后端=context 变量）
- `pageDataRef`：引用页面/流程级变量
- `eventArg`：引用触发事件的参数（按索引）
- `nodeRef`：引用另一个值节点的输出

---

## 执行模型

FlowRunner 的执行流程：

1. **建图**：将 nodes 和 edges 转为内部 Map 结构
2. **找入口**：无入边的第一个动作节点即为入口
3. **顺序执行**：从入口沿边执行，每步查找 executor 并调用
4. **条件分支**：condition 节点返回 `'true'` 或 `'false'`，据此选择分支边
5. **防死循环**：MAX_STEPS = 1000，超限抛出异常

```typescript
const runner = createClientFlowRunner()
await runner.run(schema, context)
```

---

## FlowContext 接口

FlowRunner 通过 `FlowContext` 抽象接口与执行环境交互，前后端各自提供实现：

```typescript
interface FlowContext {
  getVariable(scope: string, key: string): unknown
  setVariable(scope: string, key: string, value: unknown): void
  eventArgs: unknown[]
  env: Record<string, unknown>  // 环境能力注入
}
```

- **前端 env**：`{ appId, navigateTo, playAnimation, markDirty }`
- **后端 env**：`{ db, appId, httpClient }`

---

## 节点类型详解

### 共享节点（前后端通用）

| kind | 说明 | 关键字段 |
|------|------|----------|
| `condition` | 条件分支 | `condition: { left, op, right }` |
| `delay` | 延迟等待 | `ms: number` |
| `setVariable` | 设置变量 | `scope, key, value` |
| `callFlow` | 调用外部流程 | `flowId, inputBindings, outputBindings` |
| `subFlow` | 内嵌子流程 | `name, body: FlowSchema, inputs, outputs` |

### 前端节点

| kind | 说明 | 关键字段 |
|------|------|----------|
| `setData` | 设置 View.data | `viewId, key, value` |
| `navigate` | 页面导航 | `pageId` |
| `animate` | 播放动画 | `viewId, animationId` |
| `setVisible` | 设置可见性 | `viewId, visible` |

### 后端节点

| kind | 说明 | 关键字段 |
|------|------|----------|
| `dbQuery` | 数据库查询 | `collection, filter, projection?, sort?, limit?, outputVariable` |
| `dbInsert` | 数据库插入 | `collection, document, outputVariable` |
| `dbUpdate` | 数据库更新 | `collection, filter, update, outputVariable` |
| `dbDelete` | 数据库删除 | `collection, filter, outputVariable` |
| `httpRequest` | HTTP 请求 | `url, method, headers?, body?, outputVariable` |
| `transform` | 表达式转换 | `expression, variables, outputVariable` |
| `script` | 沙箱脚本 | `code, inputBindings, outputBindings, timeout?` |

---

## 使用示例

### 前端：View 点击事件触发数据更新 + 页面跳转

```typescript
import { createClientFlowRunner } from '@banyuan/banvasgl/flow/client'
import type { FlowSchema } from '@banyuan/banvasgl/flow'

const schema: FlowSchema = {
  nodes: [
    { id: 'n1', kind: 'setData', viewId: 'self', key: 'clicked', value: { kind: 'literal', value: true } },
    { id: 'n2', kind: 'navigate', pageId: 'page-detail' },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
  ],
}

const runner = createClientFlowRunner()
await runner.run(schema, context)
```

### 后端：查询数据库 → 条件判断 → HTTP 通知

```typescript
import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server'

const schema: FlowSchema = {
  nodes: [
    { id: 'n1', kind: 'dbQuery', collection: 'orders', filter: { status: { kind: 'literal', value: 'pending' } }, outputVariable: 'orders' },
    { id: 'n2', kind: 'condition', condition: { left: { kind: 'dataRef', viewId: 'local', key: 'orders' }, op: '!=', right: { kind: 'literal', value: null } } },
    { id: 'n3', kind: 'httpRequest', url: { kind: 'literal', value: 'https://notify.example.com' }, method: 'POST', body: { kind: 'dataRef', viewId: 'local', key: 'orders' }, outputVariable: 'resp' },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3', branch: 'true' },
  ],
}

const runner = createServerFlowRunner()
await runner.run(schema, serverContext)
```

---

## 目录结构

```
packages/banvasgl/src/flow/
├── index.ts                 # 主入口（@banyuan/banvasgl/flow）
├── presets/
│   ├── client.ts            # createClientFlowRunner()
│   └── server.ts            # createServerFlowRunner()
├── runtime/
│   ├── FlowRunner.ts        # 核心调度器
│   ├── context.ts           # FlowContext 接口定义
│   ├── resolveValue.ts      # FlowValue → 实际值 解析器
│   └── index.ts
├── executors/
│   ├── registry.ts          # NodeExecutorRegistry
│   ├── shared/              # condition / delay / setVariable / callFlow / subFlow
│   ├── client/              # setData / navigate / animate / setVisible
│   └── server/              # dbQuery / dbInsert / dbUpdate / dbDelete / httpRequest / transform / script
└── types/
    ├── schema.ts            # FlowSchema / FlowNode / FlowEdge
    ├── values.ts            # FlowValue / FlowCondition
    └── nodes/
        ├── shared.ts        # SharedFlowNode 联合类型
        ├── client.ts        # ClientFlowNode 联合类型
        └── server.ts        # ServerFlowNode 联合类型
```

---

## 与 BanvasGL 的集成

Flow 引擎是 BanvasGL 的一等公民：

- **App** 持有 `FlowRunner` 实例（通过 `createClientFlowRunner()` 创建）
- **View.events**：12 个事件处理器（onClick/onLongPress/onInput 等），类型为 `FlowSchema | null`
- **View.lifetimes**：3 个生命周期钩子（onCreated/onAttach/onDestroy），类型为 `FlowSchema | null`
- **Scene.lifetimes**：4 个场景生命周期（onLoad/onUnload/onShow/onHide），类型为 `FlowSchema | null`
- **Scene.triggerSchema**：直接构造 FlowContext 并调用 `FlowRunner.run()`

后端通过 `@banyuan/banvasgl/flow/server` 的 `createServerFlowRunner()` 独立使用流程执行能力，无需依赖完整的 BanvasGL 图形引擎（但实际上共享同一个 npm 包的子路径导出）。

---

## 扩展指南

新增节点类型只需 3 步：

1. 在 `types/nodes/` 下定义节点接口，加入对应联合类型
2. 在 `executors/` 对应目录下实现执行器函数
3. 在对应 preset（client.ts 或 server.ts）中 `.register(kind, executor)`

无需修改 FlowRunner 本身。
