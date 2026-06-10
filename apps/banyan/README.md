# Banyan —— 低代码可视化设计平台

Banyan 是 Banyuan 的主应用，提供完整的低代码应用构建体验。用户在这里设计界面、定义数据、编排逻辑、对话 AI、构建部署。

---

## 它做什么

Banyan 覆盖应用构建的完整链路：

- **画布编辑器**：拖拽组件到画布上，可视化调整位置/大小/样式/布局
- **AI 对话生成**：用自然语言描述需求，AI 自动生成或修改页面
- **数据库设计器**：定义数据模型（集合、字段、类型），自动生成 CRUD 接口
- **云函数编辑器**：用流程图编排业务逻辑（数据查询/HTTP 请求/条件分支/脚本）
- **应用构建**：一键打包为跨平台桌面安装包（Windows/macOS/Linux）

---

## 三个子应用

| 子应用 | 技术栈 | 职责 |
|--------|--------|------|
| frontend | React 19 + Vite + Ant Design 6 + zustand | UI 编辑器、属性面板、AI 对话、流程编辑器、预览与数据浏览 |
| backend | Koa + MongoDB (Mongoose) | 应用数据持久化（SchemaService 动态集合）、物料系统、AI 代理、构建/预览、部署（AgentGateway → ECS deploy-agent） |
| electron | Electron 36 | 桌面壳，将 Web 应用打包为原生安装包 |

---

## 页面结构

| 路径 | 功能 |
|------|------|
| `/` | 首页（创建/打开应用） |
| `/applications` | 应用列表 |
| `/settings` | 应用设置 |
| `/application/:id` | 应用详情（默认重定向到 `preview`） |
| `/application/:id/preview` | 预览态 |
| `/application/:id/ui` | UI 画布编辑器（拖拽设计 + AI 对话） |
| `/application/:id/database` | 数据库 Schema 设计器 |
| `/application/:id/data-browser` | 数据浏览器 |
| `/application/:id/functions` | 云函数流程编辑器 |

---

## 快速开始

```bash
# 在 monorepo 根目录
pnpm install

# 启动完整平台（含 AI 能力）
pnpm dev:banyan
```

这会同时启动 BanvasGL watch、XiangDi Agent watch、XiangDi Server、Knowledge Server、Banyan 前后端，共 6 个进程。

前置条件：Node.js >= 20、MongoDB 运行中、DeepSeek API Key 已配置。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3001 | 后端服务端口 |
| `MONGODB_URI` | mongodb://localhost:27017/banyan | 数据库连接 |
| `XIANGDI_URL` | http://localhost:3002 | XiangDi AI 服务地址 |

---

## 在 Monorepo 中的位置

```
Banyan frontend  ──依赖──▶  @banyuan/banvasgl（画布渲染）
Banyan backend   ──依赖──▶  @banyuan/banvasgl/flow/server（FlowSchema 类型/存储）
Banyan backend   ──HTTP SSE─▶  XiangDi Server(:3002)（AI 代理）
Banyan backend   ── ws ───▶  租户 ECS deploy-agent（部署）
```

Banyan 后端不直接引用 `@banyuan/xiangdi-agent`，AI 能力通过 HTTP 调用 XiangDi Server 获得；云函数的 FlowSchema 执行也不在 Banyan 后端，而是在租户 ECS 的 deploy-agent 产物中。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
