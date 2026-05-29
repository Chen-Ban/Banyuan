# BanvasFlow — 声明式流程执行器（`@banyuan/flow`）

BanvasFlow 是 Banyuan 的声明式流程控制引擎。它将组件间的交互逻辑（点击跳转、条件分支、动画播放、数据操作等）抽象为 `FlowSchema`（有向图 JSON），通过 `FlowRunner` 解释执行。

本包是**纯 TypeScript 实现**，零运行时依赖，不依赖 DOM/React，可同时运行在浏览器和 Node.js 环境。

---

## 核心概念

### FlowSchema

FlowSchema 是一个有向图的 JSON 描述，包含节点（Node）和边（Edge）。每个节点代表一个操作步骤，边定义执行顺序和条件分支。

```ts
const schema: FlowSchema = {
  nodes: [
    { id: 'n1', type: 'condition', config: { expression: 'age > 18' } },
    { id: 'n2', type: 'navigate', config: { pageId: 'page-home' } },
    { id: 'n3', type: 'navigate', config: { pageId: 'page-login' } },
  ],
  edges: [
    { source: 'n1', target: 'n2', condition: 'true' },
    { source: 'n1', target: 'n3', condition: 'false' },
  ],
  entryNodeId: 'n1'
}
```

### FlowRunner

FlowRunner 从 `entryNodeId` 开始，按边的方向逐节点执行，遇到条件节点时根据表达式选择分支路径。

### NodeExecutor

每种节点类型对应一个 `NodeExecutor`，通过 `NodeExecutorRegistry` 注册。内置三类执行器：

- **shared**（环境无关）：condition（条件分支）、delay（延迟）、setVariable（设置变量）、callFlow（调用子流程）
- **client**（浏览器端）：navigate（页面跳转）、animate（播放动画）、setData（设置 View 数据）、setVisible（控制可见性）
- **server**（Node.js 端）：dbQuery/dbInsert/dbUpdate/dbDelete（数据库操作）、httpRequest（HTTP 请求）、script（脚本执行）、transform（数据转换）

---

## 多入口设计

| 入口 | 导入路径 | 内容 |
|------|----------|------|
| 主入口 | `@banyuan/flow` | FlowRunner + 类型 + Registry + 所有执行器 |
| Client | `@banyuan/flow/client` | 预组装的客户端 FlowRunner（shared + client 执行器） |
| Server | `@banyuan/flow/server` | 预组装的服务端 FlowRunner（shared + server 执行器） |
| Types | `@banyuan/flow/types` | 仅类型导出（FlowSchema、NodeConfig 等） |

---

## 快速上手

### 客户端使用（浏览器/React 应用）

```ts
import { createClientFlowRunner } from '@banyuan/flow/client'

const runner = createClientFlowRunner()
await runner.execute(flowSchema, {
  variables: { age: 20 },
  getViewData: (viewId) => scene.getView(viewId).getData(),
  navigate: (pageId) => router.push(pageId),
  animate: (viewId, animation) => animationManager.play(viewId, animation),
})
```

### 服务端使用（Node.js/构建产物）

```ts
import { createServerFlowRunner } from '@banyuan/flow/server'

const runner = createServerFlowRunner()
await runner.execute(flowSchema, {
  variables: {},
  db: mongooseConnection,
  httpClient: axios,
})
```

### 自定义执行器

```ts
import { FlowRunner, NodeExecutorRegistry } from '@banyuan/flow'

const registry = new NodeExecutorRegistry()
registry.register('my-custom-node', {
  execute: async (node, context) => {
    // 自定义执行逻辑
    return { next: node.edges[0]?.target }
  }
})

const runner = new FlowRunner(registry)
await runner.execute(schema, context)
```

---

## 目录结构

```
src/
├── index.ts              # 主入口（类型 + 运行时 + 执行器）
├── types/
│   ├── schema.ts         # FlowSchema 类型定义
│   ├── values.ts         # 值节点类型（variable/pageVar/eventParam）
│   └── nodes/            # 各节点类型定义（shared/client/server）
├── runtime/
│   ├── FlowRunner.ts     # 流程执行器核心
│   ├── resolveValue.ts   # 值解析（变量引用、表达式求值）
│   └── context.ts        # 执行上下文类型
├── executors/
│   ├── registry.ts       # NodeExecutor 注册表
│   ├── shared/           # 环境无关执行器（condition/delay/setVariable/callFlow）
│   ├── client/           # 浏览器端执行器（navigate/animate/setData/setVisible）
│   └── server/           # 服务端执行器（db*/httpRequest/script/transform）
└── presets/
    ├── client.ts         # createClientFlowRunner 工厂
    └── server.ts         # createServerFlowRunner 工厂
```

---

## 构建

```bash
pnpm --filter @banyuan/flow build   # 生产构建
pnpm --filter @banyuan/flow dev     # 开发模式（watch）
```

---

## 与其他包的关系

- **@banyuan/banvasgl**：依赖本包（`@banyuan/flow`），App 内置 FlowRunner 实例，Scene 直接调用 FlowRunner.run
- **@banyuan/flow-design**：流程图可视化编辑器，编辑的产物即本包消费的 `FlowSchema`
- **apps/banyan/backend**：服务端使用 `@banyuan/flow/server` 执行服务端流程
- **@banyuan/banvas-runtime**：运行态通过本包执行客户端流程逻辑
