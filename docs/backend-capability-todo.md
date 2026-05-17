# 后端能力体系 TODO

> 对应架构决策：[ADR-011](./adr/011-backend-capability-system.md)  
> 实施顺序：Phase 1 → Phase 2 → Phase 3，每个 Phase 内部按编号顺序执行。
>
> **Phase 1（数据层）已全部完成**：AppSchema/AppFunction Model、SchemaService、OrmService、Schema/Data 路由、前端 api/schema.ts、api/data.ts、DatabaseTab 均已实现并上线。

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

- [ ] **P2-B4** 云函数执行沙箱  
  文件：`apps/banyan/backend/src/services/FunctionRunner.ts`  
  职责：在 banyan 后端进程内安全执行云函数代码，隔离措施：
  - 使用 Node.js `vm.runInNewContext` 执行，不直接 `eval`
  - 沙箱上下文只注入 `ctx`（AppDB + appId + env），不暴露 `require`、`process`、`__dirname` 等
  - 设置执行超时（默认 5s），超时后 `vm.Script` 抛出 `ERR_SCRIPT_EXECUTION_TIMEOUT`
  - 记录执行日志（入参、出参、耗时、错误），写入 `FunctionLog` Collection
  - **注**：当前方案是进程级隔离，安全性不如 V8 Isolate；多租户场景需评估迁移到独立 Worker 进程或 Deno/Cloudflare Workers（见 ADR-011 风险说明）

- [ ] **P2-B5** 扩展构建服务，生成 Koa 服务器壳子  
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
- **云函数代码安全**：执行隔离方案见 **P2-B4**（`FunctionRunner`）。存储 `code: string` 本身无安全风险，风险在执行层；当前用 `vm.runInNewContext` + 超时控制，满足单用户/私有部署场景；多租户 SaaS 场景需升级为独立 Worker 进程或 V8 Isolate 方案
- **构建产物版本对齐**：服务器壳子的 `package.json` 中 mongoose 版本需与 banyan 后端保持一致，避免运行时版本冲突
