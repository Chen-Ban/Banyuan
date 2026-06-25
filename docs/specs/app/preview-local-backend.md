# 预览态本地后端编排（复用 deploy-agent scaffoldServer）— 实施方案

## 关联决策

- **域 / 粒度 / 标题**：app / architecture / **A5. 预览态后端复用 deploy-agent 本地化——前后端异源混合态**
- **上游依赖**：
  - app / mechanism / **M4. 去中心化构建（租户端就地部署）** —— 提供 `scaffoldServer` 后端工程生成能力
  - app / protocol / **C4. deploy-agent ECS 守护进程 / WebSocket 反向连接** —— 本地预览模式是其「不持有业务库连接」约束的显式例外
  - app / mechanism / **M2.（预览部分由 A5 取代）** —— 原「预览 = Vite dev server」纯前端实现被本方案取代
- **协同决策**：engine / architecture / **A8a. 三态统一引擎，hook 层区分行为** —— A8a 负责预览态**前端渲染机制**（`flowEnabled=true` 运行策略），本方案负责预览态**后端侧**（本地起服务）。二者在预览态合流，互不重叠：A8a 管引擎机制与前端策略注入，本方案管本地后端服务编排。
- **协同方案**：`docs/specs/app/preview-default-mode-switch.md` —— 负责预览态**前端交互形态**（PreviewPage、顶部 switch、独立预览路由、切预览前自动保存）。本方案为其 PreviewPage 提供后端节点的真实执行端点；二者在「进入/退出预览态时注入/回收本地后端端点」处对接。
- **职责边界（与 engine spec / 前端 spec 的分工）**：`docs/specs/engine/tristate-unified-engine.md` 只定性「预览态注入运行策略 + `flowEnabled=true` + 后端节点端点指向本地」；`docs/specs/app/preview-default-mode-switch.md` 负责 banyan 前端如何组织预览/编辑页面与切换；本方案**只承载**本地后端如何起、连什么库、进程怎么管、怎么热更新——这些后端编排的「怎么做」。

---

## 目标

让预览态拥有一个**真实可执行的本地后端**，为 FlowSchema 的后端节点（`callFlow` → 服务端执行器 `dbQuery` / `dbInsert` / `dbUpdate` / `dbDelete` / `httpRequest` / `script` 等）提供真实执行端点，而非 mock 或内存假数据。同时严格遵守 A5「前端不部署、后端复用 scaffoldServer」的混合态边界。

具体达成：

1. **本地 Preview Server 起停**：复用 deploy-agent 的 `scaffoldServer` 生成后端工程，在 **Electron 主进程**（本地机器）起一个真实 Koa + `createServerFlowRunner()`（来自 `@banyuan/banvasgl/flow/server`）的后端进程。
2. **本地 Mongo 接入**：Preview Server 连本地 Mongo（非真实业务库），集合命名沿用 banyan 后端的 `app_{appId}_{collectionName}` 规则，保证 schema 行为与线上一致。
3. **运行时端点指向本地**：通过 `App.backendEndpoint` 属性设置本地 Preview Server 地址，`Scene.triggerSchema` 自动将 `env.callFlow` 注入为 HTTP POST 到该地址，无需任何自定义执行器或代理 hook。
4. **进程生命周期与热更新**：Preview Server 的启动/复用/销毁，以及 appJSON / CollectionSchema / CloudFunctions 变更后的热替换——这是预览体验的关键路径（详见下文「热更新」专节）。

非目标（本方案不处理）：

- 预览态**前端**渲染机制与**前端交互形态**（属 `docs/specs/app/preview-default-mode-switch.md`：PreviewPage、顶部 switch、切预览前自动保存）；本方案前端始终是 banyan 前端工程内的 PreviewPage（`useCanvasInit` + `flowEnabled: true`），不生成/部署第二套前端工程
- ECS 沙箱预览（C4 远端模式，仅作未来多人协作/企业版升级选项）
- `scaffoldServer` 自身的后端工程生成逻辑（已由 M4 落地，本方案只调用复用）

---

## 整体拓扑

```
banyan 编辑器（Electron App）
  ├── 前端渲染进程：PreviewPage 内 useCanvasInit(appJSON, { flowEnabled: true })
  │   └── callFlow 节点触发 → ctx.env.callFlow(flowId, input)
  │       → HTTP POST ${App.backendEndpoint}/api/functions/${flowId}
  │
  ├── Electron 主进程：PreviewServerOrchestrator（本方案负责）
  │   ├── 调用 scaffoldServer 生成后端工程到临时目录
  │   ├── 起 Koa + createServerFlowRunner() 进程
  │   └── 返回 { url: 'http://localhost:{port}' }
  │
  └── 本地 Preview Server（本方案负责）
      ├── FlowSchema 服务端执行器（dbQuery/dbInsert/httpRequest/script…）
      └── 本地 Mongo（app_{appId}_{collectionName}，非真实业务库）
```

**关键机制**：前端 FlowSchema 中不存在 dbQuery 等服务端节点——它们只出现在云函数 FlowSchema 中。前端 FlowSchema 通过 `callFlow` 节点调用云函数，`callFlow` 执行器读取 `ctx.env.callFlow`（一个函数），而该函数由 `Scene.triggerSchema` 根据 `App.backendEndpoint` 自动注入为 HTTP POST。因此预览态只需设上 endpoint 就完成了前后端联通——无需自定义执行器、无需代理 hook。

与线上态的唯一差异：部署目标（本地进程 vs ECS 容器）与数据库（本地 Mongo vs 真实业务库）。后端工程生成路径（appJSON+CollectionSchema+CloudFunctions → scaffoldServer → Koa+FlowRunner）与线上**同源**。

---

## 实施步骤（可执行）

**步骤 1：Preview Server 编排器（Electron 主进程）**

- 在 `apps/banyan/electron/` 的主进程新增 `PreviewServerOrchestrator`，**不在 banyan 后端**（banyan 后端是 Web 服务，不持有本地 scaffoldServer 进程）。
- 编排器职责：接收 `{ appId, appJSON, collectionSchemas, cloudFunctions }`（通过 Electron IPC），调用 `scaffoldServer` 生成后端工程到临时目录，install + 起进程，返回本地服务地址（`http://localhost:{port}`）。
- 端口分配：按 appId 维护端口表，同一 appId 复用同一端口（配合热更新进程复用）。
- 前端通过 `window.electronAPI.preview.start/stop/getStatus` IPC 接口与编排器通信。

**步骤 2：本地 Mongo 接入**

- Preview Server 的 mongoose 连接指向本地 Mongo（开发者环境自带或编排器按需拉起）。
- 集合命名严格沿用 `app_{appId}_{collectionName}`，确保 `SchemaService` / `OrmService` 行为与 banyan 后端线上一致。
- **C4 约束例外说明**：C4「deploy-agent 不持有业务库连接」仅约束 ECS 远程模式；本地预览连本地 Mongo 是 A5 的显式设计，已在 ADR app/protocol C4 回填例外。

**步骤 3：运行时端点注入（`App.backendEndpoint`）**

- PreviewPage 启动后，通过 `actions.app.setBackendEndpoint(info.url)` 将 Preview Server 地址设置到 `App.backendEndpoint` 属性。
- `Scene.triggerSchema` 在构造 `FlowContext` 时根据 `app.backendEndpoint` 自动注入 `env.callFlow` 函数（HTTP POST 到 `${endpoint}/api/functions/${flowId}`）。
- 退出预览态时 `actions.app.setBackendEndpoint(undefined)` 回收端点，`callFlow` 函数回到 undefined，编辑态不误请求后端。
- 非 Electron 环境（纯浏览器）降级：`backendEndpoint` 不设置，`callFlow` 为 undefined，后端节点静默不执行。

**步骤 4：进程生命周期管理**

- 启动：首次预览某 appId 时拉起 Preview Server。
- 复用：同一 appId 再次预览时复用已起进程（避免重复 scaffold+install+build 的高延迟）。
- 销毁：编辑器关闭应用 / 切换应用 / 长时间空闲时回收进程与临时目录，释放端口与本地 Mongo 连接。

**步骤 5：热更新（关键路径，见专节）**

---

## 热更新（预览体验生死命门，非锦上添花）

预览是**高频反复触发**的操作（改一下看一下）。若每次预览都走完整 `scaffoldServer → install → build → 起进程` 链路，体感极差，预览态将形同虚设。因此热更新不是可选优化，是本方案能否真正可用的决定性因素，**排期时不可当作低优先级长期搁置**——其工程量可能不低于三态引擎统一主线本身。

热更新要解决「改 appJSON / CollectionSchema / CloudFunctions 后立即生效」，候选机制（按落地复杂度递增，本 spec 给出方向，具体选型待评审）：

1. **进程复用 + 文件 diff**：保持 Preview Server 进程常驻，只把变更的 appJSON/CloudFunctions 文件 diff 写入运行目录。
2. **FlowRunner 热加载**：CloudFunctions（FlowSchema）变更时，让 `createServerFlowRunner()` 重新加载 FlowSchema 定义而不重启进程。
3. **CollectionSchema 增量迁移**：集合 schema 变更时，对本地 Mongo 做增量 schema 同步（`SchemaService` 复用线上同款逻辑），避免重建集合丢数据。

风险提示：CollectionSchema 变更涉及本地数据迁移，FlowSchema 热替换涉及运行时状态一致性，二者都不简单。建议分阶段落地：先「进程复用 + appJSON/CloudFunctions 热替换」打通高频场景，CollectionSchema 增量迁移作为后续增强。

---

## 验收标准

1. **后端真实可执行**：预览态点击触发带 `callFlow` 节点的 FlowSchema，`env.callFlow` 自动 HTTP POST 到本地 Preview Server，服务端 FlowRunner 真实执行云函数（含 dbQuery 等服务端节点）并返回数据。
2. **与线上后端同源**：同一份 appJSON+CollectionSchema+CloudFunctions，本地 Preview Server 与 ECS 线上后端执行结果一致（仅数据源不同）。
3. **集合命名一致**：本地 Mongo 中集合名为 `app_{appId}_{collectionName}`，与 banyan 后端线上规则一致。
4. **前端不部署**：预览态全程不调用 `scaffoldProject`、不起前端 Vite/工程、不使用 iframe（前端始终是编辑器内 `useCanvasInit` + `flowEnabled: true`）。
5. **进程复用生效**：同一 appId 二次预览不重新走 install/build，复用已起进程。
6. **热更新生效**：改 appJSON / CloudFunctions 后预览立即反映变更，无需重启 Preview Server（CollectionSchema 增量迁移按分阶段验收）。
7. **端点隔离**：退出预览态后 `App.backendEndpoint = undefined`，`callFlow` 为 undefined，编辑态不再向 Preview Server 发后端请求。

---

## 影响范围

| 文件 / 模块                                                              | 改动类型                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `apps/banyan/electron/`（主进程）                                        | PreviewServerOrchestrator：IPC handler + 编排 scaffoldServer 进程          |
| `apps/banyan/frontend/src/api/previewServer.ts`                          | 前端 IPC 封装（`startPreviewServer` / `stopPreviewServer` / `isElectron`） |
| `apps/banyan/frontend/src/pages/PreviewPage/`                            | 调用 `actions.app.setBackendEndpoint(url)` 注入/回收端点                   |
| `packages/banvasgl/src/engine/App.ts`                                    | 新增 `backendEndpoint` 属性                                                |
| `packages/banvasgl/src/engine/scene/Scene.ts`                            | `triggerSchema` 中根据 `backendEndpoint` 注入 `env.callFlow`               |
| `packages/banvasgl/src/types/hook/hook.ts` + `src/actions/appActions.ts` | `IAppActions` 新增 `setBackendEndpoint` / `getBackendEndpoint`             |
| `packages/deploy-agent`（`scaffoldServer`）                              | 复用，按需暴露「本地起服务 + 连本地 Mongo」入口（不改 ECS 远程路径）       |
| 本地 Mongo 接入                                                          | 编排器按 appId 管理连接与集合命名                                          |

---

## 覆盖边界（诚实声明，与 app/A5 一致）

预览态是「编辑器内的前端 + 本地起的后端」的前后端异源形态，存在两个明确盲区，**预览通过 ≠ 可上线**：

1. **不覆盖前端构建产物**：预览验的是 `useCanvasInit` + `flowEnabled: true` 在 banyan 编辑器宿主里的运行行为，而非 `scaffoldProject` 产出的前端工程行为。二者若漂移（打包配置/路由/资源路径/环境变量注入差异）预览照不出。
2. **不覆盖部署正确性与数据真实性**：本地后端验「逻辑正确性」；线上后端跑在 Docker 容器 + nginx 反代 + 真实业务库上，本地省掉了容器化、网络拓扑、数据规模与权限边界。预览态不承担集成测试/准生产验证职责。
