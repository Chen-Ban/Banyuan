# AGENTS.md — Banyuan AI Coding 导航手册

> 本文件为 AI Coding Agent（Cursor、Copilot、CatDesk 等）提供仓库导航。
> 当 Agent 需要在本仓库中进行代码生成、修改、重构时，应首先阅读此文件。

## 项目概览

Banyuan（班园）是一个 pnpm monorepo，包含自研面向声明式 UI 的 2D 图形运行时（含流程控制）、AI Agent 引擎、低代码平台。

核心理念：「会想，就会做」—— 用户通过拖拽或 AI 自然语言生成多页面可视化应用，一键构建为跨平台桌面安装包。

## Monorepo 结构

```
Banyuan/
├── packages/
│   ├── banvasgl/            # 面向声明式 UI 的 2D 图形运行时（含流程控制） (npm: @banyuan/banvasgl)
│   ├── banvas-runtime/      # BanvasGL 运行策略层：高级交互识别 + useRuntimeBanvas hook (npm: @banyuan/banvas-runtime)
│   ├── xiangdi-agent/       # AI Agent 引擎 (npm: @banyuan/xiangdi-agent)
│   └── deploy-agent/        # 部署代理，运行在租户 ECS 上接收并执行部署指令 (npm: @banyuan/deploy-agent)
├── apps/
│   ├── banyan/              # 低代码平台应用
│   │   ├── frontend/        #   React 19 + Vite + Ant Design 6 (:5174)
│   │   ├── backend/         #   Koa + MongoDB (mongoose) + 物料/构建/预览/部署/AI代理 (:3001)
│   │   └── electron/        #   Electron 36 桌面壳
│   ├── xiangdi-server/      # XiangDi AI Agent 独立 HTTP 服务 (:3002)
│   └── knowledge-server/    # BanvasGL 知识微服务，向量检索 + 混合检索 (:3003)
├── examples/
│   └── lunlunglass/         # 示例：眼镜店管理系统
│       ├── shared/printer/  #   共享打印库 (@lunlunglass/printer)
│       ├── studio/          #   Template Studio（模板设计系统，frontend + backend + electron）
│       └── pos/             #   Store POS（门店运营系统，frontend + backend + electron）
└── docs/
    ├── adr/                 # 架构决策记录（按能力域分目录，见 docs/adr/README.md）
    └── specs/               # 实施方案（通过决策引用路由）
```

## 包间依赖方向

```
apps/banyan/frontend ──▶ @banyuan/banvasgl (workspace:*)

apps/banyan/backend ──▶ @banyuan/banvasgl/flow/server (workspace:*)

apps/xiangdi-server ──▶ @banyuan/xiangdi-agent (workspace:*)
                    ──▶ @banyuan/banvasgl (workspace:*)

apps/knowledge-server ──▶ @banyuan/banvasgl (workspace:*)  # 仅读取 version 做表名隔离

@banyuan/banvas-runtime ──peerDep──▶ @banyuan/banvasgl + react   # 用户 ECS 产物运行态

@banyuan/xiangdi-agent ──optional peerDep──▶ @banyuan/banvasgl

@banyuan/deploy-agent  ──▶ ws（仅依赖 WebSocket，运行在租户 ECS，不依赖引擎包）
```

依赖方向是单向的：应用层 → 能力层 → 引擎核心层。禁止循环依赖。

banvasgl 与 banvas-runtime 的分工：banvasgl 是「运行时」，只提供机制（原子事件 / 几何变换 / FlowSchema 执行）和编辑态 React Hook（`useCanvasInit` / `useCanvasCamera`）；banvas-runtime 是「运行策略层」，封装高级交互识别（ClickRecognizer / DragRecognizer）和运行态 `useRuntimeBanvas` hook，被打包进用户 ECS 产物，将策略注入 banvasgl 运行时（详见 docs/adr/engine/architecture.md A0 机制/策略分离原则）。

### 关键设计决策：Flow 融合进 BanvasGL

View 是带有流程控制语义的对象——每个 View 通过 `events`（onClick 等 13 个事件）和 `lifetimes`（onCreated/onAttach/onDestroy）字段绑定 FlowSchema。Scene 同样有生命周期（onLoad/onUnload/onShow/onHide）绑定 FlowSchema。渲染层和流程控制天然耦合，因此 BanvasGL 定位为「面向声明式 UI 的 2D 图形运行时（含流程控制）」而非纯渲染包。作为运行时，它只提供机制（原子事件 / 几何变换 / FlowSchema 执行），高层交互策略由上层注入（详见 docs/adr/engine/architecture.md A0）。

Flow 不再是独立 npm 包，而是 `@banyuan/banvasgl` 的内部子模块，通过子路径导出实现物理隔离：后端 `import '@banyuan/banvasgl/flow/server'` 只加载流程执行器，不会引入图形引擎代码（tsup splitting + package.json exports）。App 运行态通过 `createClientFlowRunner()` 创建 FlowRunner 实例，Scene.triggerSchema 直接构造 FlowContext 并调用 FlowRunner.run。

## 运行时服务架构

```
前端(:5174) ←── Vite proxy /api ──▶ banyan 后端(:3001)
                                          │
                                          │ HTTP SSE 代理
                                          ▼
                                   XiangDi 服务(:3002) ──▶ 知识服务(:3003)
                                   apps/xiangdi-server      apps/knowledge-server
```

- **banyan 后端(:3001)**：`apps/banyan/backend`，负责 MongoDB 持久化、应用 CRUD、物料系统、构建/预览/部署任务、AI 请求 SSE 代理（通过 `AgentGateway` 中继 XiangDi 服务）。租户开通（`TenantProvisionService` + `EcsManager` + `DnsManager`）将应用产物部署到独立 ECS
- **XiangDi 服务(:3002)**：`apps/xiangdi-server`，AI Agent 服务（OrchestratorGraph + AppRuntimeState 内存态），暴露 `POST /ai/run`（SSE）/ `GET /ai/models` / `POST /ai/models/switch`，Pull-based 从 banyan 后端拉取 pages/collections/cloudFunctions/materials，运行时状态存内存（按 appId 隔离），不访问 MongoDB
- **知识服务(:3003)**：`apps/knowledge-server`，独立知识微服务，存储和检索 BanvasGL 能力体系认知（ADR-040）。LanceDB 向量存储 + BM25 混合检索 + Cross-Encoder 精排，按 BanvasGL 版本隔离知识表
- **AI 请求流程**：前端 → banyan 后端（SSE 代理）→ XiangDi 服务（Pull pages from banyan → OrchestratorGraph 执行 → done 事件携带 artifacts）→ banyan 后端（写 pages to MongoDB）→ 前端
- **XiangDi 服务地址**：通过环境变量 `XIANGDI_URL` 配置，默认 `http://localhost:3002`
- **知识服务地址**：通过环境变量 `KNOWLEDGE_URL` 配置，默认 `http://localhost:3003`

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript (strict) | ~5.7 |
| 包管理 | pnpm workspace | 10.10 |
| 引擎构建 | tsup | ^8.4 |
| 前端框架 | React | ^19.0 |
| 前端构建 | Vite | ^6.3 |
| UI 组件 | Ant Design | ^6.0 |
| 后端 | Koa | ^2.15 |
| 数据库 | MongoDB (mongoose) | ^8.7 |
| 桌面 | Electron | ^36.1 |
| 前端状态 | zustand | ^5.0 |
| Agent 编排 | @langchain/langgraph | ^0.2 |
| Agent 结构化输出验证 | Zod（仅 xiangdi-agent） | ^3.23 |
| 运行时 target | ES2020 |  |
| 模块系统 | ESNext (ESM + CJS 双出) |  |

> 注：Zod 仅用于 `@banyuan/xiangdi-agent` 的 SubAgent 结构化输出校验，`@banyuan/banvasgl` 不依赖 Zod。

## 编码规范

### 通用

- 使用 TypeScript strict 模式，禁止 `any`（除非 `as unknown as T` 的中间跳板）
- 模块导入使用 `.js` 后缀（ESM 规范，即使源文件是 `.ts`）
- 每个包通过 `index.ts` 或分层 barrel 文件统一导出公共 API
- ID 生成：BanvasGL 使用 `uuid`，其他场景优先 `crypto.randomUUID()`
- 版本注入：通过 tsup define + `__BANVASGL_VERSION__` / `__XIANGDI_VERSION__` 宏

### BanvasGL（@banyuan/banvasgl）

- 八层架构：`engine`（App/Scene/Renderer/Camera/TransactionManager/material/serialization 等）/ `view`（View 基类及子类）/ `graph`（图形基元）/ `flow`（FlowRunner/FlowSchema/执行器，子路径导出）/ `foundation`（数学/样式/动画基础）/ `types`（纯接口契约）/ `actions`（封装的高阶操作函数：appActions/pageActions/viewActions）/ `hook`（React 集成层，peerDep React）
- 单一入口：`index.ts` 统一导出所有公共 API
- 渲染走 Canvas 2D 双缓冲，所有坐标系以左上角为原点
- 图形基元继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`
- 视图类继承自 `View`，容器视图继承自 `ContainerView`，`CombinedViews/` 下的 `CombinedView` 是唯一的布局容器视图
- **没有独立的 FlexView/ListView/GridView 视图类**：所有布局能力通过 `CombinedView` 的 `layoutMode` 字段切换（free/flex/list/grid/scroll），各 layoutMode 对应 `CombinedViews/layout/` 下的布局策略（`FlexLayoutStrategy`/`ListLayoutStrategy`/`GridLayoutStrategy`，统一实现 `ILayoutStrategy`，见 ADR-031）
- 流程图视图（NodeView/EdgeView/PortView）定义在 `view/FlowViews/` 目录：NodeView 继承 ContainerView，EdgeView 和 PortView 继承 View；媒体视图（ImageView/VideoView）在 `view/MediaViews/`，文本视图在 `view/TextView/`
- View 是带有流程控制语义的对象：`events`（13 个事件处理器）+ `lifetimes`（onCreated/onAttach/onDestroy 三个生命周期钩子），类型均为 `FlowSchema | null`
- 物料系统：`engine/material/`（MaterialInstantiator/MaterialSerializer）支持将视图子树序列化为可复用物料并实例化
- addon 通过 mixin 模式附加能力（`BoundingBoxAddon`、`BoxDecorationAddon`、`VertexAddon`、`AnimationAddon`、`TextSelectionAddon`）
- 场景操作走 `TransactionManager`，支持事务化撤销/重做；吸附辅助在 `scene/snap/`，图层管理在 `scene/layer/`
- App 持有 `FlowRunner` 实例（`createClientFlowRunner()`），Scene.triggerSchema 直接构造 `FlowContext` 并调用 FlowRunner.run，无需外部注入
- React 集成层在 `src/hook/`，导出编辑态 hook `useCanvasInit`（画布初始化）和 `useCanvasCamera`（相机控制），通过 `./react` 子路径导出（peerDep React）

### BanvasGL Flow 子模块（@banyuan/banvasgl/flow）

- 声明式 FlowSchema 执行器，节点图（nodes + edges）驱动
- 作为 banvasgl 内部子模块存在于 `src/flow/`，通过 package.json exports 子路径导出
- 前后端执行器分离：`@banyuan/banvasgl/flow/client`（animate/navigate/setData/setVisible）和 `@banyuan/banvasgl/flow/server`（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/script/transform）
- 共享执行器：`condition/delay/setVariable/callFlow/subFlow/return/forEach/parallel`
- 后端使用 `createServerFlowRunner()`，通过 `ServerFlowContext` 注入 db 和 httpClient 能力
- 子路径导出：`./flow/client`（前端预设工厂）、`./flow/server`（后端预设工厂）；Flow 类型从主入口 `.` 导出
- 包级 exports 仅有四个子路径：`.`（主入口）、`./react`（React Hook）、`./flow/client`、`./flow/server`；**不存在 `./flow` 公开子路径**——内部组件（FlowRunner、NodeExecutorRegistry、各执行器）不对外暴露，只暴露预组装工厂
- tsup splitting 保证 `flow/server` 入口不加载图形引擎代码，后端可安全使用

### XiangDi（@banyuan/xiangdi-agent）

- 编排框架：基于 `@langchain/langgraph` 的 `StateGraph`（`orchestration/orchestratorGraph.ts`），Orchestrator + 5 领域 SubAgent；不是单体 AgentLoop，不是经典 ReAct
- 双模式入口：`mode='chat'` 走 `respond` 节点纯对话直达 END；`mode='task'` 走完整构建管线
- task 模式拓扑：`START →[mode router] intent →[startFrom router] requirements → ui_design → contract → parallel_build(frontend‖backend, Send API) → audit →[router] commit / rollback`；`rollback →[router]` 回退到任意规划/构建节点（requirements/ui_design/contract/parallel_build），`commit → summarize → END`
- 5 个 SubAgent：`requirements`（需求结构化）、`uiDesign`（UI 设计规格）、`contract`（前后端契约）、`frontend`（前端 AIProjection 生成）、`backend`（后端数据/云函数生成）。frontend 与 backend 通过 LangGraph `Send` API 并行执行（`parallel_build` 为 pass-through 汇聚点）
- SubAgent 执行器：Worker SubGraph（`orchestration/nodes/workerGraph.ts`），think↔tools 多轮 Agentic Loop，默认 maxIterations=15；SubAgent 结构化输出通过 Zod Schema（`orchestration/schemas.ts`）验证
- Dialogue Phase 状态机（`orchestration/phases.ts`）：主路径 `start → requirements → ui_design → contract → building → awaiting_confirm → committing → done`；`awaiting_confirm` 可回退到 requirements/ui_design/contract/building（用户不满意时 rollback），由 `PHASE_TRANSITIONS` map 严格控制合法转移
- SSE 事件协议（`orchestration/events.ts`）：xiangdi-server 通过 `OrchestratorSSECallback` 推送 phase_change / agent_progress / tool_activity / audit_progress / text_delta / done 六类事件
- 信息三层架构：AppRuntimeState（xiangdi-server 内存态，含 pages/collections/cloudFunctions）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）
- 知识本质定义（ADR-040）：XiangDi 的知识 = 生成完整应用所需的全部认知，覆盖三个领域（UI + Flow + Data），每个领域包含语义维度（是什么、适合什么场景）和格式维度（怎么写出合法 JSON）。三层递进（原子能力→组合模式→惯例约定）：Primitive 种子（原子能力认知，ui/flow/data 三领域）、Composition 种子（组合模式，含跨领域的 bindflow 绑定模式和 fullstack 全栈拆解）、Convention 种子（惯例约定：视觉/流程/数据）。正确性标准：UI `fromAIProjection()` / Flow FlowSchema 验证 / Data Zod 校验
- 知识归属（ADR-040）：系统级知识存 knowledge-server（公共，所有应用共享）；应用级知识 = 应用数据本身（appJSON + CollectionSchema + CloudFunctions，通过程序化工具提取摘要，无需额外存储层）。所有知识消费走 Tool 模式，system prompt 不注入应用特定信息，保持 Prompt Cache 命中率
- Tool Handler 签名：`(input: TInput) => Promise<TOutput>`，通过 `ToolRegistry` 注册（含指数退避瞬时重试）
- LLM 客户端接口：`LLMClient`（`core/llmTypes.ts`），DeepSeek（主）+ Kimi（备），通过 `LLMRouter`（`llm/LLMRouter.ts`）做健康检测 + 信号系统
- Schema 转换：`toAIProjection` / `fromAIProjection`（全量）+ `patchProjection`（增量 patch，ADR-041）
- 工件仓库（`orchestration/artifacts.ts`）：`ArtifactStore` 接口，SubAgent 产出 → 原子写入 → audit 节点消费 → commit 节点合并写入应用状态

### Banyan 前端

- React 19 + react-router-dom，布局组件放 `layouts/`，页面组件放 `pages/`，跨页面复用组件放 `components/`
- 页面（`pages/`）：`ApplicationListPage`（应用列表）、`HomePage`（落地页）、`UIPage`（UI 设计态，内含 `DesignEditor` + 属性面板）、`FunctionsPage`（云函数/流程图编辑，内含 `FlowEditor`）、`DatabasePage`/`DataBrowserPage`（数据建模与浏览）、`PreviewPage`（预览）、`SettingsPage`
- 设计态/流程态交互通过 hooks 组织（`hooks/`）：`useDesignBanvas`（UI 设计态画布）、`useFlowBanvas`（流程图画布）、`useXiangDi`（AI 对话流式接入）、`useInteraction`、`useDesignContextMenu`/`useFlowContextMenu`
- `canvas/interaction/`：画布交互状态机（`InteractionStateMachine`），底层激活/拖拽事件处理
- 流程图相关 UI 组件在 `components/FlowKit/`；视图类（NodeView/EdgeView/PortView）已内置于 `@banyuan/banvasgl` 核心层，前端直接 import 使用
- 状态管理用 zustand（`stores/applicationStore.ts` + `stores/authStore.ts`）
- 样式用 SCSS Modules（`*.module.scss`），设计 token 在 `styles/tokens/`，Ant Design 主题在 `theme/antdTheme.ts`
- API 客户端封装在 `frontend/src/api/`（按 ai/application/backend/delivery/runtime 分域），统一基于原生 `fetch`（封装在 `api/client.ts`），AI 流式走 SSE（`api/ai/stream.ts`）

### Banyan 后端

- Koa + MVC 结构：`models/`（mongoose 模型）→ `services/`（业务逻辑）→ `controllers/`（请求处理）→ `routes/`（路由注册）
- 动态 Schema：`SchemaService` 管理 CollectionSchema 并按规则生成集合，集合名规则 `app_{appId}_{collectionName}`（无独立的 OrmService，集合读写由对应 controller/service 直接操作 mongoose）
- 物料系统：`MaterialService` + `MaterialController` + `models/Material.ts`，内置物料种子在 `seeds/builtinMaterials.ts`，供前端与 XiangDi（经 RemoteMaterialStore）复用
- 云函数：banyan 后端仅负责 FlowSchema 定义的存储（`cloudFunctions` 路由）；**FlowSchema 的执行宿主位于用户 ECS 产物**（由 `packages/deploy-agent` scaffold 生成的 flowRunner 模块调用 `createServerFlowRunner()` from `@banyuan/banvasgl/flow/server` 执行），banyan 本身不执行 FlowSchema
- AI 代理：`AiService` + `AgentGateway` 做 SSE 代理，Pull-based 架构（XiangDi 按需拉取 appJSON，banyan 后端不主动推送）；对话状态由 `PhaseController`/`DialogueService`/`MemoryService`/`ContextBuilder` 协同管理
- 预览：`services/preview/` 编排预览服务；构建/部署：`routes/build.ts` + `routes/deploy.ts`，租户 ECS 开通由 `TenantProvisionService` + `EcsManager` + `DnsManager` + `OssService` 协同完成

## 关键入口文件

| 用途 | 文件路径 |
|------|----------|
| BanvasGL 核心引擎入口 | `packages/banvasgl/src/index.ts` |
| BanvasGL View 基类 | `packages/banvasgl/src/view/View/View.ts` |
| BanvasGL FlowViews（NodeView/EdgeView/PortView） | `packages/banvasgl/src/view/FlowViews/` |
| BanvasGL FlowRunner（App 属性） | `packages/banvasgl/src/engine/App.ts` |
| BanvasGL 类型契约（含 Flow 类型重导出） | `packages/banvasgl/src/types/view/view.ts` |
| BanvasGL Actions（高阶操作函数） | `packages/banvasgl/src/actions/index.ts` |
| BanvasGL 布局策略（ILayoutStrategy） | `packages/banvasgl/src/view/CombinedViews/layout/` |
| BanvasGL 物料序列化/实例化 | `packages/banvasgl/src/engine/material/` |
| BanvasGL Hook 层（useCanvasInit/useCanvasCamera） | `packages/banvasgl/src/hook/index.ts` |
| banvas-runtime 运行策略层入口 | `packages/banvas-runtime/src/index.ts` |
| banvas-runtime 运行态 Hook | `packages/banvas-runtime/src/hook/useRuntimeBanvas.tsx` |
| banvas-runtime 交互识别器 | `packages/banvas-runtime/src/interaction/` |
| Flow 子模块入口 | `packages/banvasgl/src/flow/index.ts` |
| Flow 客户端预设 | `packages/banvasgl/src/flow/presets/client.ts` |
| Flow 服务端预设 | `packages/banvasgl/src/flow/presets/server.ts` |
| Flow 类型定义 | `packages/banvasgl/src/flow/types/schema.ts` |
| Flow 执行器注册表 | `packages/banvasgl/src/flow/executors/registry.ts` |
| XiangDi 公共 API | `packages/xiangdi-agent/src/index.ts` |
| XiangDi Orchestrator 主图 | `packages/xiangdi-agent/src/orchestration/orchestratorGraph.ts` |
| XiangDi SubAgent 协议 | `packages/xiangdi-agent/src/orchestration/protocol.ts` |
| XiangDi SubAgent 输出 Schema | `packages/xiangdi-agent/src/orchestration/schemas.ts` |
| XiangDi 节点工厂（各 SubAgent） | `packages/xiangdi-agent/src/orchestration/nodes/` |
| XiangDi Dialogue Phase 状态机 | `packages/xiangdi-agent/src/orchestration/phases.ts` |
| XiangDi SSE 事件协议 | `packages/xiangdi-agent/src/orchestration/events.ts` |
| XiangDi 工件仓库 | `packages/xiangdi-agent/src/orchestration/artifacts.ts` |
| XiangDi Worker SubGraph | `packages/xiangdi-agent/src/orchestration/nodes/workerGraph.ts` |
| XiangDi ToolRegistry（核心） | `packages/xiangdi-agent/src/core/ToolRegistry.ts` |
| XiangDi LLMRouter（智能路由） | `packages/xiangdi-agent/src/llm/LLMRouter.ts` |
| XiangDi AI Projection 转换器 | `packages/xiangdi-agent/src/schema/projection.ts` |
| XiangDi Patch Projection（增量写入） | `packages/xiangdi-agent/src/schema/patchProjection.ts` |
| XiangDi AI Projection 类型定义 | `packages/xiangdi-agent/src/schema/projection.types.ts` |
| XiangDi 工具依赖注入接口 | `packages/xiangdi-agent/src/tools-types.ts` |
| XiangDi 知识类型定义 | `packages/xiangdi-agent/src/knowledge/types.ts` |
| 知识种子脚本 | `apps/knowledge-server/scripts/seed-knowledge.ts` |
| 知识服务入口 | `apps/knowledge-server/src/app.ts` |
| 知识服务路由 | `apps/knowledge-server/src/routes/knowledge.ts` |
| KnowledgeService（混合检索） | `apps/knowledge-server/src/services/KnowledgeService.ts` |
| EmbeddingService（ONNX 推理） | `apps/knowledge-server/src/services/EmbeddingService.ts` |
| RerankerService（精排） | `apps/knowledge-server/src/services/RerankerService.ts` |
| Banyan 前端路由 | `apps/banyan/frontend/src/routes/index.tsx` |
| Banyan 前端应用级布局 | `apps/banyan/frontend/src/layouts/ApplicationLayout/index.tsx` |
| Banyan 前端设计态 hook | `apps/banyan/frontend/src/hooks/useDesignBanvas.tsx` |
| Banyan 前端流程态 hook | `apps/banyan/frontend/src/hooks/useFlowBanvas.tsx` |
| Banyan 前端 AI 接入 hook | `apps/banyan/frontend/src/hooks/useXiangDi.ts` |
| Banyan 前端状态库（zustand） | `apps/banyan/frontend/src/stores/applicationStore.ts` |
| Banyan 后端入口 | `apps/banyan/backend/src/app.ts` |
| Banyan 后端 AI 代理 | `apps/banyan/backend/src/services/AiService.ts` |
| Banyan 后端 Agent 网关（SSE 中继） | `apps/banyan/backend/src/services/AgentGateway.ts` |
| Banyan 后端物料服务 | `apps/banyan/backend/src/services/MaterialService.ts` |
| Banyan 后端动态 Schema 服务 | `apps/banyan/backend/src/services/SchemaService.ts` |
| ECS 产物 flow 执行器生成器 | `packages/deploy-agent/src/scaffold.ts`（generateFlowRunnerModule） |
| 部署代理 CLI 入口 | `packages/deploy-agent/src/cli.ts` |
| Banyan 后端构建路由 | `apps/banyan/backend/src/routes/build.ts` |
| Banyan 后端预览服务 | `apps/banyan/backend/src/services/preview/index.ts` |
| XiangDi HTTP 服务入口 | `apps/xiangdi-server/src/app.ts` |
| XiangDi HTTP 服务路由（POST /ai/run） | `apps/xiangdi-server/src/routes/ai.ts` |
| XiangDi Orchestrate Handlers | `apps/xiangdi-server/src/routes/orchestrateHandlers.ts` |
| XiangDi BanyanClient（Pull 数据） | `apps/xiangdi-server/src/banyan/BanyanClient.ts` |
| XiangDi RemoteMaterialStore | `apps/xiangdi-server/src/banyan/RemoteMaterialStore.ts` |
| XiangDi RemoteKnowledgeStore（降级） | `apps/xiangdi-server/src/knowledge/RemoteKnowledgeStore.ts` |
| XiangDi Checkpoint Store | `apps/xiangdi-server/src/checkpoint/` |

## 禁止事项

- **禁止**直接修改 BanvasGL Scene 内部状态，必须通过 `TransactionManager` 或 XiangDi 工具协议
- **禁止**新增独立的布局容器 ViewType（如 FlexView、ScrollView、ListView、GridView 等）；新布局能力必须以新的 `layoutMode` 值 + 对应 `IXxxLayout` 配置接口的形式挂载到 `CombinedView` 上（见 ADR-031）
- **禁止**在 XiangDi Graph 节点中硬编码特定 LLM provider，必须通过 `LLMClient` 接口
- **禁止**在 `apps/banyan/backend` 中直接 `import @banyuan/xiangdi-agent`，必须通过 HTTP 调用 XiangDi 服务（:3002）
- **禁止**在 `apps/xiangdi-server`（XiangDi 服务）中访问 MongoDB，持久化由 banyan 后端负责
- **禁止**在 `apps/knowledge-server` 中访问 MongoDB，知识服务只操作 LanceDB，与业务数据完全隔离
- **禁止**在 `apps/knowledge-server` 中直接 `import @banyuan/xiangdi-agent` 的业务逻辑；种子脚本通过 HTTP API 写入，不依赖 Agent 运行时
- **禁止**在生产环境中不设置 `KNOWLEDGE_INTERNAL_TOKEN`；知识服务写操作必须经过认证
- **禁止**跨包直接引用 `src/` 内部路径（必须通过包的公共导出）
- **禁止**在 `packages/` 目录下的库包中引入 React/DOM 等宿主环境依赖（除非在 hook/ 目录中且声明为 peerDep）
- **禁止**向 git 提交 API Key（`apiKey.json` 等文件已在 `.gitignore` 中）

## Agent 行为指引

- 修改 `@banyuan/banvasgl` 的接口类型时，注意检查 `@banyuan/xiangdi-agent` 中 AI Projection 转换器是否需要同步更新
- 修改 XiangDi 时，新增 SubAgent 工具需在对应的 `workerTools.ts` 中注册，并更新 `packages/xiangdi-agent/src/orchestration/index.ts` 和 `packages/xiangdi-agent/src/index.ts` 的导出
- 添加新依赖时，区分 `dependencies`（运行时需要）vs `devDependencies`（构建/测试时需要）vs `peerDependencies`（由宿主提供）
- 创建新文件时，记得在对应的 barrel 文件中添加导出
- 涉及 Schema 变更时，确保 AI Projection 转换器同步更新
- 构建验证：`pnpm build:all` 应零错误通过
- 前端新增页面时，布局组件放 `layouts/`，页面组件放 `pages/`，跨页面复用组件放 `components/`；画布交互逻辑沉淀到 `hooks/`，全局状态走 `stores/`（zustand）
- 流程图视图（NodeView/EdgeView/PortView）已内置于 `@banyuan/banvasgl` 核心层 `view/FlowViews/` 目录，前端直接 import 使用，无需动态注册
- 新增布局能力时不要新建 ViewType，而是在 `CombinedView` 上扩展 `layoutMode` 值并在 `view/CombinedViews/layout/` 实现对应 `ILayoutStrategy`（见 ADR-031）
- 运行态高级交互（点击/拖拽识别）属于 `@banyuan/banvas-runtime`，编辑态机制属于 `@banyuan/banvasgl`，新增交互能力时注意区分归属（机制 vs 策略）

## 相关文档

- [架构决策记录](./docs/adr/README.md) — 关键设计决策（按能力域分目录：engine/agent/app/schema/product）
- [实施方案](./docs/specs/README.md) — 具体落地方案，通过决策引用路由
- [BanvasGL README](./packages/banvasgl/README.md) — 面向声明式 UI 的 2D 图形运行时详细文档
- [banvas-runtime README](./packages/banvas-runtime/README.md) — BanvasGL 运行策略层（高级交互识别 + 运行态 Hook）
- [XiangDi README](./packages/xiangdi-agent/README.md) — AI Agent 引擎详细文档
- [deploy-agent README](./packages/deploy-agent/README.md) — 租户 ECS 部署代理
- [XiangDi Server README](./apps/xiangdi-server/README.md) — XiangDi AI Agent 独立 HTTP 服务
- [Banyan README](./apps/banyan/README.md) — 低代码可视化设计平台（frontend + backend + electron）
- [LunlunGlass README](./examples/lunlunglass/README.md) — 示例应用：眼镜店管理系统
