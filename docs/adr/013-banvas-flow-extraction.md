# ADR-013: 将流程控制从 BanvasGL 独立为 BanvasFlow 包

> 状态：已接受
> 日期：2025-07-16
> 决策者：chenxin176

## 背景

BanvasGL 当前承载了两种职责：2D 图形渲染/编辑 和 FlowSchema 流程执行。FlowRunner 是一个纯逻辑执行器，零渲染依赖——不导入 Renderer、Canvas、Camera 中的任何模块，仅通过 `RuntimeContext` 接口间接操作 View 数据。

同时，banyan 后端的"云函数"采用 JavaScript 代码 + vm 沙箱的方式执行业务逻辑，与前端的 FlowSchema 可视化流程形成两套并行体系。这导致：

1. 前端用 FlowSchema 描述交互逻辑，后端用 JS 代码描述业务逻辑——两种范式，维护成本高
2. 网络传输可执行代码（JS 字符串）存在安全风险，vm 沙箱隔离不是银弹
3. FlowRunner 放在 BanvasGL 中，后端无法直接复用（banyan 后端禁止 import banvasgl）
4. 新增流程节点类型需要改动 BanvasGL（图形引擎），违反单一职责

## 决策

将流程控制相关代码从 BanvasGL 中独立为 `packages/BanvasFlow`（npm: `banvas-flow`），采用策略注册表模式，前后端通过不同的节点执行器集实现各自的逻辑能力。

## 核心设计

### 1. 策略注册表模式

FlowRunner 从"巨大 switch/case"重构为 kind-agnostic 的纯调度器，通过 `NodeExecutorRegistry` 注册节点执行器。新增节点类型只需注册新的执行器，无需修改 FlowRunner 本身。

```typescript
// 核心调度器——不关心具体有哪些 kind
class FlowRunner {
  constructor(private registry: NodeExecutorRegistry) {}
  async run(schema: FlowSchema, ctx: FlowContext): Promise<void> { ... }
}

// 执行器签名
type NodeExecutor = (node, ctx, resolve) => Promise<'true' | 'false' | void>

// 注册表
class NodeExecutorRegistry {
  register(kind: string, executor: NodeExecutor): this
  get(kind: string): NodeExecutor | undefined
}
```

### 2. FlowContext 抽象接口

替代原有的 `RuntimeContext`（直接依赖 IView 和 Scene），改为环境无关的抽象接口：

```typescript
interface FlowContext {
  getVariable(scope: string, key: string): unknown
  setVariable(scope: string, key: string, value: unknown): void
  eventArgs: unknown[]
  env: Record<string, unknown>  // 环境特定能力注入
}
```

前端由 BanvasGL 提供 `BanvasFlowContext` 实现（内部操作 View/Scene），后端由 banyan 提供 `ServerFlowContext` 实现（内部操作 DB/变量表）。

### 3. 前后端节点集隔离

| 分类 | 节点 kind | 执行环境 |
|------|-----------|----------|
| 共享 | condition, delay, setVariable, callFlow | 前端 + 后端 |
| 前端专属 | navigate, animate, setData, setVisible | 仅浏览器 |
| 后端专属 | dbQuery, dbInsert, dbUpdate, dbDelete, httpRequest, transform, script | 仅 Node.js |

源码按目录物理隔离：`executors/shared/`、`executors/client/`、`executors/server/`。

### 4. 预组装导出

面向使用者提供两个便捷入口，无需手动组装注册表：

```typescript
import { createClientFlowRunner } from 'banvas-flow/client'  // 前端用
import { createServerFlowRunner } from 'banvas-flow/server'  // 后端用
```

同时保留底层 API 供高级用户自定义扩展：

```typescript
import { FlowRunner, NodeExecutorRegistry } from 'banvas-flow'
```

### 5. script 节点——自定义脚本的安全边界

原"JS 云函数"降级为 FlowSchema 中的一种后端节点（`kind: 'script'`）：

- 输入：只能读取 `inputBindings` 声明的变量（从 FlowContext 中取值注入沙箱）
- 输出：只能写入 `outputBindings` 声明的变量（沙箱返回值按声明写回 FlowContext）
- 执行：仍然使用 vm 沙箱，但被 FlowRunner 的执行上下文严格约束
- 安全：即使脚本代码恶意，也无法越权访问未声明的变量或系统资源

### 6. callFlow 节点——前后端互调

`callFlow` 是跨环境调用的统一机制：

- 前端 `callFlow` → HTTP POST → 后端 FlowRunner 执行一个后端 FlowSchema → 返回结果
- 后端 `callFlow` → 直接本地调用另一个后端 FlowSchema（函数组合）
- 传输内容始终是 FlowSchema ID + 输入变量（JSON），而非可执行代码

## 包结构

```
packages/BanvasFlow/
├── src/
│   ├── types/
│   │   ├── schema.ts          # FlowSchema, FlowNode, FlowEdge
│   │   ├── values.ts          # FlowValue, FlowCondition
│   │   ├── nodes/
│   │   │   ├── shared.ts      # 共享节点类型定义
│   │   │   ├── client.ts      # 前端节点类型定义
│   │   │   └── server.ts      # 后端节点类型定义
│   │   └── index.ts
│   ├── runtime/
│   │   ├── FlowRunner.ts      # 核心调度器
│   │   ├── resolveValue.ts    # FlowValue 解析器
│   │   ├── context.ts         # FlowContext 接口
│   │   └── index.ts
│   ├── executors/
│   │   ├── registry.ts        # NodeExecutorRegistry
│   │   ├── shared/            # 4 个共享执行器
│   │   ├── client/            # 4 个前端执行器
│   │   ├── server/            # 7 个后端执行器
│   │   └── index.ts
│   ├── presets/
│   │   ├── client.ts          # createClientFlowRunner()
│   │   └── server.ts          # createServerFlowRunner()
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 依赖方向

```
banvas-flow (零外部依赖)
  ▲                ▲
  │                │
banvasgl           apps/banyan/backend
(peerDep)          (dependency)
  │
apps/banyan/frontend
```

## package.json exports

```json
{
  "name": "banvas-flow",
  "exports": {
    ".":        { "import": "./dist/index.mjs",           "types": "./dist/index.d.ts" },
    "./client": { "import": "./dist/presets/client.mjs",  "types": "./dist/presets/client.d.ts" },
    "./server": { "import": "./dist/presets/server.mjs",  "types": "./dist/presets/server.d.ts" },
    "./types":  { "import": "./dist/types/index.mjs",     "types": "./dist/types/index.d.ts" }
  }
}
```

## 对现有代码的影响

| 当前位置 | 迁移后 | 说明 |
|---------|--------|------|
| `BanvasGL/src/core/interfaces/IView.ts` 中 Flow* 类型 | `BanvasFlow/src/types/` | BanvasGL 改为 `import type { FlowSchema } from 'banvas-flow'` |
| `BanvasGL/src/core/runtime/FlowRunner.ts` | `BanvasFlow/src/runtime/FlowRunner.ts` | 重构为 registry 模式 |
| `BanvasGL/src/core/interfaces/IRuntime.ts` | `BanvasFlow/src/runtime/context.ts`（抽象接口）+ BanvasGL 提供实现 | 接口解耦 |
| `Scene.triggerSchema` | 内部使用 `createClientFlowRunner()` | 接口不变，实现换底 |
| `banyan/backend/FunctionRunner.ts` | 改为使用 `createServerFlowRunner()` | 统一执行引擎 |
| `banyan/backend/serverBundler.ts` | 生成的服务引入 `banvas-flow/server` | 全平台一致 |
| `BanvasGL/src/core/views/flow/` | 保留在 BanvasGL | 流程图编辑器渲染图元，属于画布渲染 |
| `BanvasGL/src/hook/useFlowBanvas/` | 保留在 BanvasGL | 流程图编辑器交互 hook |

## 云函数演进路径

```
现状：
  前端 FlowSchema → callCloudFunction → HTTP → vm 执行 JS 代码

迁移后：
  前端 FlowSchema → callFlow → HTTP → 后端 FlowRunner 执行后端 FlowSchema
  后端 FlowSchema 中可含 dbQuery / httpRequest / transform / script 等节点
  "JS 云函数" = 一个仅含 script 节点的后端 FlowSchema（向后兼容）
```

用户视角：
- 非技术用户：在 FlowCanvas 中拖拽后端节点，完全不写代码
- 技术用户：使用 script 节点写少量 JS，但输入输出受流程约束，可审计

网络传输安全性：前后端传输的始终是 FlowSchema JSON（声明式结构化数据），不再是可执行代码。

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 后端节点表达力不足，无法覆盖复杂业务逻辑 | script 节点作为逃生舱，保留 JS 编写能力 |
| transform 节点的表达式语言安全性 | 使用受限表达式引擎（如 expr-eval），不支持任意 JS |
| 循环/递归支持缺失 | 短期通过 script 节点 + MAX_STEPS 防护；长期可新增 forEach 节点 |
| 迁移期间两套体系并存 | callCloudFunction 节点保留为 deprecated 别名，内部转为 callFlow |

## 备选方案（已否决）

1. **只拆类型不拆执行器**：FlowRunner 仍在 BanvasGL 中，只把类型独立。否决原因：后端仍无法复用 FlowRunner。
2. **BanvasGL 新增 `./flow` 子路径导出**：后端可通过子路径导入。否决原因：依赖方向错误（后端引入了图形引擎包），且 BanvasGL 的 peerDep react 对后端无意义。
3. **后端独立实现一套 FlowRunner**：否决原因：两套执行引擎行为可能不一致，维护成本翻倍。
