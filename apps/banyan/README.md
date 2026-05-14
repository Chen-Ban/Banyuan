# Banyan — 低代码可视化设计平台

Banyan（榕树）是 Banyuan monorepo 中的低代码平台应用，基于 BanvasGL 2D 图形引擎构建。用户通过拖拽或 AI 自然语言描述，在多页面画布上设计可视化应用，并一键打包为跨平台桌面安装包。

## 架构概览

Banyan 由三个子包组成，通过 `concurrently` 协同启动：

```
apps/banyan/
├── frontend/    # React 19 + Vite + Ant Design 6（设计器 UI）
├── backend/     # Koa + MongoDB（应用数据持久化服务）
└── electron/    # Electron 36（桌面壳，加载 frontend）
```

**数据流向**：

```
用户操作（拖拽/AI 指令）
    ↓
frontend（BanvasGL 画布编辑器）
    ↓ REST API（/api/*）
backend（Koa + Mongoose）
    ↓
MongoDB（应用 JSON 持久化）
```

Electron 壳在生产模式下直接加载 `frontend/dist/index.html`，开发模式下代理到 Vite 开发服务器（`localhost:5174`）。

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
```

## 技术栈

### Frontend（`banyan-frontend`）

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.0 | UI 框架 |
| Vite | ^6.3 | 构建工具 |
| Ant Design | ^6.0 | UI 组件库 |
| react-router-dom | ^7.9 | 客户端路由 |
| BanvasGL | workspace:* | 2D 画布引擎 |
| SCSS Modules | — | 组件样式隔离 |

路径别名：`@` → `src/`（在 `vite.config.ts` 中配置）。

**页面路由**：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | ApplicationList | 应用列表，支持搜索和新建 |
| `/application/:id` | ApplicationDetail | 画布编辑器，多页面设计 |
| `/application/new` | ApplicationDetail | 新建应用（同编辑器页面） |

**目录结构**：

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
│           └── PropertyPanel/     # 右侧属性面板（样式/数据/事件/流程）
├── routes/        # react-router-dom 路由配置
└── utils/         # 工具函数
```

### Backend（`banyan-backend`）

| 技术 | 版本 | 用途 |
|------|------|------|
| Koa | ^2.15 | HTTP 框架 |
| @koa/router | ^13.0 | 路由 |
| koa-body | ^6.0 | 请求体解析（支持文件上传，最大 20MB） |
| Mongoose | ^8.7 | MongoDB ODM |
| tsx | ^4.19 | TypeScript 直接运行（开发模式） |

**MVC 结构**：

```
src/
├── app.ts          # Koa 应用实例（中间件注册）
├── index.ts        # 入口（连接 MongoDB，启动监听）
├── config/
│   └── database.ts # MongoDB 连接配置
├── models/
│   └── Application.ts  # 应用数据模型（Mongoose Schema）
├── services/
│   └── ApplicationService.ts  # 业务逻辑层
├── controllers/
│   └── ApplicationController.ts  # 请求处理层
└── routes/
    ├── index.ts          # 路由聚合 + 健康检查
    └── applications.ts   # 应用 CRUD 路由
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

**Application 数据模型**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String | 业务 ID（唯一） |
| `name` | String | 应用名称（最长 200 字符） |
| `description` | String | 应用描述（最长 1000 字符） |
| `thumbnail` | String | 缩略图 URL |
| `pages` | String[] | 多页面 JSON 数组（BanvasGL Serializer 输出） |
| `tags` | String[] | 标签 |
| `version` | Number | 版本号（每次保存自增） |
| `createdBy` | String | 创建者 |
| `updatedBy` | String | 最后修改者 |
| `createdAt` | Date | 创建时间（自动） |
| `updatedAt` | Date | 更新时间（自动） |

### Electron（`banyan-electron`）

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^36.1 | 桌面应用框架 |
| BanvasGL | workspace:* | 引擎类型引用 |

Electron 主进程（`src/main.ts`）负责：

- 创建 1400×900 的主窗口
- 开发模式：加载 `http://localhost:5174`，自动重试直到 Vite 就绪
- 生产模式：加载 `frontend/dist/index.html`
- 注册中文菜单（文件/编辑/视图/窗口/帮助）
- 安全策略：禁止外部导航，禁止新窗口弹出

## 构建

```bash
# 构建前端（输出到 frontend/dist/）
pnpm --filter banyan-frontend build

# 构建后端（输出到 backend/dist/）
pnpm --filter banyan-backend build

# 构建 Electron 主进程（输出到 electron/dist/）
pnpm --filter banyan-electron build
```

构建完成后，Electron 会从 `frontend/dist/index.html` 加载前端产物。打包为安装包需要额外配置 `electron-builder`（待实现）。

## 开发规范

- 样式使用 SCSS Modules（`*.module.scss`），禁止全局样式污染
- API 调用统一通过 `src/api/` 目录下的封装函数，不直接使用 axios
- 新增页面在 `src/routes/index.tsx` 中注册路由
- 新增后端路由在 `src/routes/` 下创建文件，并在 `routes/index.ts` 中挂载
- 前端开发服务器端口固定为 `5174`（`strictPort: true`），Electron 依赖此端口

## 与 Monorepo 其他包的关系

- **BanvasGL**：前端和 Electron 均依赖 `banvasgl (workspace:*)`，提供 2D 画布渲染能力
- **XiangDi**：AI Agent 引擎，未来将集成到 frontend，提供自然语言生成画布的能力
- **packages/server**：平台级构建与预览服务，与 Banyan backend 独立，负责将应用打包为安装包
