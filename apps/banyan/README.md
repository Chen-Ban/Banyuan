# Banyan — 低代码可视化设计平台

> 榕树，根系盘错，一树成林。  
> Banyan 是 Banyuan 的应用层，将画布引擎、AI Agent、后端能力编织为一个完整的低代码平台。

用户通过拖拽或 AI 自然语言描述，在多页面画布上设计可视化应用，并一键打包为跨平台桌面安装包或发布为 Web 应用。

---

## 架构

Banyan 由三个子包组成，通过 `concurrently` 协同启动：

```
apps/banyan/
├── frontend/    # React 19 + Vite + Ant Design 6（设计器 UI）
├── backend/     # Koa + MongoDB（应用数据持久化服务）
└── electron/    # Electron 36（桌面壳，加载 frontend）
```

**数据流向**：

```
用户操作（拖拽 / AI 指令）
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│                    frontend（:5174）                        │
│                                                           │
│   @banyuan/banvasgl 画布引擎（useCanvasInit hook）          │
│   PropertyDrawer（属性 / 样式 / 数据 / 事件）              │
│   AiBar（自然语言输入 + 对话面板 + 消歧 + 规划审批）       │
└───────────────────────┬───────────────────────────────────┘
                        │ REST API（/api/*）
                        ▼
┌───────────────────────────────────────────────────────────┐
│                    backend（:3001）                         │
│                                                           │
│   Koa + Mongoose                                          │
│   应用 CRUD / Schema Builder / 云函数管理                  │
│   构建服务（生成跨平台安装包）                               │
│   预览服务（内存 HTML 预览）                                │
│   Web 部署服务（发布到 CDN）                               │
│   AI 代理（读 appJSON → 转发 XiangDi → 写 appJSON）       │
│                    │                    │                  │
│                    ▼                    ▼                  │
│              MongoDB              XiangDi 服务(:3002)      │
│         （应用 JSON 持久化）       （无状态 Agent 执行）     │
└───────────────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│                    electron（桌面壳）                       │
│                                                           │
│   开发模式：加载 http://localhost:5174                      │
│   生产模式：加载 frontend/dist/index.html                  │
└───────────────────────────────────────────────────────────┘
```

---

## 为什么这样设计

### 为什么需要 Banyan？

BanvasGL 是画布引擎，XiangDi 是 AI Agent 引擎，它们都是无状态的库。用户需要一个有持久化、有 UI、能打包的完整应用——这就是 Banyan 存在的理由。Banyan 是引擎层能力的集成者，而不是重复造轮子的地方。

### 为什么前端、后端、Electron 分三个子包？

三者的构建目标、运行时环境、依赖完全不同：前端是浏览器 bundle，后端是 Node.js 服务，Electron 是桌面进程。分包让每个子包只关心自己的构建配置，也让 CI 可以按需只构建变更的部分。

### 为什么后端选 Koa 而不是 Express / Fastify / Hono？

Koa 的中间件模型（`async/await` 洋葱圈）与 TypeScript 配合自然，生态成熟（`@koa/router`、`koa-body`、`@koa/cors`），且构建时生成的服务器壳子也使用 Koa，保持技术栈统一，降低维护成本。

### 为什么 AI 请求要经过 banyan 后端中转，而不是前端直连 XiangDi？

XiangDi 服务是无状态的——它不访问 MongoDB，不知道应用的当前状态。banyan 后端负责在 AI 请求前从 MongoDB 读取 appJSON，请求后将 Agent 返回的 appJSON 写回 MongoDB。这个"读-执行-写"的事务性操作必须在有数据库访问权限的后端完成。

### 为什么后端能力体系（Schema Builder + 云函数）是必要的？

没有后端能力，Banyan 只能生成"会动的原型"——交互逻辑和页面布局都有，但数据无处存储，业务逻辑无处运行。用户仍然需要自己写后端，这与"让非技术用户也能构建完整应用"的核心理念相悖。Schema Builder + 自动 ORM + 云函数，是填补这个断层的最小可行方案（详见 [ADR-011](../../docs/adr/011-backend-capability-system.md)）。

---

## 后端能力体系

Banyan 后端能力体系分三个阶段实施，目标是让用户无需写任何后端代码即可构建有数据持久化能力的完整应用。

**Phase 1 — 数据层**（已完成）：Schema Builder + 自动 ORM。用户在 DatabasePage 中可视化定义数据模型（Collection + Fields），后端基于 Schema 自动生成 Mongoose Model 并暴露 CRUD API（`/api/apps/:appId/schema` 和 `/api/apps/:appId/data/:collectionName`）。

**Phase 2 — 逻辑层**（已完成）：云函数管理。用户在 FunctionsPage 中通过可视化流程编辑器创建云函数（FlowSchema），可被页面组件事件绑定调用。banyan 后端仅负责云函数定义（FlowSchema）的存储；**FlowSchema 的实际执行宿主位于用户 ECS 产物**（由 `packages/deploy-agent` 的 scaffold 生成的 flowRunner 模块，在用户自己的服务器 + MongoDB 上执行），以实现预览/线上同构与请求分流。

**Phase 3 — AI 层**（规划中）：AI 生成云函数。XiangDi 新增云函数工具集，AppSchema 作为 ProjectSpec 注入 AgentLoop 上下文，用户用自然语言描述业务逻辑，AI 生成符合数据模型的云函数代码。

---

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10.10
- MongoDB（本地运行，默认端口 27017）

### 安装依赖

在 monorepo 根目录执行：

```bash
pnpm install
```

### 启动开发环境

```bash
# 在 monorepo 根目录
pnpm dev:banyan
```

这会同时启动所有进程：

| 进程 | 地址 | 说明 |
|------|------|------|
| frontend | http://localhost:5174 | Vite 开发服务器 |
| backend | http://localhost:3001 | Koa API 服务 |
| electron | — | 等待 frontend 就绪后自动打开桌面窗口 |

也可以单独启动各子包：

```bash
pnpm --filter banyan-frontend dev   # 仅前端
pnpm --filter banyan-backend dev    # 仅后端
pnpm --filter banyan-electron dev   # 仅 Electron（需先启动 frontend）
```

### 环境变量

后端支持通过 `.env` 文件配置（在 `backend/` 目录下创建）：

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/banyan
# 或分开配置：
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=banyan

# XiangDi AI Agent 服务地址（默认 http://localhost:3002）
XIANGDI_URL=http://localhost:3002

# 知识服务地址（默认 http://localhost:3003）
KNOWLEDGE_URL=http://localhost:3003

# 内部 API Token（XiangDi 回调鉴权，开发默认 __dev_internal_token__）
INTERNAL_API_TOKEN=your_token_here

# 知识服务写操作 Token（生产环境必须配置）
KNOWLEDGE_INTERNAL_TOKEN=your_knowledge_token
```

---

## 模块结构

### Frontend（`banyan-frontend`）

```
src/
├── api/           # axios 封装的 REST 客户端
│   ├── applications.ts   # 应用 CRUD
│   ├── ai.ts             # AI 对话
│   ├── auth.ts           # 认证（短信登录 + Token）
│   ├── build.ts          # 构建任务
│   ├── cloudFunctions.ts # 云函数管理
│   ├── conversations.ts  # 对话历史
│   ├── data.ts           # 自动 CRUD
│   ├── deploy.ts         # Web 部署
│   ├── materials.ts      # 物料管理
│   ├── planning.ts       # Multi-Agent 规划
│   └── schema.ts         # Schema Builder
├── components/    # 跨页面复用组件
│   ├── AiBar/             # 自然语言输入 + ConversationPanel + DisambiguationPanel + PlanningCard
│   ├── DesignEditor/      # UI 设计编辑器组件（DesignContextMenu / DesignMaterialPalette / PropertyPanel）
│   │   └── PropertyPanel/
│   │       ├── PropertiesTab/      # 位置/尺寸/旋转属性
│   │       ├── StyleTab/           # 样式（填充/描边/阴影）
│   │       ├── DataTab/            # 数据绑定 + FieldSchemaMapEditor
│   │       └── EventsTab/         # 事件 + FlowEditorModal + FlowCanvas
│   ├── FlowEditor/        # 流程图编辑器组件（FlowContextMenu / FlowMaterialPalette / FlowEditorModal）
│   ├── BuildTaskModal/    # 构建任务弹窗
│   ├── DeployPanel/       # Web 部署面板
│   ├── LoginModal/        # 登录弹窗
│   ├── MaterialPanel/     # 物料市场面板
│   ├── SaveMaterialModal/ # 保存为物料弹窗
│   ├── ProtectedRoute/    # 路由守卫
│   └── UserWidget/        # 用户头像/登录状态
├── hooks/         # React Hook
│   ├── useAuth.tsx            # 认证状态管理
│   ├── useDesignBanvas.tsx    # UI 设计画布 hook（初始化 + 交互 + 右键菜单）
│   ├── useDesignContextMenu.ts # 设计态右键菜单
│   ├── useFlowBanvas.tsx      # 流程图画布 hook
│   ├── useFlowContextMenu.ts  # 流程图右键菜单
│   ├── useInteraction.ts      # 统一交互 hook（Design/Flow 双模式，状态机 + DOM 事件）
│   └── useXiangDi.ts         # AI 对话 hook
├── layouts/
│   ├── RootLayout/        # 全局布局壳（Sidebar + AiBar 单例）
│   └── ApplicationLayout/ # 应用级布局（Tab 切换：画布/数据库/云函数，KeepAlive 模式）
├── pages/
│   ├── HomePage/          # 首页（Landing page + AI Prompt 入口）
│   ├── ApplicationListPage/ # 应用列表页
│   ├── UIPage/            # 画布子页面
│   │   └── components/
│   │       ├── ComponentPalette/  # 物料面板
│   │       └── PropertyDrawer/    # 属性抽屉
│   ├── DatabasePage/      # 数据库管理子页面
│   │   └── components/
│   │       ├── CollectionList.tsx  # 集合列表
│   │       └── FieldEditor.tsx    # 字段编辑器
│   ├── FunctionsPage/     # 云函数管理子页面
│   │   └── components/
│   │       ├── FlowEditor/     # 云函数流程编辑器
│   │       └── FunctionList/   # 函数列表
│   └── SettingsPage/      # 设置页（AI Agent Prompt 配置）
├── routes/        # react-router-dom 路由配置
├── styles/        # 全局样式 + Design Token
├── theme/         # Ant Design 主题配置
├── types/         # TypeScript 类型定义
└── utils/         # 工具函数
```

**页面路由**：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | HomePage | 首页 Landing page，AI Prompt 输入框 |
| `/applications` | ApplicationListPage | 应用列表，支持搜索和新建 |
| `/settings` | SettingsPage | 全局设置 |
| `/application/:id/*` | ApplicationLayout | 应用编辑（KeepAlive Tab 切换） |
| `/application/:id/ui` | UIPage | 画布设计子页面 |
| `/application/:id/database` | DatabasePage | 数据库管理子页面 |
| `/application/:id/functions` | FunctionsPage | 云函数管理子页面 |

注：`/application/:id/*` 使用 KeepAlive 模式（同时渲染三个子页面，display 切换），ApplicationLayout 内部通过 URL 尾段判断激活 Tab。

### Backend（`banyan-backend`）

```
src/
├── app.ts          # Koa 应用实例（中间件注册）
├── index.ts        # 入口（连接 MongoDB，启动监听）
├── config/
│   └── database.ts # MongoDB 连接配置
├── middleware/
│   ├── auth.ts         # JWT 认证中间件
│   └── appOwnership.ts # 应用归属校验中间件
├── models/
│   ├── Application.ts     # 应用数据模型（含 application_id、appJSON、Web 部署字段）
│   ├── CollectionSchema.ts # 用户定义的数据模型（Phase 1）
│   ├── CloudFunction.ts   # 云函数元数据（Phase 2）
│   ├── Conversation.ts    # AI 对话历史
│   ├── Material.ts        # 物料库
│   ├── PackageTask.ts     # 构建任务记录
│   ├── Deployment.ts      # 部署记录
│   ├── Snapshot.ts        # 应用快照
│   ├── PlanningArtifact.ts # Multi-Agent 规划产物
│   ├── AgentMemory.ts     # Agent 记忆
│   ├── AgentPrompt.ts     # Agent 角色配置
│   ├── User.ts            # 用户
│   ├── Tenant.ts          # 租户
│   └── RefreshToken.ts    # Token 刷新
├── services/
│   ├── ApplicationService.ts    # 应用 CRUD
│   ├── AiService.ts             # AI 代理（读 appJSON → 调 XiangDi → 写 appJSON）
│   ├── AgentGateway.ts          # Agent 网关（WebSocket + SSE 管理）
│   ├── AgentPromptService.ts    # Agent Prompt 配置服务
│   ├── AuthService.ts           # 认证服务（JWT + 短信验证）
│   ├── CloudFunctionService.ts  # 云函数 CRUD
│   ├── ContextBuilder.ts        # AI 上下文构建器
│   ├── ConversationService.ts   # 对话历史管理
│   ├── DnsManager.ts            # DNS 管理（Web 部署）
│   ├── EcsManager.ts            # ECS 管理（Web 部署）
│   ├── KnowledgeClient.ts       # 知识服务代理客户端
│   ├── MaterialService.ts       # 物料 CRUD
│   ├── MemoryService.ts         # Agent 记忆管理
│   ├── OrmService.ts            # 自动 ORM 访问层（Phase 1）
│   ├── OssService.ts            # OSS 文件上传
│   ├── PendingStore.ts          # AI 对话暂存（确认/撤销机制）
│   ├── PlanningArtifactService.ts # Multi-Agent 规划产物服务
│   ├── SchemaService.ts         # Schema CRUD + 动态 Mongoose Model（Phase 1）
│   ├── SmsService.ts            # 短信验证码服务
│   ├── SnapshotService.ts       # 应用快照服务
│   ├── TenantProvisionService.ts # 租户初始化
│   └── preview/                 # 预览服务（生成内存 HTML 预览）
├── controllers/
│   ├── ApplicationController.ts
│   ├── AiController.ts
│   ├── AuthController.ts
│   ├── CloudFunctionController.ts
│   ├── ConversationController.ts
│   ├── DataController.ts        # 自动 CRUD（Phase 1）
│   ├── DeployController.ts      # Web 部署
│   ├── MaterialController.ts    # 物料管理
│   ├── PlanningController.ts    # Multi-Agent 规划 + Agent Prompt 配置
│   └── SchemaController.ts      # Schema Builder（Phase 1）
├── routes/
│   ├── index.ts          # 路由汇总（注册顺序 + 鉴权分层）
│   ├── auth.ts           # 认证路由（短信登录、Token 刷新、登出）
│   ├── applications.ts   # 应用 CRUD 路由
│   ├── ai.ts             # AI 对话路由（chat/confirm/discard/resume/models）
│   ├── conversations.ts  # 对话历史路由
│   ├── schema.ts         # Schema Builder 路由（Phase 1）
│   ├── data.ts           # 自动 CRUD 路由（Phase 1）
│   ├── cloudFunctions.ts # 云函数 CRUD 路由（仅定义存储，执行在 ECS 产物）
│   ├── build.ts          # 构建任务路由
│   ├── preview.ts        # 预览路由
│   ├── deploy.ts         # Web 部署路由
│   ├── upload.ts         # 文件上传路由（缩略图 + OSS 预签名）
│   ├── knowledge.ts      # 知识库代理路由（转发到 knowledge-server:3003）
│   ├── materials.ts      # 物料 CRUD 路由
│   ├── planning.ts       # Multi-Agent 规划 + Agent Prompt 配置路由
│   └── internal.ts       # 内部 API（供 XiangDi 回调，X-Internal-Token 鉴权）
├── seeds/
│   └── builtinMaterials.ts # 内置物料种子数据
└── utils/
    └── which.ts
```

**REST API**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |
| POST | `/api/auth/sms/send` | 发送短信验证码 |
| POST | `/api/auth/sms/verify` | 短信验证码登录 |
| POST | `/api/auth/refresh` | 刷新 Token |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| GET | `/api/applications` | 获取应用列表 |
| GET | `/api/applications/:id` | 获取应用详情 |
| POST | `/api/applications` | 创建应用 |
| PUT | `/api/applications/:id` | 更新应用 |
| DELETE | `/api/applications/:id` | 删除应用 |
| POST | `/api/applications/:id/thumbnail` | 上传应用缩略图 |
| POST | `/api/applications/:id/upload/presign` | 获取 OSS 预签名 URL |
| POST | `/api/ai/:appId/chat` | AI 对话（SSE 流式，代理到 XiangDi 服务） |
| GET | `/api/ai/:appId/status` | 查询 AI 执行状态 |
| GET | `/api/ai/:appId/pending` | 获取 pending 对话数据 |
| POST | `/api/ai/:appId/confirm` | 确认对话（持久化 pending 数据） |
| POST | `/api/ai/:appId/discard` | 撤销对话（丢弃 pending 数据） |
| POST | `/api/ai/:appId/resume` | 从 checkpoint 恢复 AI 执行（SSE） |
| POST | `/api/ai/disambiguation-response` | 转发消歧选择到 XiangDi |
| GET | `/api/ai/models` | 查询可用 LLM provider |
| POST | `/api/ai/models/switch` | 切换 LLM provider |
| GET | `/api/applications/:appId/conversation/dialogues` | 获取对话列表（Dialogue[]） |
| GET | `/api/apps/:appId/schema` | 获取应用 Schema |
| POST | `/api/apps/:appId/schema/collections` | 添加 Collection |
| PUT | `/api/apps/:appId/schema/collections/:name` | 更新 Collection |
| DELETE | `/api/apps/:appId/schema/collections/:name` | 删除 Collection |
| POST | `/api/apps/:appId/schema/collections/:name/fields` | 添加 Field |
| PUT | `/api/apps/:appId/schema/collections/:name/fields/:field` | 更新 Field |
| DELETE | `/api/apps/:appId/schema/collections/:name/fields/:field` | 删除 Field |
| GET/POST/PUT/DELETE | `/api/apps/:appId/data/:collectionName[/:id]` | 自动 CRUD |
| GET/POST/PUT/DELETE | `/api/apps/:appId/cloud-functions[/:functionId]` | 云函数 CRUD（仅定义存储；执行在 ECS 产物） |
| GET/POST/PUT/DELETE | `/api/materials[/:id]` | 物料管理 |
| GET | `/api/materials/search` | 物料搜索 |
| POST | `/api/v1/build/app` | 提交构建任务 |
| GET | `/api/v1/build/status/:taskId` | 查询构建任务状态 |
| GET | `/api/v1/build/download/:taskId` | 下载构建产物 |
| POST | `/api/deploy/publish` | 发布应用到 Web |
| POST | `/api/deploy/rollback` | 回滚到历史版本 |
| GET | `/api/deploy/status/:deploymentId` | 查询部署状态 |
| GET | `/api/deploy/history/:applicationId` | 查询部署历史 |
| GET | `/api/deploy/agent-status` | 查询 agent 在线状态 |
| POST | `/preview` | 创建内存预览（无需认证） |
| GET | `/preview/:previewId` | 获取预览 HTML（无需认证） |
| POST | `/api/knowledge/search` | 知识库搜索（代理到 knowledge-server） |
| POST | `/api/knowledge/upsert` | 知识库写入（代理到 knowledge-server） |
| DELETE | `/api/knowledge/entries` | 知识库删除（代理到 knowledge-server） |
| GET | `/api/knowledge/stats` | 知识库统计（代理到 knowledge-server） |
| POST | `/api/knowledge/embed` | 向量嵌入（代理到 knowledge-server） |
| GET | `/api/applications/:appId/planning/artifact/:dialogueId` | 获取规划产物 |
| GET | `/api/applications/:appId/planning/artifact-latest` | 获取最新规划产物 |
| GET/PUT | `/api/applications/:appId/prompts[/:agent]` | Agent Prompt 配置 CRUD |
| GET | `/internal/apps/:appId/appJSON` | 内部：获取应用 appJSON（X-Internal-Token） |
| GET | `/internal/apps/:appId/schema` | 内部：获取应用 Schema |
| GET | `/internal/apps/:appId/cloud-functions[/:functionId]` | 内部：获取云函数 |

### Electron（`banyan-electron`）

Electron 主进程（`src/main.ts`）负责创建主窗口，开发模式加载 `http://localhost:5174`，生产模式加载 `frontend/dist/index.html`，并注册中文菜单和安全策略（禁止外部导航、禁止新窗口弹出）。

---

## 构建

```bash
# 构建前端（输出到 frontend/dist/）
pnpm --filter banyan-frontend build

# 构建后端（输出到 backend/dist/）
pnpm --filter banyan-backend build

# 构建 Electron 主进程（输出到 electron/dist/）
pnpm --filter banyan-electron build
```

构建完成后，Electron 从 `frontend/dist/index.html` 加载前端产物。

---

## 开发规范

- 样式使用 SCSS Modules（`*.module.scss`），禁止全局样式污染
- API 调用统一通过 `src/api/` 目录下的封装函数，不直接使用 axios
- 新增页面在 `src/routes/index.tsx` 中注册路由
- 新增后端路由在 `src/routes/` 下创建文件，并在 `routes/index.ts` 中挂载
- 前端开发服务器端口固定为 `5174`（`strictPort: true`），Electron 依赖此端口
- 禁止在 backend 中直接 `import @banyuan/xiangdi-agent`，AI 能力必须通过 HTTP 调用 XiangDi 服务（:3002）
- 应用标识使用 `application_id` 字段（非 `id`），所有 API 路径和前端代码保持一致
- 画布引擎通过 `@banyuan/banvasgl/react` 提供的 `useCanvasInit` hook 初始化，前端不直接操作底层 Canvas API
- DesignEditor 和 FlowEditor 组件放在 `components/` 目录下，作为跨页面复用模块
- PropertyPanel 各 Tab 独立子目录（PropertiesTab / StyleTab / DataTab / EventsTab）
- 所有需要认证的路由使用 `ProtectedRoute` 包裹
- ApplicationLayout 使用 KeepAlive 模式同时渲染三个子页面（UIPage / DatabasePage / FunctionsPage），通过 display 切换
