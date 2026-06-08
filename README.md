<p align="center">
  <img src="./assets/banyuan-logo.png" alt="Banyuan Logo" width="120" />
</p>

<h1 align="center">班园 Banyuan</h1>

<p align="center">
  <em>虽由人作，宛自天开 —— 以画布为山石，以组件为草木，以数据为活水，以 AI 为匠心，造一方数字园林。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2F%20Commercial-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/Electron-36-47848f.svg" alt="Electron 36" />
</p>

---

**Banyuan（班园）** 是一个低代码可视化应用构建平台。用户通过拖拽或自然语言描述来设计多页面应用，定义数据模型、编排交互逻辑、编写云函数，最终一键构建为可独立部署的完整应用（前端 + 后端服务器 + 桌面安装包）。

<!-- TODO: 添加截图或 GIF 演示 -->

---

## 这个项目能做什么

Banyuan 解决的核心问题是：**让非专业开发者也能构建完整的、可独立部署运行的桌面应用**——不只是前端页面，而是包含后端数据层和业务逻辑层的完整应用。

用户在画布上可视化搭建界面，用自然语言对话让 AI 帮忙生成或修改页面，通过 Schema 设计器定义数据结构，用流程编辑器编排交互逻辑和云函数，最后一键打包为跨平台桌面应用。

---

## 模块概览

Banyuan 是一个 pnpm monorepo，由引擎层和应用层组成：

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              应用层 (apps/)                                      │
│                                                                                 │
│   ┌────────────────────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│   │  Banyan 低代码平台          │  │  XiangDi     │  │  Knowledge 知识服务    │   │
│   │  frontend(:5174)           │  │  Server      │  │  向量检索 + 精排       │   │
│   │  backend(:3001)            │  │  (:3002)     │  │  (:3003)             │   │
│   │  electron(桌面)             │  │  AI Agent    │  │                      │   │
│   └────────────┬───────────────┘  └───────┬──────┘  └───────────────────────┘   │
│                │                          │                                      │
├────────────────┼──────────────────────────┼──────────────────────────────────────┤
│                ▼                          ▼           引擎层 (packages/)          │
│                                                                                  │
│   ┌─────────────────────────┐  ┌──────────────────────┐                         │
│   │ @banyuan/banvasgl       │  │ @banyuan/            │                         │
│   │ 图形运行时(含流程)      │  │ xiangdi-agent        │                         │
│   │                         │  │ AI Agent 引擎         │                         │
│   └─────────────────────────┘  └──────────────────────┘                         │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### BanvasGL —— 面向声明式 UI 的 2D 图形运行时（含流程控制，`@banyuan/banvasgl`）

Banyuan 的渲染基础。基于 Canvas 2D 双缓冲，自带完整的场景图体系、视图系统、动画系统、事务化撤销/重做，以及内置的声明式流程引擎（FlowRunner）。一份渲染逻辑，浏览器和桌面端行为完全一致。

流程引擎（Flow）以子路径导出的方式内置于 BanvasGL，前后端共享同一套 FlowSchema 格式，分别预装不同的节点类型——前端负责动画/导航/数据绑定，后端负责数据库操作/HTTP 请求/脚本执行。

### XiangDi —— AI Agent 引擎（`@banyuan/xiangdi-agent`）

驱动 AI 生成能力的 Agent 引擎。采用多 Agent 协作架构（OrchestratorGraph），将一次 AI 对话拆解为需求理解、UI 设计、前后端代码生成、审计验证等阶段，每个阶段由专职 SubAgent 处理。LLM 输出经过结构化验证后转换为画布操作，确保生成结果的正确性。

### Banyan —— 低代码平台

基于上述引擎构建的完整平台应用，包含前端编辑器（React 19 + Vite）、后端服务（Koa + MongoDB）、桌面壳（Electron 36）三个子应用。提供拖拽画布编辑器、AI 对话生成、数据库 Schema 设计器、云函数流程编辑器、应用构建/部署等完整功能。

### Knowledge Server —— 知识服务

独立的知识检索微服务，为 AI Agent 提供 BanvasGL 组件能力的知识检索。基于向量检索 + 全文检索 + 精排三阶段管线，按引擎版本隔离知识库，本地 ONNX 推理不依赖外部 API。

---

## 运行时架构

```
前端(:5174) ←── Vite proxy /api ──▶ Banyan 后端(:3001)
                                          │
                                          │ HTTP SSE
                                          ▼
                                   XiangDi 服务(:3002) ──▶ 知识服务(:3003)
```

AI 请求流程：前端发起对话 → Banyan 后端读取应用数据并转发 → XiangDi 服务执行 AI 生成 → 结果写回数据库 → 前端实时更新画布。

---

## 快速开始

**前置条件**：Node.js >= 20、pnpm >= 10、MongoDB >= 6.0、DeepSeek API Key

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 配置 AI API Key
echo '{ "apiKey": "sk-your-deepseek-key" }' > apps/xiangdi-server/src/apiKey.json

# 启动 Banyan 低代码平台（含 AI 能力）
pnpm dev:banyan
```

启动后访问 `http://localhost:5174`，即可开始创建应用。

### 启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| Banyan 前端 | :5174 | Vite 开发服务器 |
| Banyan 后端 | :3001 | Koa 应用服务 |
| XiangDi 服务 | :3002 | AI Agent 服务 |
| Knowledge 服务 | :3003 | 知识检索服务 |
| BanvasGL / XiangDi Agent | — | watch 模式自动重编译 |

---

## 项目结构

```
Banyuan/
├── packages/
│   ├── banvasgl/            # 面向声明式 UI 的 2D 图形运行时（含流程控制）
│   └── xiangdi-agent/       # AI Agent 引擎
├── apps/
│   ├── banyan/              # 低代码平台应用
│   │   ├── frontend/        #   React 19 + Vite + Ant Design 6
│   │   ├── backend/         #   Koa + MongoDB
│   │   └── electron/        #   Electron 36 桌面壳
│   ├── xiangdi-server/      # XiangDi AI Agent HTTP 服务
│   └── knowledge-server/    # 知识检索微服务
├── examples/
│   └── lunlunglass/         # 示例：眼镜店管理系统
└── docs/                    # 架构决策记录、业务文档
```

---

## 设计哲学

**渲染层与宿主解耦**：Canvas 2D 在浏览器、Electron、未来的移动端行为一致，自研引擎换来跨平台路径清晰。

**流程与渲染是同一层抽象**：每个视图对象天然绑定事件处理和生命周期流程（FlowSchema），渲染和交互逻辑内聚在同一层。

**AI 生成的目标是结构，不是文本**：LLM 输出必须精确映射为画布操作，Agent 引擎将结构化验证和意图对齐内置为一等机制。

**后端能力不缺席**：低代码的承诺延伸到完整可部署应用——数据层、逻辑层、部署层全部覆盖。

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [BanvasGL](./packages/banvasgl/README.md) | 面向声明式 UI 的 2D 图形运行时（含流程控制） |
| [XiangDi Agent](./packages/xiangdi-agent/README.md) | AI Agent 引擎 |
| [Banyan](./apps/banyan/README.md) | 低代码平台（前端 + 后端 + 桌面） |
| [XiangDi Server](./apps/xiangdi-server/README.md) | AI Agent HTTP 服务 |
| [Knowledge Server](./apps/knowledge-server/README.md) | 知识检索微服务 |
| [LunlunGlass](./examples/lunlunglass/README.md) | 示例应用：眼镜店管理系统 |

---

## 许可证

Banyuan 采用**双重授权**模式：

- **开源版本**：[AGPL-3.0](./LICENSE) —— 适用于个人学习、学术研究、开源项目。
- **商业授权**：[LICENSE-COMMERCIAL](./LICENSE-COMMERCIAL) —— 企业客户可获得闭源使用权。

---

<p align="center">
  <em>虽由人作，宛自天开。</em>
</p>
