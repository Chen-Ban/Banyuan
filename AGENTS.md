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
│   └── xiangdi-agent/       # AI Agent 引擎 (npm: @banyuan/xiangdi-agent)
├── apps/
│   ├── banyan/              # 低代码平台应用
│   │   ├── frontend/        #   React 19 + Vite + Ant Design 6 (:5174)
│   │   ├── backend/         #   Koa + MongoDB (mongoose) + 构建/预览/AI代理 (:3001)
│   │   └── electron/        #   Electron 36 桌面壳
│   ├── xiangdi-server/      # XiangDi AI Agent 独立 HTTP 服务 (:3002)
│   └── knowledge-server/    # BanvasGL 知识微服务，向量检索 + 混合检索 (:3003)
├── examples/
│   └── lunlunglass/         # 示例：眼镜店管理系统
│       ├── shared/printer/  #   共享打印库 (@lunlunglass/printer)
│       ├── studio/          #   Template Studio（模板设计系统）
│       └── pos/             #   Store POS（门店运营系统）
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

@banyuan/xiangdi-agent ──optional peerDep──▶ @banyuan/banvasgl
```

依赖方向是单向的：应用层 → 能力层 → 引擎核心层。禁止循环依赖。

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

- **banyan 后端(:3001)**：`apps/banyan/backend`，负责 MongoDB 持久化、应用 CRUD、构建/预览任务、AI 请求代理
- **XiangDi 服务(:3002)**：`apps/xiangdi-server`，AI Agent 服务（OrchestratorGraph + AppRuntimeState 内存态），Pull-based 从 banyan 后端拉取 pages/collections/cloudFunctions，运行时状态存内存（按 appId 隔离），不访问 MongoDB
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
| Schema 验证 | Zod | ^3.23 |
| 运行时 target | ES2020 |  |
| 模块系统 | ESNext (ESM + CJS 双出) |  |

## 编码规范

### 通用

- 使用 TypeScript strict 模式，禁止 `any`（除非 `as unknown as T` 的中间跳板）
- 模块导入使用 `.js` 后缀（ESM 规范，即使源文件是 `.ts`）
- 每个包通过 `index.ts` 或分层 barrel 文件统一导出公共 API
- ID 生成：BanvasGL 使用 `uuid`，其他场景优先 `crypto.randomUUID()`
- 版本注入：通过 tsup define + `__BANVASGL_VERSION__` / `__XIANGDI_VERSION__` 宏

### BanvasGL（@banyuan/banvasgl）

- 八层架构：`engine`（App/Scene/Renderer/Camera/TransactionManager 等）/ `view`（View 基类及子类）/ `graph`（图形基元）/ `flow`（FlowRunner/FlowSchema/执行器，子路径导出）/ `foundation`（数学/样式基础）/ `types`（纯接口契约）/ `actions`（封装的操作函数，含默认视图创建策略）/ `hook`（React 集成层，peerDep React）
- 单一入口：`index.ts` 统一导出所有公共 API
- 渲染走 Canvas 2D 双缓冲，所有坐标系以左上角为原点
- 图形基元继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`
- 视图类继承自 `View`，容器视图继承自 `ContainerView`（`CombinedView` 和 `FlexView` 的共同基类）
- 流程图视图（NodeView/EdgeView/PortView）定义在 `view/FlowViews/` 目录：NodeView 继承 ContainerView，EdgeView 和 PortView 继承 View
- View 是带有流程控制语义的对象：`events`（13 个事件处理器）+ `lifetimes`（3 个生命周期钩子），类型均为 `FlowSchema | null`
- addon 通过 mixin 模式附加能力（`BoundingBoxAddon`、`BoxDecorationAddon`、`VertexAddon`、`AnimationAddon`、`TextSelectionAddon`）
- 场景操作走 `TransactionManager`，支持事务化撤销/重做
- App 持有 `FlowRunner` 实例（`createClientFlowRunner()`），Scene.triggerSchema 直接构造 `FlowContext` 并调用 FlowRunner.run，无需外部注入

### BanvasGL Flow 子模块（@banyuan/banvasgl/flow）

- 声明式 FlowSchema 执行器，节点图（nodes + edges）驱动
- 作为 banvasgl 内部子模块存在于 `src/flow/`，通过 package.json exports 子路径导出
- 前后端执行器分离：`@banyuan/banvasgl/flow/client`（animate/navigate/setData/setVisible）和 `@banyuan/banvasgl/flow/server`（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/script/transform）
- 共享执行器：`condition/delay/setVariable/callFlow/subFlow/return/forEach/parallel`
- 后端使用 `createServerFlowRunner()`，通过 `ServerFlowContext` 注入 db 和 httpClient 能力
- 子路径导出：`./flow/client`（前端预设工厂）、`./flow/server`（后端预设工厂）；Flow 类型从主入口 `.` 导出
- 不存在 `./flow` 公开子路径——内部组件（FlowRunner、NodeExecutorRegistry、各执行器）不对外暴露，只暴露预组装工厂
- tsup splitting 保证 `flow/server` 入口不加载图形引擎代码，后端可安全使用

### XiangDi（@banyuan/xiangdi-agent）

- 编排模式：Orchestrator + 5 领域 SubAgent（`orchestration/orchestratorGraph.ts`），拓扑为 `intent → requirements → ui_design → contract → parallel_build(frontend‖backend, Send API) → audit → commit/rollback → summarize`；不是单体 AgentLoop，不是经典 ReAct
- 5 个 SubAgent：`requirements`（需求结构化）、`uiDesign`（UI 设计规格）、`contract`（前后端契约）、`frontend`（前端 AIProjection 生成）、`backend`（后端数据/云函数生成）。前后两者通过 LangGraph `Send` API 并行执行
- SubAgent 执行器：Worker SubGraph（`orchestration/nodes/workerGraph.ts`），think↔tools 多轮 Agentic Loop，maxIterations=15；SubAgent 结构化输出通过 Zod Schema 验证
- Dialogue Phase 状态机（`orchestration/phases.ts`）：`idle → intent_parsing → building → auditing → awaiting_confirm → committed / rolling_back`，严格 `PHASE_TRANSITIONS` map 控制状态转移
- SSE 事件协议（`orchestration/events.ts`）：xiangdi-server 通过 `OrchestratorSSECallback` 推送 phase_change / agent_progress / tool_activity / audit_progress / text_delta / done 六类事件
- 信息三层架构：AppRuntimeState（xiangdi-server 内存态，含 pages/collections/cloudFunctions）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）
- 知识本质定义（ADR-040）：XiangDi 的知识 = 生成完整应用所需的全部认知，覆盖三个领域（UI + Flow + Data），每个领域包含语义维度（是什么、适合什么场景）和格式维度（怎么写出合法 JSON）。三层递进（原子能力→组合模式→惯例约定）：Primitive 种子（原子能力认知，ui/flow/data 三领域）、Composition 种子（组合模式，含跨领域的 bindflow 绑定模式和 fullstack 全栈拆解）、Convention 种子（惯例约定：视觉/流程/数据）。正确性标准：UI `fromAIProjection()` / Flow FlowSchema 验证 / Data Zod 校验
- 知识归属（ADR-040）：系统级知识存 knowledge-server（公共，所有应用共享）；应用级知识 = 应用数据本身（appJSON + CollectionSchema + CloudFunctions，通过程序化工具提取摘要，无需额外存储层）。所有知识消费走 Tool 模式，system prompt 不注入应用特定信息，保持 Prompt Cache 命中率
- Tool Handler 签名：`(input: TInput) => Promise<TOutput>`，通过 `ToolRegistry` 注册（含指数退避瞬时重试）
- LLM 客户端接口：`LLMClient`（`core/llmTypes.ts`），DeepSeek（主）+ Kimi（备），通过 `LLMRouter`（`llm/LLMRouter.ts`）做健康检测 + 信号系统
- Schema 转换：`toAIProjection` / `fromAIProjection`（全量）+ `patchProjection`（增量 patch，ADR-041）
- 工件仓库（`orchestration/artifacts.ts`）：`ArtifactStore` 接口，SubAgent 产出 → 原子写入 → audit 节点消费 → commit 节点合并写入应用状态

### Banyan 前端

- React 19 + react-router-dom，布局组件放 `layouts/`，页面组件放 `pages/`，复用组件放 `components/`
- 核心模块划分：`editor/`（UI 可视化设计编辑器）、`flow/`（流程图编辑器）、`canvas/`（画布底层交互）
- `editor/` 模块：`useDesignBanvas` hook + 属性面板 + 物料面板，负责 UI 设计态交互
- `flow/` 模块：流程图编辑 hooks + React 组件（上下文菜单/物料面板/属性弹窗）；视图类（NodeView/EdgeView/PortView）已迁移到 `@banyuan/banvasgl` 核心层
- `canvas/` 模块：画布初始化、缩放、事件系统等底层交互
- 样式用 SCSS Modules（`*.module.scss`）
- API 客户端封装在 `frontend/src/api/`，使用 axios

### Banyan 后端

- Koa + MVC 结构：`models/` → `services/` → `controllers/` → `routes/`
- 动态 ORM：`SchemaService` + `OrmService`，集合名规则 `app_{appId}_{collectionName}`
- 云函数：banyan 后端仅负责 FlowSchema 定义的存储（`cloudFunctions` 路由）；**FlowSchema 的执行宿主位于用户 ECS 产物**（由 `packages/deploy-agent` scaffold 生成的 flowRunner 模块调用 `createServerFlowRunner()` from `@banyuan/banvasgl/flow/server` 执行），banyan 本身不执行 FlowSchema
- AI 代理：`AiService` SSE 代理，Pull-based 架构（XiangDi 按需拉取 appJSON，banyan 后端不主动推送）

## 关键入口文件

| 用途 | 文件路径 |
|------|----------|
| BanvasGL 核心引擎入口 | `packages/banvasgl/src/index.ts` |
| BanvasGL View 基类 | `packages/banvasgl/src/view/View/View.ts` |
| BanvasGL FlowViews（NodeView/EdgeView/PortView） | `packages/banvasgl/src/view/FlowViews/` |
| BanvasGL FlowRunner（App 属性） | `packages/banvasgl/src/engine/App.ts` |
| BanvasGL 类型契约（含 Flow 类型重导出） | `packages/banvasgl/src/types/view/view.ts` |
| BanvasGL Actions（createBanvasActions） | `packages/banvasgl/src/actions/index.ts` |
| BanvasGL 视图创建策略（默认策略） | `packages/banvasgl/src/actions/viewCreateStrategies.ts` |
| BanvasGL Hook 层（React 集成） | `packages/banvasgl/src/hook/` |
| Flow 子模块入口 | `packages/banvasgl/src/flow/index.ts` |
| Flow 客户端预设 | `packages/banvasgl/src/flow/presets/client.ts` |
| Flow 服务端预设 | `packages/banvasgl/src/flow/presets/server.ts` |
| Flow 类型定义 | `packages/banvasgl/src/flow/types/schema.ts` |
| Flow 执行器注册表 | `packages/banvasgl/src/flow/executors/registry.ts` |
| XiangDi 公共 API | `packages/xiangdi-agent/src/index.ts` |
| XiangDi Orchestrator 主图 | `packages/xiangdi-agent/src/orchestration/orchestratorGraph.ts` |
| XiangDi SubAgent 协议 | `packages/xiangdi-agent/src/orchestration/protocol.ts` |
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
| Banyan 前端流程图编辑器 | `apps/banyan/frontend/src/flow/index.ts` |
| Banyan 后端入口 | `apps/banyan/backend/src/app.ts` |
| Banyan 后端 AI 代理 | `apps/banyan/backend/src/services/AiService.ts` |
| ECS 产物 flow 执行器生成器 | `packages/deploy-agent/src/scaffold.ts`（generateFlowRunnerModule） |
| Banyan 后端构建服务 | `apps/banyan/backend/src/services/build/index.ts` |
| Banyan 后端预览服务 | `apps/banyan/backend/src/services/preview/index.ts` |
| XiangDi HTTP 服务入口 | `apps/xiangdi-server/src/app.ts` |
| XiangDi HTTP 服务路由 | `apps/xiangdi-server/src/routes/ai.ts` |
| XiangDi Orchestrate Handlers | `apps/xiangdi-server/src/routes/orchestrateHandlers.ts` |
| XiangDi BanyanClient（Pull 数据） | `apps/xiangdi-server/src/banyan/BanyanClient.ts` |
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
- 前端新增页面时，布局组件放 `layouts/`，页面组件放 `pages/`，跨页面复用组件放 `components/`
- 流程图视图（NodeView/EdgeView/PortView）已内置于 `@banyuan/banvasgl` 核心层 `view/FlowViews/` 目录，前端直接 import 使用，无需动态注册

## 相关文档

- [架构决策记录](./docs/adr/README.md) — 关键设计决策（按能力域分目录：engine/agent/app/schema/product）
- [实施方案](./docs/specs/README.md) — 具体落地方案，通过决策引用路由
- [BanvasGL README](./packages/banvasgl/README.md) — 面向声明式 UI 的 2D 图形运行时详细文档
- [XiangDi README](./packages/xiangdi-agent/README.md) — AI Agent 引擎详细文档
- [XiangDi Server README](./apps/xiangdi-server/README.md) — XiangDi AI Agent 独立 HTTP 服务
- [Banyan README](./apps/banyan/README.md) — 低代码可视化设计平台（frontend + backend + electron）
- [LunlunGlass README](./examples/lunlunglass/README.md) — 示例应用：眼镜店管理系统
