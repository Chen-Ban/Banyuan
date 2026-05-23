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
│   ├── banvasgl/            # 核心 2D 图形引擎 (npm: @banyuan/banvasgl)
│   ├── banvas-design/       # 设计态 React 绑定 (npm: @banyuan/banvas-design)
│   ├── banvas-runtime/      # 运行态统一接口层，平台无关契约 (npm: @banyuan/banvas-runtime)
│   ├── banvas-runtime-web/  # 运行态 Web 平台适配 (npm: @banyuan/banvas-runtime-web)
│   ├── flow/                # 流程控制引擎，声明式 FlowSchema 执行器 (npm: @banyuan/flow)
│   ├── flow-design/         # 流程图编辑器 (npm: @banyuan/flow-design)
│   ├── xiangdi-agent/       # AI Agent 引擎 (npm: @banyuan/xiangdi-agent)
│   └── banyan-sdk/          # 伞包 SDK，聚合所有子包 (npm: @banyuan/banyan-sdk)
├── apps/
│   ├── banyan/              # 低代码平台应用
│   │   ├── frontend/        #   React 19 + Vite + Ant Design 6 (:5174)
│   │   ├── backend/         #   Koa + MongoDB (mongoose) + 构建/预览/AI代理 (:3001)
│   │   └── electron/        #   Electron 36 桌面壳
│   └── xiangdi-server/      # XiangDi AI Agent 独立 HTTP 服务 (:3002)
├── examples/
│   └── lunlunglass/         # 示例：眼镜店管理系统
│       ├── shared/printer/  #   共享打印库 (@lunlunglass/printer)
│       ├── studio/          #   Template Studio（模板设计系统）
│       └── pos/             #   Store POS（门店运营系统）
└── docs/
    ├── business.md          # 业务上下文
    ├── pitfalls.md          # 踩坑记录
    └── adr/                 # 架构决策记录（共 20 条，ADR-001 ~ ADR-020）
```

## 包间依赖方向

```
apps/banyan/frontend ──▶ @banyuan/banyan-sdk (workspace:*)
                              ├──▶ @banyuan/banvasgl
                              ├──▶ @banyuan/banvas-runtime
                              ├──▶ @banyuan/banvas-runtime-web
                              ├──▶ @banyuan/banvas-design
                              ├──▶ @banyuan/flow
                              └──▶ @banyuan/flow-design

apps/banyan/backend ──▶ @banyuan/flow (workspace:*)
apps/xiangdi-server ──▶ @banyuan/xiangdi-agent (workspace:*)
                    ──▶ @banyuan/banvasgl (workspace:*)

@banyuan/xiangdi-agent ──optional peerDep──▶ @banyuan/banvasgl
@banyuan/banvas-design ──peerDep──▶ @banyuan/banvasgl, @banyuan/banvas-runtime-web
@banyuan/banvas-runtime-web ──peerDep──▶ @banyuan/banvasgl, @banyuan/banvas-runtime
@banyuan/flow-design ──peerDep──▶ @banyuan/banvasgl, @banyuan/banvas-runtime-web, @banyuan/flow
```

依赖方向是单向的：应用层 → SDK 伞包 → 能力层 → 引擎核心层。禁止循环依赖。

## 运行时服务架构

```
前端(:5174) ←── Vite proxy /api ──▶ banyan 后端(:3001)
                                          │
                                          │ HTTP SSE 代理
                                          ▼
                                   XiangDi 服务(:3002)
                                   apps/xiangdi-server
```

- **banyan 后端(:3001)**：`apps/banyan/backend`，负责 MongoDB 持久化、应用 CRUD、构建/预览任务、AI 请求代理
- **XiangDi 服务(:3002)**：`apps/xiangdi-server`，无状态 AI Agent 服务，pages 随请求传入/随 done 事件返回，不访问 MongoDB
- **AI 请求流程**：前端 → banyan 后端（读 pages from MongoDB）→ XiangDi 服务（执行 Agent）→ banyan 后端（写 pages to MongoDB）→ 前端
- **XiangDi 服务地址**：通过环境变量 `XIANGDI_URL` 配置，默认 `http://localhost:3002`

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

- 五层架构：`engine`（App/Scene/Renderer/Camera/TransactionManager 等）/ `view`（View 基类及子类）/ `graph`（图形基元）/ `foundation`（数学/样式基础）/ `types`（纯接口契约）
- 单一入口：`index.ts` 统一导出所有公共 API；编辑态能力已迁移至 `@banyuan/banvas-design`，运行态能力已迁移至 `@banyuan/banvas-runtime` + `@banyuan/banvas-runtime-web`
- 重计算走 Web Worker（图形求交、快照 diff、文本排版、轨迹计算），Worker 代码在 `@banyuan/banvas-design` 中
- 渲染走 Canvas 2D 双缓冲，所有坐标系以左上角为原点
- 图形基元继承自 `Graph` 基类，组合图形继承自 `CombinedGraph`
- 视图类继承自 `View`，容器视图继承自 `ContainerView`（`CombinedView` 和 `FlexView` 的共同基类）
- addon 通过 mixin 模式附加能力（`BoundingBoxAddon`、`BoxDecorationAddon`、`VertexAddon`）
- 场景操作走 `TransactionManager`，支持事务化撤销/重做
- `SchemaRunner` 通过依赖注入解耦核心层与 FlowRunner，避免循环依赖
- `ViewRegistry` 工厂注册表支持外部包动态注册视图类型

### @banyuan/flow

- 声明式 FlowSchema 执行器，节点图（nodes + edges）驱动
- 前后端执行器分离：`@banyuan/flow/client`（animate/navigate/setData/setVisible）和 `@banyuan/flow/server`（dbQuery/dbInsert/httpRequest/script/transform）
- 后端使用 `createServerFlowRunner()`，通过 `ServerFlowContext` 注入 db 和 httpClient 能力

### XiangDi（@banyuan/xiangdi-agent）

- 执行模式：Anthropic Agentic Loop（tool_use 机制），不是经典 ReAct
- 信息三层架构：ProjectSpec（全局约束，管线注入）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）
- Spec 是架构一等公民：SpecPlanner 规划 → HarnessRunner 执行 → Guard/Checkpoint 验证
- Tool Handler 签名：`(input: TInput) => Promise<TOutput>`，通过 ToolRegistry 注册
- LLM 客户端接口：`LLMClient`，DeepSeek（主）+ Kimi（备），通过 `LLMRouter` 做健康检测
- 生命周期状态机：`AgentLifecycle` 双层（AgentPhase 7 态 + AgentStep 9 态）
- 冲突检测：`ConflictDetector` + `DecisionLog` + `DisambiguationHandler`，只有 `user_confirmed` 来源的决策才触发消歧
- 记忆层：`LocalEpisodicMemory`（中期经验）+ `LocalSemanticMemory`（长期事实）
- 编排层：`OrchestratorAgent` → `LayoutPlanner` → `SubAgentRunner`（并发 4）→ `Assembler` → `AuditorAgent`

### Banyan

- 前端 React 19 + react-router-dom，布局组件放 `layouts/`，页面组件放 `pages/`，复用组件放 `components/`
- 后端 Koa + MVC 结构：`models/` → `services/` → `controllers/` → `routes/`
- 样式用 SCSS Modules（`*.module.scss`）
- API 客户端封装在 `frontend/src/api/`，使用 axios
- 动态 ORM：`SchemaService` + `OrmService`，集合名规则 `app_{appId}_{collectionName}`
- AI 代理：`AiService` 10 步 SSE 代理，`frontendPages` 优先策略避免竞态

## 关键入口文件

| 用途 | 文件路径 |
|------|----------|
| BanvasGL 核心引擎入口 | `packages/banvasgl/src/index.ts` |
| BanvasGL 核心模块总览 | `packages/banvasgl/src/core/index.ts` |
| BanvasGL 设计态入口 | `packages/banvas-design/src/index.ts` |
| BanvasGL 运行态接口层入口 | `packages/banvas-runtime/src/index.ts` |
| BanvasGL 运行态 Web 适配入口 | `packages/banvas-runtime-web/src/index.ts` |
| Flow 引擎入口 | `packages/flow/src/index.ts` |
| Flow 图编辑器入口 | `packages/flow-design/src/index.ts` |
| Banyan SDK 伞包入口 | `packages/banyan-sdk/src/index.ts` |
| XiangDi 公共 API | `packages/xiangdi-agent/src/index.ts` |
| XiangDi AgentLoop 核心 | `packages/xiangdi-agent/src/core/AgentLoop.ts` |
| XiangDi Spec 体系 | `packages/xiangdi-agent/src/spec/types.ts` |
| XiangDi 工具协议 | `packages/xiangdi-agent/src/tools/BanvasToolProtocol.ts` |
| XiangDi AISchema 定义 | `packages/xiangdi-agent/src/schema/AISchema.ts` |
| XiangDi AISchema ↔ BanvasGL 双向转换器 | `packages/xiangdi-agent/src/schema/converters.ts` |
| Banyan 前端路由 | `apps/banyan/frontend/src/routes/index.tsx` |
| Banyan 前端应用级布局 | `apps/banyan/frontend/src/layouts/ApplicationLayout/index.tsx` |
| Banyan 后端入口 | `apps/banyan/backend/src/app.ts` |
| Banyan 后端 AI 代理 | `apps/banyan/backend/src/services/AiService.ts` |
| Banyan 后端构建服务 | `apps/banyan/backend/src/services/build/index.ts` |
| Banyan 后端预览服务 | `apps/banyan/backend/src/services/preview/index.ts` |
| XiangDi HTTP 服务入口 | `apps/xiangdi-server/src/app.ts` |
| XiangDi HTTP 服务路由 | `apps/xiangdi-server/src/routes/ai.ts` |

## 禁止事项

- **禁止**在 `@banyuan/banvasgl` 核心包中引入编辑态模块（`useDesignBanvas`、Worker 等），这些已迁移至 `@banyuan/banvas-design`
- **禁止**直接修改 BanvasGL Scene 内部状态，必须通过 `TransactionManager` 或 XiangDi 工具协议
- **禁止**在 XiangDi AgentLoop 中硬编码特定 LLM provider，必须通过 `LLMClient` 接口
- **禁止**在 `apps/banyan/backend` 中直接 `import @banyuan/xiangdi-agent`，必须通过 HTTP 调用 XiangDi 服务（:3002）
- **禁止**在 `apps/xiangdi-server`（XiangDi 服务）中访问 MongoDB，持久化由 banyan 后端负责
- **禁止**跨包直接引用 `src/` 内部路径（必须通过包的公共导出）
- **禁止**在 `packages/` 目录下的库包中引入 React/DOM 等宿主环境依赖（除非在 hook/ 目录中且声明为 peerDep）
- **禁止**向 git 提交 API Key（`apiKey.json` 等文件已在 `.gitignore` 中）

## Agent 行为指引

- 修改 `@banyuan/banvasgl` 时，注意检查 `@banyuan/banvas-design`、`@banyuan/banvas-runtime-web` 等依赖包的导出是否需要同步更新
- 修改 XiangDi 时，新增工具需同时更新 `tools/index.ts` 和 `packages/xiangdi-agent/src/index.ts` 的导出
- 添加新依赖时，区分 `dependencies`（运行时需要）vs `devDependencies`（构建/测试时需要）vs `peerDependencies`（由宿主提供）
- 创建新文件时，记得在对应的 barrel 文件中添加导出
- 涉及 Schema 变更时，确保 `AISchema ↔ BanvasGL` 双向转换器同步更新
- 构建验证：`pnpm build:all` 应零错误通过（已知的 AISchema.ts Zod 类型推断问题除外）
- 前端新增页面时，布局组件放 `layouts/`，页面组件放 `pages/`，跨页面复用组件放 `components/`

## 相关文档

- [业务上下文](./docs/business.md) — 产品逻辑、用户故事、功能边界
- [踩坑记录](./docs/pitfalls.md) — 已知陷阱与规避方式
- [架构决策记录](./docs/adr/) — 关键设计决策的背景与权衡
- [BanvasGL README](./packages/banvasgl/README.md) — 核心 2D 图形引擎详细文档
- [XiangDi README](./packages/xiangdi-agent/README.md) — AI Agent 引擎详细文档
- [XiangDi Server README](./apps/xiangdi-server/README.md) — XiangDi AI Agent 独立 HTTP 服务
- [Banyan README](./apps/banyan/README.md) — 低代码可视化设计平台（frontend + backend + electron）
- [LunlunGlass README](./examples/lunlunglass/README.md) — 示例应用：眼镜店管理系统
