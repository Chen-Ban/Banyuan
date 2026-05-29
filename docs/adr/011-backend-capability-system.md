# ADR-011: 后端能力体系 —— Schema Builder + 自动 ORM + 云函数 + AI 集成

**状态**: 已采纳（2026-05-28 修订：决策 4 与 ADR-028 统一）  
**日期**: 2026-05-17  
**决策者**: 陈班

---

## 背景

Banyuan 目前是一个纯前端低代码平台：用户可以通过拖拽或 AI 生成多页面可视化应用，但应用的后端逻辑（数据持久化、业务计算、第三方 API 调用）仍需用户自行开发。这使得平台的目标用户被限制在"有后端开发能力"的人群，与"让非技术用户也能构建完整应用"的核心理念相悖。

本 ADR 决策 Banyuan 后端能力体系的整体架构，覆盖三个层次：

1. **数据层**：Schema Builder + 自动 ORM（让用户无需写数据库代码）
2. **逻辑层**：云函数 Tab + 构建时服务器壳子（让用户用函数表达业务逻辑）
3. **AI 层**：AI 生成云函数（让用户用自然语言描述业务逻辑）

---

## 核心设计决策

### 决策 1：统一使用 MongoDB，不引入新数据库

**选择**：用户应用的业务数据与平台元数据（应用配置、页面 JSON）统一存储在同一个 MongoDB 实例，通过 Collection 命名空间隔离。

**理由**：
- 现有后端已基于 MongoDB + Mongoose，无需引入新的运维依赖
- MongoDB 的 schemaless 特性对低代码场景友好——用户随时可以加字段，不需要 migration
- 每个应用的业务数据存储在独立 Collection（命名规则：`app_{appId}_{collectionName}`），天然隔离
- 代价是关联查询能力弱于 SQL，但低代码场景的数据模型通常较简单，可接受

**放弃的方案**：
- SQLite（每应用一个 .db 文件）：隔离性好，但需要 migration 机制，增加用户心智负担
- 独立 MongoDB 实例：隔离性最好，但运维成本高，早期不值得

---

### 决策 2：Schema Builder 的数据模型设计

用户在 UI 上定义的数据模型（Collection + Fields）本身作为平台元数据，存储在新的 `AppSchema` MongoDB Collection 中。

**`AppSchema` 文档结构**：

```typescript
interface IAppSchema {
  appId: string                    // 关联的应用 ID
  collections: ICollectionDef[]    // 该应用定义的所有 Collection
  version: number                  // Schema 版本号（每次修改自增）
  createdAt: Date
  updatedAt: Date
}

interface ICollectionDef {
  name: string                     // Collection 名称（用户定义，如 "users"）
  displayName: string              // 显示名称（中文友好）
  fields: IFieldDef[]
}

interface IFieldDef {
  name: string                     // 字段名（英文，用于代码生成）
  displayName: string              // 显示名称
  type: FieldType                  // 见下方枚举
  required: boolean
  defaultValue?: unknown
  // 关联类型专用
  refCollection?: string           // type === 'ref' 时，关联的 Collection 名称
  // 枚举类型专用
  enumValues?: string[]            // type === 'enum' 时的可选值列表
}

type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'ref'        // 关联另一个 Collection（存储对方文档的 _id）
  | 'array'      // 简单数组（元素类型为 string/number）
  | 'object'     // 嵌套对象（自由结构，不做强约束）
```

**自动 ORM 层**：基于 `AppSchema` 动态生成 Mongoose Schema 和 Model，注入到云函数的执行上下文中。云函数通过 `ctx.db.{collectionName}` 访问，无需关心 MongoDB 连接和 Schema 定义。

---

### 决策 3：云函数的抽象模型

云函数是用户编写的 TypeScript/JavaScript 函数，具有以下约束：

```typescript
// 云函数签名
type CloudFunction = (
  input: Record<string, unknown>,   // 调用方传入的参数
  ctx: CloudFunctionContext          // 平台注入的上下文
) => Promise<unknown>

interface CloudFunctionContext {
  db: AppDB                          // 自动 ORM 访问层
  appId: string                      // 当前应用 ID
  env: Record<string, string>        // 环境变量（用户在 UI 上配置）
}

// 自动 ORM 访问层（每个 Collection 对应一个 accessor）
interface AppDB {
  [collectionName: string]: CollectionAccessor
}

interface CollectionAccessor {
  find(filter?: object, options?: { limit?: number; skip?: number; sort?: object }): Promise<Document[]>
  findOne(filter: object): Promise<Document | null>
  findById(id: string): Promise<Document | null>
  create(data: object): Promise<Document>
  updateById(id: string, data: object): Promise<Document | null>
  deleteById(id: string): Promise<boolean>
  count(filter?: object): Promise<number>
}
```

**云函数元数据**（存储在 `AppFunction` Collection）：

```typescript
interface IAppFunction {
  appId: string
  name: string                       // 函数名（英文，用于调用）
  displayName: string                // 显示名称
  description: string                // 功能描述（也是 AI 生成的 prompt）
  code: string                       // 函数体代码（TypeScript）
  inputSchema: Record<string, FieldType>   // 入参 Schema（用于前端绑定 UI）
  outputSchema: Record<string, FieldType>  // 出参 Schema
  createdAt: Date
  updatedAt: Date
}
```

---

### 决策 4：构建时生成应用服务器壳子，由 ADR-028 容器承载（2026-05-28 修订）

> **原方案核心思路保留**：构建时生成轻量 HTTP 服务壳子（Koa），将云函数暴露为 REST 端点。  
> **修订内容**：不再需要用户自己管理服务器进程，改由 ADR-028 的 deploy-agent 自动化部署到 Docker 容器中。每个应用一个容器，前端静态文件 + 后端云函数运行时一体打包。

**架构（与 ADR-028 统一）**：

```
租户 ECS
├── Nginx 网关 (:80/:443)
│     ├── app1.tenant.banyuan.app → Container: app1 (:3001)
│     └── app2.tenant.banyuan.app → Container: app2 (:3002)
│
├── Container: app1 (node:20-alpine)
│     ├── Koa 服务壳子
│     │     ├── 静态文件托管 (dist/)
│     │     ├── 数据 API (GET/POST /api/data/{collectionName})
│     │     └── 云函数路由 (POST /api/functions/{functionName})
│     ├── OrmService：根据 schema.json 动态生成 Mongoose Model
│     ├── FlowRunnerService：@banyuan/flow/server 执行云函数（FlowSchema JSON）
│     └── MongoDB 连接（集合前缀 app_{appId}_）
│
├── Container: app2 (node:20-alpine)
│     └── ...同上结构
│
└── deploy-agent（管理容器生命周期）
```

**每个应用 = 一个自包含的容器**，内部包含前端 + 后端一体：
- 前端 SPA 通过 Koa 静态中间件直接托管
- 后端根据用户在设计器中配置的数据表（AppSchema）自动提供 CRUD API
- 云函数以 FlowSchema JSON 形式存储，由 `createServerFlowRunner()` 解释执行
- 对于 `script` 类型节点（用户自定义代码），通过 `vm.runInNewContext()` 隔离执行

**构建产物结构**：

```
{appId}-{version}.tar.gz
├── dist/                  # 前端 SPA
│   ├── index.html
│   ├── assets/
│   └── pages.json
├── server/                # 后端服务壳子
│   ├── index.js           # Koa 入口（自动注册数据路由 + 云函数路由 + 静态托管）
│   ├── schema.json        # 数据表定义（AppSchema，用于动态生成 ORM）
│   ├── functions.json     # 云函数定义（FlowSchema JSON 数组）
│   └── package.json       # 最小依赖：koa + mongoose + @banyuan/flow
└── Dockerfile             # 基于 node:20-alpine 的标准镜像定义
```

**路由规则**：
- 页面访问：`GET https://{appSlug}.{tenantId}.banyuan.app/*` → 静态文件（SPA fallback）
- 数据操作：`POST https://{appSlug}.{tenantId}.banyuan.app/api/data/{collection}`
- 云函数调用：`POST https://{appSlug}.{tenantId}.banyuan.app/api/functions/{functionName}`

**与 ADR-028 的关系**：
- deploy-agent 负责：从 OSS 拉取产物 → docker build → docker run → 更新 Nginx 路由
- 端口分配由 deploy-agent 自动管理（每个容器分配一个内部端口，Nginx 反向代理）
- 纯静态应用（无云函数/无数据表）可降级为 `nginx:alpine` 容器，节省资源
- 版本回滚 = 停止当前容器 → 启动旧版本容器

---

### 决策 5：前端流程画布集成

在 FlowNode 体系中新增 `callCloudFunction` 节点类型：

```typescript
interface CallCloudFunctionNode extends FlowNodeBase {
  kind: 'callCloudFunction'
  functionName: string              // 引用的云函数名
  inputBindings: Record<string, ValueExpr>  // 入参绑定（可绑定到页面变量/事件参数）
  outputBindings: Record<string, string>    // 出参绑定到页面变量
}
```

在 PropertyPanel 新增 **Functions Tab**（与现有 Events Tab 并列），用于管理当前应用的云函数列表和 Schema Builder。

---

### 决策 6：AI 集成方式

AI 生成云函数复用 XiangDi 的 AgentLoop，新增一套工具集：

- `generate_cloud_function`：根据用户描述 + 当前应用的 AppSchema，生成云函数代码
- `update_cloud_function`：修改已有云函数
- `explain_cloud_function`：解释云函数逻辑（用于 code review）

AI 生成时，AppSchema 作为 ProjectSpec 的一部分注入到 AgentLoop 上下文，确保生成的代码与数据模型一致。

---

## 分阶段实施计划

### Phase 1：数据层（Schema Builder + 自动 ORM）

目标：用户能在 UI 上定义数据模型，后端能基于 Schema 提供 CRUD API。

- 新增 `AppSchema` Mongoose Model
- 新增 `AppFunction` Mongoose Model  
- 实现 `SchemaService`：Schema CRUD + 动态生成 Mongoose Model
- 实现 `OrmService`：基于 AppSchema 生成 CollectionAccessor
- 新增 Schema Builder REST API（`/api/apps/:appId/schema`）
- 新增自动 CRUD API（`/api/apps/:appId/data/:collectionName`）
- 前端：PropertyPanel 新增 **Database Tab**，实现 Schema Builder UI

### Phase 2：逻辑层（云函数 Tab + 构建时服务器壳子）

目标：用户能编写云函数，构建时生成可独立部署的服务器。

- 新增 `FunctionService`：云函数 CRUD + 代码编译验证
- 新增云函数 REST API（`/api/apps/:appId/functions`）
- 前端：PropertyPanel 新增 **Functions Tab**，内嵌代码编辑器（Monaco Editor）
- 扩展构建服务：生成 Hono 服务器壳子
- FlowNode 新增 `callCloudFunction` 节点类型
- 前端流程画布：`callCloudFunction` 节点的入参/出参绑定 UI

### Phase 3：AI 层（AI 生成云函数）

目标：用户用自然语言描述业务逻辑，AI 生成云函数代码。

- XiangDi 新增云函数工具集（`generate_cloud_function` 等）
- AppSchema 注入 AgentLoop ProjectSpec
- AiBar 支持云函数生成对话上下文切换
- 生成结果预览 + 一键应用到 Functions Tab

---

## 后果

**正面**：
- 用户无需写任何后端代码即可构建有数据持久化能力的完整应用
- 数据模型在 UI 上可视化管理，AI 生成函数时有明确的 Schema 上下文
- 构建产物自包含（前端 bundle + 服务器壳子），一键部署
- 与现有 XiangDi AgentLoop 体系无缝集成，AI 能力复用

**负面 / 风险**：
- MongoDB 关联查询能力弱，复杂业务场景（多表 join）体验差，需在 UI 上明确告知限制
- 云函数运行时隔离依赖 Node.js 进程级隔离，安全性不如 V8 Isolate（Cloudflare Workers 方案），早期可接受，生产环境需评估
- 动态生成 Mongoose Model 有内存泄漏风险（每次 Schema 变更需要清理旧 Model 缓存），需要在 `SchemaService` 中处理
