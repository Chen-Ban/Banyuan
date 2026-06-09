# 默认预览态与预览/编辑态切换（前端交互形态）— 实施方案

## 关联决策

- **域 / 粒度 / 标题**：app / principle / **P5. 80/20 哲学下默认预览态**（本方案的产品依据：为什么默认预览而非编辑）
- **上游依赖**：
  - app / architecture / **A5. 预览态后端复用 deploy-agent 本地化——前后端异源混合态** —— 提供预览态「前端与编辑态同源（同一前端工程/同一运行时/同一 appJSON，允许独立 PreviewPage）」的拓扑边界
  - engine / architecture / **A8a. 三态统一引擎，hook 层区分行为** —— 提供 `useDesignBanvas`（编辑策略，`flowEnabled=false`）与运行态渲染（`useCanvasInit` + `flowEnabled=true`）两套模式
- **协同方案**：
  - `docs/specs/app/preview-local-backend.md` —— 负责预览态**后端侧**（Electron 主进程起 scaffoldServer + 本地 Mongo + 运行时端点指向）。本方案负责预览态**前端交互形态**（页面拆分、顶部 switch、路由、切前自动保存），二者在预览态合流，互不重叠。
  - `docs/specs/engine/tristate-unified-engine.md` —— 负责预览态**前端渲染机制**（`flowEnabled` gate + 三态统一）。本方案是它在 banyan 应用层的**消费方**：把运行态画布装进一个独立 PreviewPage。
- **职责边界（一句话）**：tristate spec 管「引擎怎么提供运行态画布」；本 spec 管「banyan 前端怎么把编辑态/预览态组织成两个页面、默认进哪个、怎么切、切之前怎么存」。

---

## 目标

把 banyan 前端从「只有编辑态单页面」改造成「默认预览、可切编辑、独立发布线上」的三态产品形态，落地 P5 的产品主张：

1. **默认预览态**：用户每次进入应用，默认落在预览态（应用真实跑起来的样子），态选择不持久化。
2. **页面拆分**：编辑态页面（UIPage，`useDesignBanvas` + 物料/属性/右键编辑装备）与预览态页面（PreviewPage，`useCanvasInit` + `flowEnabled: true`，无任何编辑装备）拆成两个平级页面，同处 banyan 前端工程、加载同一份落库 appJSON。
3. **顶部 switch 二态切换**：在 `ApplicationLayout` 顶部新增「预览 ⇄ 编辑」二态 switch；线上发布保持独立动作（既有🚀生成应用按钮），不并入 switch。
4. **切预览前自动保存**：从编辑态切到预览态前，自动把当前 appJSON 保存落库，预览态加载落库版本，保证「预览所见 = 编辑所存」。
5. **独立预览路由**：预览态有独立路由 `/application/:id/preview`，switch 切换即切路由。

非目标（本方案不处理）：

- 预览态**后端**如何起、连什么库、进程怎么管、热更新（属 app/A5 + `preview-local-backend.md`）
- 运行态画布 hook 的实现（引擎层已提供 `useCanvasInit` + `flowEnabled` 配置，本方案直接使用）
- 线上态发布流程本身（既有 handleBuild / deploy-agent Production Mode，不在本方案改动范围）

---

## 现状（落地前）

`apps/banyan/frontend` 当前**没有任何「态」概念**，整个应用即编辑态：

- `ApplicationLayout`（`src/layouts/ApplicationLayout/index.tsx`）顶部三胶囊：返回 / Tab（画布·数据库·云函数）/ 操作（保存💾 `handleSave` · 生成应用🚀 `handleBuild`）。
- Tab 切换不是真子路由，而是 `ApplicationLayout` 内部依据 `location.pathname.endsWith` 判断 `activeTabKey`（database/functions/默认 ui），三子页面 `<UIPage/>` / `<DatabasePage/>` / `<FunctionsPage/>` 用 KeepAlive（`display` none/flex）同时挂载、切换显隐。
- `UIPage`（`src/pages/UIPage/index.tsx`）只挂 `useDesignBanvas(...)`，整页编辑态：ComponentPalette（物料）、PropertyDrawer（属性）、DesignContextMenu（右键）、SaveMaterialModal、selectedViewId 选中态、canvasSize 调节。保存走 `appContentApi.saveAppContent(application_id, serialized)`（ADR-042：画布内容走独立 app-content 端点），序列化用 `actions.app.getSerializedApp()`。
- 路由（`src/routes/index.tsx`）是 `application/:id/*` 通配，Tab 由 `ApplicationLayout` 内 `activeTabKey` 判断 + KeepAlive 实现，**不是逐个声明的真子路由**。

> **「独立预览路由」的真实含义**：因为现状是通配路由 + `activeTabKey` 判断 + KeepAlive，所谓「独立路由 `/application/:id/preview`」的落地方式**不是**在 `routes/index.tsx` 加一行路由声明，而是在 `ApplicationLayout` 的 `activeTabKey` 判断里新增 `preview` 分支，并把 PreviewPage 纳入 KeepAlive 组（或按需挂载，见步骤 3 的取舍）。

---

## 实施步骤（可执行）

**前置依赖**：`useCanvasInit` hook 已支持 `flowEnabled: true` 配置（引擎层已提供）。本地 Preview Server（`preview-local-backend.md`）就绪后后端节点才能真实执行。在 Preview Server 就绪前，PreviewPage 可先搭壳运行——前端 FlowSchema 正常执行，仅 `callFlow` 节点因 `env.callFlow` 为 undefined 而静默跳过。

**步骤 1：新建 PreviewPage（预览态页面）** ✅ 已落地

- 在 `apps/banyan/frontend/src/pages/` 新增 `PreviewPage/`，与 UIPage 平级。
- 使用 `useCanvasInit(loaded ? appJSON : '', { flowEnabled: true, width: 1280, height: 800 })`，真跑 FlowSchema。
- **不挂任何编辑装备**：无 ComponentPalette / PropertyDrawer / DesignContextMenu / SaveMaterialModal / selectedViewId / canvasSize 调节面板。整页只有画布本身 + 状态栏。
- appJSON 数据源与 UIPage 同源：加载 `applicationApi.fetchApplication(id)` 读出的落库 appJSON。
- 后端节点端点：PreviewPage 内通过 `actions.app.setBackendEndpoint(info.url)` 注入 Preview Server 地址；退出时 `actions.app.setBackendEndpoint(undefined)` 回收。

**步骤 2：顶部 switch（预览 ⇄ 编辑）** ✅ 已落地

- 在 `ApplicationLayout` 顶部操作区新增预览/编辑态 toggle（PlayCircleOutlined / EditOutlined 图标切换）。
- 切换即切路由：预览态路由 `/application/:id/preview`，编辑态路由 `/application/:id`。
- 线上发布保持现状🚀生成应用按钮，**不并入** switch。

**步骤 3：路由与页面挂载（`activeTabKey` 加 preview 分支）** ✅ 已落地

- 在 `ApplicationLayout` 中根据 `location.pathname` 判断当前是否为 preview 模式。
- 预览态时渲染 `<PreviewPage />`（按需挂载），隐藏编辑态的 Tab（画布·数据库·云函数）。
- 编辑态时维持现有 UIPage / DatabasePage / FunctionsPage KeepAlive 逻辑不变。

**步骤 4：切预览前自动保存**

- 从编辑态切预览态时（switch `edit`→`preview` 或直接导航到 `/preview`），先调用 UIPage 现有的保存链路：`actions.app.getSerializedApp()` → `appContentApi.saveAppContent(application_id, serialized)`，**等保存成功**再切到 PreviewPage。
- PreviewPage 加载的是这份刚落库的 appJSON，保证「预览所见 = 编辑所存」。
- 保存失败时阻断切换并提示（不切到一个与编辑态不一致的预览）。
- 默认进入应用即预览态：此时无「未保存的编辑」，直接加载落库 appJSON，无需触发保存。

**步骤 5：默认态落地**

- 应用入口（导航到 `/application/:id`）后，`ApplicationLayout` 默认把 `activeTabKey` 解析为 `preview`（或入口处直接 `navigate` 到 `/preview`），首屏即预览态。
- 编辑态（ui Tab）/ 数据库 / 云函数仍可通过 Tab 或 switch 进入，但都不是默认首屏。

---

## 三态与页面/ hook 对应关系

| 态 | 页面 | hook | flowEnabled | 编辑装备 | 数据源 | 后端 |
|----|------|------|-------------|---------|--------|------|
| 编辑态 | UIPage | `useDesignBanvas` | false | 物料/属性/右键/选中/canvas 调节 | 落库 appJSON | 不请求后端节点 |
| 预览态 | PreviewPage | `useCanvasInit` | true | 无 | 同一份落库 appJSON | 本地 Preview Server（preview-local-backend.md） |
| 线上态 | （deploy-agent 产物） | 产物内 runtime | true | 无 | 部署快照 | ECS 真实后端 |

三态同一前端工程、同 import `@banyuan/banvasgl`、同 appJSON 数据契约，差异仅在 hook 与运行宿主——完全符合 A8a「三态统一引擎」与 A5「前端同源」。

---

## 验收标准

1. **默认预览**：进入任一应用，首屏是预览态（PreviewPage），FlowSchema 真实运行，无物料/属性/右键面板。
2. **不持久化**：刷新或重新进入应用，仍回到预览态，即使上次停在编辑态。
3. **switch 切换**：顶部 switch 在预览 ⇄ 编辑间切换，路由随之在 `/application/:id/preview` ⇄ `/application/:id` 切换。
4. **发布独立**：🚀生成应用按钮独立存在，不在 switch 内，预览/编辑切换不触发发布。
5. **切前自动保存**：在编辑态做改动后切预览，预览态加载的是刚落库的最新 appJSON（预览所见 = 编辑所存）；保存失败时阻断切换。
6. **预览页无编辑装备**：PreviewPage 不渲染 ComponentPalette / PropertyDrawer / DesignContextMenu / SaveMaterialModal，无 selectedViewId 选中交互。
7. **同源验证**：UIPage 与 PreviewPage 加载同一 appId 的同一份 appJSON，无第二套前端工程打包、无 iframe。
8. **后端联动**：预览态触发带后端节点的 FlowSchema 时，`callFlow` 通过 `App.backendEndpoint` 自动 HTTP POST 到本地 Preview Server 并正确回流数据（联合 `preview-local-backend.md` 验收）。

---

## 影响范围

| 文件 / 模块 | 改动类型 |
|------|---------|
| `apps/banyan/frontend/src/pages/PreviewPage/` | 新建预览态页面（`useCanvasInit` + `flowEnabled: true`，无编辑装备） |
| `apps/banyan/frontend/src/layouts/ApplicationLayout/index.tsx` | 顶部新增预览/编辑 toggle；preview 模式判断；渲染 PreviewPage；切预览前触发自动保存 |
| `apps/banyan/frontend/src/pages/UIPage/index.tsx` | 暴露/复用序列化+保存链路供切换前调用（`getSerializedApp` + `saveAppContent`），编辑装备维持不变 |
| `apps/banyan/frontend/src/routes/index.tsx` | 通配路由不变；如按需挂载方案，调整 PreviewPage 的挂载/卸载时机 |

---

## 覆盖边界（与 A5 / preview-local-backend.md 一致）

预览态前端是「banyan 前端工程内独立 PreviewPage + `useCanvasInit(flowEnabled: true)`」，**预览通过 ≠ 可上线**：

1. **不覆盖前端构建产物**：PreviewPage 验的是 `useCanvasInit` 在 banyan 宿主里的运行行为，而非 `scaffoldProject` 产出的线上前端工程行为，二者若漂移预览照不出（与 A5 覆盖边界一致）。
2. **依赖前置能力就绪**：本方案的完整可用性依赖本地 Preview Server（preview-local-backend.md）。在其就绪前，PreviewPage 可运行但 `callFlow` 节点因 `env.callFlow` 为 undefined 而不执行后端逻辑。
