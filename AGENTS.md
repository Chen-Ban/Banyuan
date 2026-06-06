# AGENTS.md — Banyuan AI Coding 导航手册

> 本文件为 AI Coding Agent（Cursor、Copilot、CatDesk 等）提供仓库导航。
> 当 Agent 需要在本仓库中进行代码生成、修改、重构时，应首先阅读此文件。

## 项目概览

Banyuan（班园）是一个 pnpm monorepo，包含自研 2D 画布引擎、AI Agent 引擎、低代码平台。

核心理念：「虽由人作，宛自天开」—— 用户通过拖拽或 AI 自然语言生成多页面可视化应用，一键构建为跨平台桌面安装包。

## Monorepo 结构

```
Banyuan/
├── packages/
│   ├── banvasgl/            # 核心 2D 图形引擎 + 流程控制宿主 (npm: @banyuan/banvasgl)
│   ├── flow/                # 流程控制引擎，声明式 FlowSchema 执行器 (npm: @banyuan/flow)
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
    ├── business.md          # 业务上下文
    ├── pitfalls.md          # 踩坑记录
    └── adr/                 # 架构决策记录（共 26 条，ADR-001 ~ ADR-026）
```

## 包间依赖方向

```
@banyuan/banvasgl ──dep──▶ @banyuan/flow (workspace:*)
    │
    │  View.events / View.lifetimes / Scene.lifetimes 的类型都是 FlowSchema | null
    │  View 是带有流程控制语义的对象，banvasgl 依赖 flow 是合理的设计决策
    │

apps/banyan/frontend ──▶ @banyuan/banvasgl (workspace:*)
                     ──▶ @banyuan/flow (workspace:*)

apps/banyan/backend ──▶ @banyuan/flow (workspace:*)

apps/xiangdi-server ──▶ @banyuan/xiangdi-agent (workspace:*)
                    ──▶ @banyuan/banvasgl (workspace:*)

apps/knowledge-server ──▶ @banyuan/banvasgl (workspace:*)  # 仅读取 version 做表名隔离

@banyuan/xiangdi-agent ──optional peerDep──▶ @banyuan/banvasgl
```

依赖方向是单向的：应用层 → 能力层 → 引擎核心层。禁止循环依赖。

### 关键设计决策：banvasgl 依赖 flow

View 是带有流程控制语义的对象——每个 View 通过 `events`（onClick 等 12 个事件）和 `lifetimes`（onCreated/onAttach/onDestroy）字段绑定 FlowSchema。Scene 同样有生命周期（onLoad/onUnload/onShow/onHide）绑定 FlowSchema。这使得渲染层和流程控制自然耦合。

flow 包独立的原因是：前端流程（animate/navigate/setData/setVisible）和云函数流程（dbQuery/dbInsert/httpRequest/script/transform）共享同一套 FlowSchema 执行器，后端直接 `import @banyuan/flow/server` 使用，无需依赖整个 banvasgl。

耦合方式是单向且轻量的：banvasgl 在类型层 `import type { FlowSchema } from '@banyuan/flow'`，运行时 App 持有 `FlowRunner` 实例（通过 `createClientFlowRunner()` 创建），Scene.triggerSchema 直接调用 FlowRunner.run 并构造 FlowContext。

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
- **XiangDi 服务(:3002)**：`apps/xiangdi-server`，无状态 AI Agent 服务（MasterGraph V2），pages 随请求传入/随 done 事件返回，不访问 MongoDB
- **知识服务(:3003)**：`apps/knowledge-server`，独立知识微服务，存储和检索 BanvasGL 能力体系认知（ADR-040）。LanceDB 向量存储 + BM25 混合检索 + Cross-Encoder 精排，按 BanvasGL 版本隔离知识表
- **AI 请求流程**：前端 → banyan 后端（读 pages from MongoDB）→ XiangDi 服务（MasterGraph V2 执行）→ banyan 后端（写 pages to MongoDB）→ 前端
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

- 七层架构：`engine`（App/Scene/Renderer/Camera/TransactionManager 等）/ `view`（View 基类及子类）/ `graph`（图形基元）/ `foundation`（数学/样式基础）/ `types`（纯接口契约）/ `actions`（封装的操作函数，含默认视图创建策略）/ `data`（内置物料、数据构建器、右键菜单）
- 单一入口：`index.ts` 统一导出所有公共 API
- 渲染走 Canvas 2D 双缓冲，所有坐标系以左上角为原点
- 图形基元继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`
- 视图类继承自 `View`，容器视图继承自 `ContainerView`（`CombinedView` 和 `FlexView` 的共同基类）
- 流程图视图（NodeView/EdgeView/PortView）定义在 `view/FlowViews/` 目录：NodeView 继承 ContainerView，EdgeView 和 PortView 继承 View
- View 是带有流程控制语义的对象：`events`（12 个事件处理器）+ `lifetimes`（3 个生命周期钩子），类型均为 `FlowSchema | null`
- addon 通过 mixin 模式附加能力（`BoundingBoxAddon`、`BoxDecorationAddon`、`VertexAddon`、`AnimationAddon`、`TextSelectionAddon`）
- 场景操作走 `TransactionManager`，支持事务化撤销/重做
- App 持有 `FlowRunner` 实例（`createClientFlowRunner()`），Scene.triggerSchema 直接构造 `FlowContext` 并调用 FlowRunner.run，无需外部注入

### @banyuan/flow

- 声明式 FlowSchema 执行器，节点图（nodes + edges）驱动
- 纯独立包，无任何 runtime dependencies
- 前后端执行器分离：`@banyuan/flow/client`（animate/navigate/setData/setVisible）和 `@banyuan/flow/server`（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/script/transform）
- 共享执行器：`condition/delay/setVariable/callFlow/subFlow`
- 后端使用 `createServerFlowRunner()`，通过 `ServerFlowContext` 注入 db 和 httpClient 能力
- 子路径导出：`.`（核心）、`./client`（前端预设）、`./server`（后端预设）、`./types`（纯类型）

### XiangDi（@banyuan/xiangdi-agent）

- 执行模式：LangGraph StateGraph（`graph/masterGraph.ts`），节点为 `START → spec → think → tools → extractPreferences → END`；不是手写 AgentLoop，也不是经典 ReAct
- 信息三层架构：ProjectSpec（全局约束，管线注入）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）
- 知识本质定义（ADR-040）：XiangDi 的知识 = BanvasGL 能力体系的完整认知，包含语义维度（是什么、能做什么、适合什么场景）和格式维度（怎么写出合法 JSON）。三层递进（能力→结构→表现）：Schema 种子（能力认知，语义+格式合一）、Composition 种子（组合模式，LLM 生成 + 程序化验证 + 人工 review）、Theme 种子（视觉表现，语义映射+层次规则+参数值，人工维护）。正确性标准：`fromAIProjection()` 反序列化成功
- 知识归属（ADR-040）：系统级知识存 knowledge-server（公共，所有应用共享）；应用级知识 = appJSON 本身（通过程序化工具提取风格摘要，无需额外存储层）。所有知识消费走 Tool 模式，system prompt 不注入应用特定信息，保持 Prompt Cache 命中率
- Spec 是架构一等公民：SpecPlanner 规划 → HarnessRunner 执行 → Guard/Checkpoint 验证
- Tool Handler 签名：`(input: TInput) => Promise<TOutput>`，通过 ToolRegistry 注册
- LLM 客户端接口：`LLMClient`，DeepSeek（主）+ Kimi（备），通过 `LLMRouter` 做健康检测
- 冲突检测：`ConflictDetector` + `DisambiguationHandler`，只有 `user_confirmed` 来源的决策才触发消歧
- 记忆层：`LocalEpisodicMemory`（中期经验）+ `LocalSemanticMemory`（长期事实）；`extractPreferences` 节点在 graph 末端提取用户偏好写入记忆
- Harness 层：`HarnessRunner` 按 ChangeSpec 分发任务 → `checkpoint.ts` 做阶段性验证

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
- 流程执行：`FlowRunnerService` 使用 `@banyuan/flow/server` 的 `createServerFlowRunner()`
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
| BanvasGL 数据层（物料/构建器/菜单） | `packages/banvasgl/src/data/` |
| Flow 引擎入口 | `packages/flow/src/index.ts` |
| Flow 客户端预设 | `packages/flow/src/presets/client.ts` |
| Flow 服务端预设 | `packages/flow/src/presets/server.ts` |
| Flow 类型定义 | `packages/flow/src/types/schema.ts` |
| XiangDi 公共 API | `packages/xiangdi-agent/src/index.ts` |
| XiangDi Graph 核心 | `packages/xiangdi-agent/src/graph/masterGraph.ts` |
| XiangDi Spec 体系 | `packages/xiangdi-agent/src/spec/types.ts` |
| XiangDi 工具协议 | `packages/xiangdi-agent/src/tools/BanvasToolProtocol.ts` |
| XiangDi AI Projection 转换器 | `packages/xiangdi-agent/src/schema/projection.ts` |
| XiangDi AI Projection 类型定义 | `packages/xiangdi-agent/src/schema/projection.types.ts` |
| XiangDi 知识种子 | `packages/xiangdi-agent/src/knowledge/seeds/` |
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
| Banyan 后端流程执行 | `apps/banyan/backend/src/services/FlowRunnerService.ts` |
| Banyan 后端构建服务 | `apps/banyan/backend/src/services/build/index.ts` |
| Banyan 后端预览服务 | `apps/banyan/backend/src/services/preview/index.ts` |
| XiangDi HTTP 服务入口 | `apps/xiangdi-server/src/app.ts` |
| XiangDi HTTP 服务路由 | `apps/xiangdi-server/src/routes/ai.ts` |

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
- 修改 XiangDi 时，新增工具需同时更新 `tools/index.ts` 和 `packages/xiangdi-agent/src/index.ts` 的导出
- 添加新依赖时，区分 `dependencies`（运行时需要）vs `devDependencies`（构建/测试时需要）vs `peerDependencies`（由宿主提供）
- 创建新文件时，记得在对应的 barrel 文件中添加导出
- 涉及 Schema 变更时，确保 AI Projection 转换器同步更新
- 构建验证：`pnpm build:all` 应零错误通过
- 前端新增页面时，布局组件放 `layouts/`，页面组件放 `pages/`，跨页面复用组件放 `components/`
- 流程图视图（NodeView/EdgeView/PortView）已内置于 `@banyuan/banvasgl` 核心层 `view/FlowViews/` 目录，前端直接 import 使用，无需动态注册

## 相关文档

- [业务上下文](./docs/business.md) — 产品逻辑、用户故事、功能边界
- [踩坑记录](./docs/pitfalls.md) — 已知陷阱与规避方式
- [架构决策记录](./docs/adr/) — 关键设计决策的背景与权衡
- [BanvasGL README](./packages/banvasgl/README.md) — 核心 2D 图形引擎详细文档
- [XiangDi README](./packages/xiangdi-agent/README.md) — AI Agent 引擎详细文档
- [XiangDi Server README](./apps/xiangdi-server/README.md) — XiangDi AI Agent 独立 HTTP 服务
- [Banyan README](./apps/banyan/README.md) — 低代码可视化设计平台（frontend + backend + electron）
- [LunlunGlass README](./examples/lunlunglass/README.md) — 示例应用：眼镜店管理系统
