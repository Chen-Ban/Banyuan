# Banyan — 低代码可视化设计平台

> 榕树，根系盘错，一树成林。  
> Banyan 是 Banyuan 的应用层，将画布引擎、AI Agent、后端能力编织为一个完整的低代码平台。

用户通过拖拽或 AI 自然语言描述，在多页面画布上设计可视化应用，并一键打包为跨平台桌面安装包。

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
│   BanvasGL 画布编辑器                                      │
│   PropertyPanel（样式 / 数据 / 事件 / 流程 / 数据库 / 函数）│
│   AiBar（自然语言输入）                                     │
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
│   AI 代理（读 pages → 转发 XiangDi → 写 pages）            │
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

XiangDi 服务是无状态的——它不访问 MongoDB，不知道应用的当前状态。banyan 后端负责在 AI 请求前从 MongoDB 读取 pages，请求后将 Agent 返回的 pages 写回 MongoDB。这个"读-执行-写"的事务性操作必须在有数据库访问权限的后端完成。

### 为什么后端能力体系（Schema Builder + 云函数）是必要的？

没有后端能力，Banyan 只能生成"会动的原型"——交互逻辑和页面布局都有，但数据无处存储，业务逻辑无处运行。用户仍然需要自己写后端，这与"让非技术用户也能构建完整应用"的核心理念相悖。Schema Builder + 自动 ORM + 云函数，是填补这个断层的最小可行方案（详见 [ADR-011](../../docs/adr/011-backend-capability-system.md)）。

---

## 后端能力体系

Banyan 后端能力体系分三个阶段实施，目标是让用户无需写任何后端代码即可构建有数据持久化能力的完整应用。

**Phase 1 — 数据层**（已完成）：Schema Builder + 自动 ORM。用户在 PropertyPanel 的 Database Tab 上可视化定义数据模型（Collection + Fields），后端基于 Schema 自动生成 Mongoose Model 并暴露 CRUD API（`/api/apps/:appId/schema` 和 `/api/apps/:appId/data/:collectionName`）。

**Phase 2 — 逻辑层**（规划中）：云函数 Tab + 构建时服务器壳子。用户在 Functions Tab 中编写 TypeScript 云函数，通过 `ctx.db.{collectionName}` 访问自动 ORM 层。构建时，除前端 bundle 外额外生成一个轻量 Koa 服务，将所有云函数暴露为 `POST /functions/{functionName}` 端点，产物自包含、可独立部署。

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
pnpm --filter banyan dev
```

这会同时启动三个进程：

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
```

---

## 模块结构

### Frontend（`banyan-frontend`）

```
src/
├── api/           # axios 封装的 REST 客户端
├── components/    # 跨页面复用组件（BuildTaskModal 等）
├── pages/
│   ├── ApplicationList/    # 应用列表页
│   └── ApplicationDetail/  # 画布编辑器页
│       └── components/
│           ├── ComponentPalette/  # 左侧组件面板
│           ├── ContextMenu/       # 右键菜单
│           ├── PageList/          # 页面管理面板
│           └── PropertyPanel/     # 右侧属性面板
│               ├── PropertiesTab.tsx   # 位置/尺寸/旋转属性
│               ├── StyleTab.tsx        # 样式
│               ├── DataTab.tsx         # 数据绑定
│               ├── EventsTab.tsx       # 事件
│               ├── FlowCanvas.tsx      # 流程画布（内嵌编辑器）
│               ├── FlowEditorModal.tsx # 流程图全屏编辑弹窗
│               ├── FlowNodePalette.tsx # 流程节点物料面板
│               ├── DatabaseTab.tsx     # Schema Builder（Phase 1）
│               └── FunctionsTab/       # 云函数编辑器（Phase 2，规划中）
├── routes/        # react-router-dom 路由配置
└── utils/         # 工具函数
```

**页面路由**：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | ApplicationList | 应用列表，支持搜索和新建 |
| `/application/:id` | ApplicationDetail | 画布编辑器，多页面设计 |
| `/application/new` | ApplicationDetail | 新建应用（同编辑器页面） |

### Backend（`banyan-backend`）

```
src/
├── app.ts          # Koa 应用实例（中间件注册）
├── index.ts        # 入口（连接 MongoDB，启动监听）
├── config/
│   └── database.ts # MongoDB 连接配置
├── models/
│   ├── Application.ts   # 应用数据模型
│   ├── AppSchema.ts     # 用户定义的数据模型（Phase 1）
│   ├── AppFunction.ts   # 云函数元数据（Phase 2，预留）
│   ├── BuildTask.ts     # 构建任务记录
│   └── Conversation.ts  # AI 对话历史
├── services/
│   ├── ApplicationService.ts  # 应用 CRUD
│   ├── AiService.ts           # AI 代理（读 pages → 调 XiangDi → 写 pages）
│   ├── ConversationService.ts # 对话历史管理
│   ├── SummaryService.ts      # 对话摘要
│   ├── SchemaService.ts       # Schema CRUD + 动态 Mongoose Model（Phase 1）
│   ├── OrmService.ts          # 自动 ORM 访问层（Phase 1）
│   ├── build/                 # 构建服务（生成跨平台安装包）
│   └── preview/               # 预览服务（生成内存 HTML 预览）
├── controllers/
│   ├── ApplicationController.ts
│   ├── AiController.ts
│   ├── ConversationController.ts
│   ├── DataController.ts      # 自动 CRUD（Phase 1）
│   └── SchemaController.ts    # Schema Builder（Phase 1）
└── routes/
    ├── index.ts          # 路由聚合 + 健康检查
    ├── applications.ts   # 应用 CRUD 路由
    ├── ai.ts             # AI 对话路由
    ├── conversations.ts  # 对话历史路由
    ├── schema.ts         # Schema Builder 路由（Phase 1）
    ├── data.ts           # 自动 CRUD 路由（Phase 1）
    ├── build.ts          # 构建任务路由
    └── preview.ts        # 预览路由
```

**REST API**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/applications` | 获取应用列表（支持分页、关键词搜索） |
| GET | `/api/applications/:id` | 获取应用详情 |
| POST | `/api/applications` | 创建应用 |
| PUT | `/api/applications/:id` | 更新应用 |
| DELETE | `/api/applications/:id` | 删除应用 |
| POST | `/api/ai/:appId/chat` | AI 对话（SSE 流式，代理到 XiangDi 服务） |
| GET/POST/PUT/DELETE | `/api/apps/:appId/schema` | Schema Builder（Phase 1） |
| GET/POST/PUT/DELETE | `/api/apps/:appId/data/:collectionName` | 自动 CRUD（Phase 1） |
| GET | `/api/ai/:appId/conversations` | 获取对话历史列表 |
| GET/DELETE | `/api/ai/:appId/conversations/:id` | 获取/删除单条对话 |
| GET/POST/PUT/DELETE | `/api/apps/:appId/functions` | 云函数管理（Phase 2，规划中） |
| POST | `/api/v1/build/app` | 提交构建任务 |
| GET | `/api/v1/build/status/:taskId` | 查询构建任务状态 |
| GET | `/api/v1/build/download/:taskId` | 下载构建产物 |
| POST | `/preview` | 创建内存预览 |
| GET | `/preview/:previewId` | 获取预览 HTML |

### Electron（`banyan-electron`）

Electron 主进程（`src/main.ts`）负责创建 1400×900 的主窗口，开发模式加载 `http://localhost:5174`，生产模式加载 `frontend/dist/index.html`，并注册中文菜单和安全策略（禁止外部导航、禁止新窗口弹出）。

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
- 禁止在 backend 中直接 `import xiangdi`，AI 能力必须通过 HTTP 调用 XiangDi 服务（:3002）
