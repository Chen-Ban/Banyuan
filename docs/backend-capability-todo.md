# 后端能力体系 TODO

> 对应架构决策：[ADR-011](./adr/011-backend-capability-system.md)  
> 实施顺序：Phase 1 → Phase 2 → Phase 3，每个 Phase 内部按编号顺序执行。

---

## Phase 1：数据层（Schema Builder + 自动 ORM）

> 目标：用户能在 UI 上定义数据模型，后端能基于 Schema 提供 CRUD API。  
> 完成标志：用户在 Database Tab 建表后，能通过 `/api/apps/:appId/data/:collectionName` 读写数据。

### 后端

- [ ] **P1-B1** 新增 `AppSchema` Mongoose Model  
  文件：`apps/banyan/backend/src/models/AppSchema.ts`  
  字段：`appId`、`collections: ICollectionDef[]`、`version`、timestamps  
  索引：`appId`（unique）

- [ ] **P1-B2** 新增 `AppFunction` Mongoose Model（提前建好，Phase 2 填充）  
  文件：`apps/banyan/backend/src/models/AppFunction.ts`  
  字段：`appId`、`name`、`displayName`、`description`、`code`、`inputSchema`、`outputSchema`、timestamps  
  索引：`(appId, name)`（unique）

- [ ] **P1-B3** 更新 `models/index.ts`，导出 `AppSchemaModel`、`AppFunctionModel`

- [ ] **P1-B4** 实现 `SchemaService`  
  文件：`apps/banyan/backend/src/services/SchemaService.ts`  
  方法：
  - `getSchema(appId)` → `IAppSchema | null`
  - `upsertSchema(appId, collections)` → `IAppSchema`（version 自增）
  - `addCollection(appId, collectionDef)` → `IAppSchema`
  - `updateCollection(appId, collectionName, collectionDef)` → `IAppSchema`
  - `deleteCollection(appId, collectionName)` → `IAppSchema`（同时删除对应 MongoDB Collection 的所有数据，需二次确认）
  - `getDynamicModel(appId, collectionName)` → `mongoose.Model`（动态生成并缓存 Mongoose Model，注意清理旧缓存防内存泄漏）

- [ ] **P1-B5** 实现 `OrmService`  
  文件：`apps/banyan/backend/src/services/OrmService.ts`  
  职责：基于 `SchemaService.getDynamicModel` 提供 `CollectionAccessor`（find/findOne/findById/create/updateById/deleteById/count），供云函数执行上下文注入

- [ ] **P1-B6** 新增 Schema REST API  
  文件：`apps/banyan/backend/src/routes/schema.ts`  
  路由：
  - `GET  /api/apps/:appId/schema` → 获取完整 Schema
  - `PUT  /api/apps/:appId/schema/collections` → 新增 Collection
  - `PUT  /api/apps/:appId/schema/collections/:name` → 更新 Collection
  - `DELETE /api/apps/:appId/schema/collections/:name` → 删除 Collection（含数据）

- [ ] **P1-B7** 新增自动 CRUD REST API  
  文件：`apps/banyan/backend/src/routes/data.ts`  
  路由（基于 `OrmService`，运行时动态路由）：
  - `GET    /api/apps/:appId/data/:collection` → find（支持 query 参数：filter/limit/skip/sort）
  - `GET    /api/apps/:appId/data/:collection/:id` → findById
  - `POST   /api/apps/:appId/data/:collection` → create
  - `PUT    /api/apps/:appId/data/:collection/:id` → updateById
  - `DELETE /api/apps/:appId/data/:collection/:id` → deleteById

- [ ] **P1-B8** 在 `routes/index.ts` 注册 schema 和 data 路由

### 前端

- [ ] **P1-F1** 新增 `api/schema.ts`  
  封装 Schema CRUD 的 axios 调用

- [ ] **P1-F2** 新增 `api/data.ts`  
  封装自动 CRUD API 的 axios 调用

- [ ] **P1-F3** 新增 `PropertyPanel/DatabaseTab.tsx`  
  Schema Builder UI，功能：
  - Collection 列表（左侧）+ 字段编辑器（右侧）
  - 新增/删除 Collection
  - 新增/编辑/删除字段（字段名、类型、是否必填、默认值）
  - 字段类型支持：string / number / boolean / date / enum / ref / array / object
  - `ref` 类型：下拉选择当前应用的其他 Collection
  - `enum` 类型：可编辑枚举值列表
  - 保存时调用 `PUT /api/apps/:appId/schema/collections/:name`

- [ ] **P1-F4** 在 `PropertyPanel/index.tsx` 新增 **Database** Tab，渲染 `DatabaseTab`

---

## Phase 2：逻辑层（云函数 Tab + 构建时服务器壳子）

> 目标：用户能编写云函数，构建时生成可独立部署的 Hono 服务器。  
> 完成标志：构建产物包含 `dist/server/`，云函数可通过 `POST /functions/:name` 调用，流程画布可引用云函数节点。

### 后端

- [ ] **P2-B1** 实现 `FunctionService`  
  文件：`apps/banyan/backend/src/services/FunctionService.ts`  
  方法：
  - `listFunctions(appId)` → `IAppFunction[]`
  - `getFunction(appId, name)` → `IAppFunction | null`
  - `upsertFunction(appId, def)` → `IAppFunction`
  - `deleteFunction(appId, name)` → `void`
  - `validateCode(code)` → `{ valid: boolean; error?: string }`（用 TypeScript compiler API 做语法检查）

- [ ] **P2-B2** 新增云函数 REST API  
  文件：`apps/banyan/backend/src/routes/functions.ts`  
  路由：
  - `GET    /api/apps/:appId/functions` → 列表
  - `GET    /api/apps/:appId/functions/:name` → 详情
  - `PUT    /api/apps/:appId/functions/:name` → 新增/更新
  - `DELETE /api/apps/:appId/functions/:name` → 删除
  - `POST   /api/apps/:appId/functions/:name/validate` → 代码校验

- [ ] **P2-B3** 在 `routes/index.ts` 注册 functions 路由

- [ ] **P2-B4** 扩展构建服务，生成 Koa 服务器壳子  
  文件：`apps/banyan/backend/src/services/build/serverBundler.ts`  
  职责：
  - 从 MongoDB 读取应用的所有云函数代码
  - 生成 `server/index.ts`（Koa 入口，注册所有函数路由，注入 ORM ctx）
  - 用 esbuild 编译为 `dist/server/index.js`
  - 生成 `dist/server/package.json`（最小依赖：koa + @koa/router + koa-body + mongoose）
  - 在 `build/index.ts` 的构建流程中串联 `serverBundler`

### 前端

- [ ] **P2-F1** 新增 `api/functions.ts`  
  封装云函数 CRUD 的 axios 调用

- [ ] **P2-F2** 新增 `PropertyPanel/FunctionsTab.tsx`  
  云函数管理 UI，功能：
  - 函数列表（左侧）
  - 代码编辑器（右侧，Monaco Editor，TypeScript 语法高亮）
  - 函数元数据编辑：displayName、description、inputSchema、outputSchema
  - 保存 + 代码校验（调用 validate 接口，展示错误）
  - 删除函数

- [ ] **P2-F3** 在 `PropertyPanel/index.tsx` 新增 **Functions** Tab，渲染 `FunctionsTab`

- [ ] **P2-F4** 在 `IView.ts`（BanvasGL）的 `FlowNode` union 中新增 `CallCloudFunctionNode`  
  字段：`kind: 'callCloudFunction'`、`functionName: string`、`inputBindings`、`outputBindings`

- [ ] **P2-F5** 在 `FlowNodePalette.tsx` 新增"调用云函数"物料卡片

- [ ] **P2-F6** 在 `FlowCanvas.tsx` 的 `getPortsForNode` / `getNodeTitle` / `buildDefaultNode` 中处理 `callCloudFunction` 节点

- [ ] **P2-F7** 在 `FlowRunner.ts`（BanvasGL）中实现 `callCloudFunction` 节点的执行逻辑  
  运行时通过 `fetch POST /functions/:name` 调用，结果写入 `outputBindings` 指定的页面变量

- [ ] **P2-F8** `callCloudFunction` 节点的属性面板 UI  
  在 `EventsTab` 或独立组件中：选择函数名（下拉，来自 Functions Tab 列表）、配置入参绑定、配置出参绑定

---

## Phase 3：AI 层（AI 生成云函数）

> 目标：用户用自然语言描述业务逻辑，AI 生成云函数代码并写入 Functions Tab。  
> 完成标志：在 AiBar 中描述"帮我写一个查询所有用户的函数"，AI 生成代码并可一键应用。

### XiangDi

- [ ] **P3-X1** 新增云函数工具集  
  文件：`packages/XiangDi/src/tools/cloudFunctionTools.ts`  
  工具：
  - `generate_cloud_function(description, appSchema)` → 生成函数代码 + inputSchema + outputSchema
  - `update_cloud_function(name, description, currentCode, appSchema)` → 修改已有函数
  - `explain_cloud_function(name, code)` → 解释函数逻辑

- [ ] **P3-X2** 在 `tools/index.ts` 和 `src/index.ts` 导出新工具

- [ ] **P3-X3** 扩展 `ProjectSpec` 类型，支持 `appSchema` 字段注入  
  文件：`packages/XiangDi/src/spec/types.ts`

- [ ] **P3-X4** 在 `AiService.ts`（banyan 后端）中，调用 XiangDi 前读取 `AppSchema` 并注入 ProjectSpec

### 前端

- [ ] **P3-F1** AiBar 支持"云函数模式"上下文切换  
  当用户在 Functions Tab 中点击"AI 生成"时，AiBar 切换到云函数生成上下文，对话结果定向写入 Functions Tab

- [ ] **P3-F2** 云函数生成结果预览 UI  
  AI 返回代码后，在 FunctionsTab 中展示 diff 预览（新代码 vs 当前代码），用户确认后应用

- [ ] **P3-F3** 在 `FunctionsTab` 中为每个函数添加"AI 优化"入口  
  将当前函数代码 + description 发送给 AI，返回优化建议

---

## 跨阶段注意事项

- **动态 Mongoose Model 缓存**：`SchemaService.getDynamicModel` 需维护一个 `Map<string, mongoose.Model>`，Schema 变更时清理对应 key，防止 Mongoose 报"Cannot overwrite model once compiled"错误
- **Collection 命名规则**：MongoDB Collection 名统一为 `app_{appId}_{userDefinedName}`，避免与平台 Collection（`applications`、`conversations` 等）冲突
- **云函数代码安全**：Phase 2 阶段云函数在 banyan 后端进程内执行（`new Function` 或 `vm.runInNewContext`），需要限制可用 API（禁止 `require`、`process.exit` 等），Phase 3 后可评估迁移到独立 Worker 进程
- **构建产物版本对齐**：服务器壳子的 `package.json` 中 mongoose 版本需与 banyan 后端保持一致，避免运行时版本冲突
