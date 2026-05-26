<p align="center">
  <img src="./assets/banyuan-logo.png" alt="Banyuan Logo" width="120" />
</p>

<h1 align="center">班园 Banyuan</h1>

<p align="center">
  <em>虽由人作，宛自天开 —— 以画布为山石，以组件为草木，以数据为活水，以 AI 为匠心，造一方数字园林。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2F%20Commercial-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/@banyuan/banvasgl-v0.1.0-green.svg" alt="BanvasGL Version" />
  <img src="https://img.shields.io/badge/@banyuan/xiangdi--agent-v0.1.0-orange.svg" alt="XiangDi Version" />
  <img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/electron-36-47848f.svg" alt="Electron 36" />
</p>

---

**Banyuan（班园）** 是一个低代码可视化应用构建平台。用户通过拖拽或自然语言描述来设计多页面应用，定义数据模型、编排交互逻辑、编写云函数，最终一键构建为可独立部署的完整应用（前端 + 后端服务器 + 桌面安装包）。

<!-- TODO: 添加截图或 GIF 演示 -->

---

## 模块概览

Banyuan 是一个 pnpm monorepo，由引擎层、SDK 层和应用层组成。依赖方向严格单向向下：应用层 → SDK 层 → 引擎层。引擎层不感知上层的存在，禁止循环依赖。

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              应用层 (apps/)                                      │
│                                                                                 │
│   ┌────────────────────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│   │  Banyan 低代码平台          │  │  XiangDi     │  │  Knowledge 知识服务    │   │
│   │  frontend(:5174)           │  │  Server      │  │  LanceDB + BM25      │   │
│   │  backend(:3001)            │  │  (:3002)     │  │  (:3003)             │   │
│   │  electron(桌面)             │  │  AI Agent    │  │  混合检索 + 精排       │   │
│   └────────────┬───────────────┘  └───────┬──────┘  └───────────────────────┘   │
│                │                          │                                      │
├────────────────┼──────────────────────────┼──────────────────────────────────────┤
│                ▼                          ▼                                      │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                    @banyuan/banyan-sdk（聚合 SDK）                         │   │
│   │  banvas-design · banvas-runtime-web · flow-design · banvasgl · flow      │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
│                │                                                                 │
│   ┌────────────┼────────────────────────────────────────────────────────────┐    │
│   │            ▼              引擎层 (packages/)                             │    │
│   │                                                                         │    │
│   │   ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │    │
│   │   │ @banyuan/       │  │ @banyuan/flow    │  │ @banyuan/            │  │    │
│   │   │ banvasgl        │  │ 声明式流程执行器   │  │ xiangdi-agent        │  │    │
│   │   │ 2D 图形引擎     │  │                  │  │ AI Agent 引擎         │  │    │
│   │   └─────────────────┘  └──────────────────┘  └──────────────────────┘  │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### BanvasGL —— 自研 2D 图形引擎（`@banyuan/banvasgl`）

零外部依赖的 Canvas 2D 渲染引擎，是整个平台的图形基础。五层内部架构：engine（App/Scene/Renderer/Camera/TransactionManager）、view（View 基类 + 容器视图 + FlexView 弹性布局）、graph（图形基元）、foundation（数学/样式基础）、types（纯接口契约）。

核心能力包括：完整的场景图体系（嵌套视图、分组、层级管理）、ViewRegistry 可扩展视图注册、关键帧动画系统、可注入的 SchemaRunner 抽象（用于流程逻辑执行）、事务化撤销/重做（TransactionManager + OperationStack）、FlexView 弹性布局容器、Addon 能力管线（BoundingBox/BoxDecoration/Vertex/Animation/TextSelection）、以及完整的序列化/反序列化。

引擎采用单入口设计（`src/index.ts`），仅导出核心图形能力。编辑态、运行态、流程图编辑器已拆分为独立包。

### Flow —— 声明式流程引擎（`@banyuan/flow`）

独立的声明式 FlowSchema 执行器，以节点图（nodes + edges）驱动。前后端执行器分离：`@banyuan/flow/client` 提供 animate、navigate、setData、setVisible 等前端节点；`@banyuan/flow/server` 提供 dbQuery、dbInsert、httpRequest、script、transform 等后端节点。通过 `createServerFlowRunner()` + `ServerFlowContext` 注入 db 和 httpClient 能力。

### XiangDi —— AI Agent 引擎（`@banyuan/xiangdi-agent`）

驱动 AI 生成能力的 Agent 引擎。执行模式为 LangGraph StateGraph（MasterGraph V2）：`START → spec → think → tools → extractPreferences → END`。核心架构：

- 信息三层：ProjectSpec（全局约束，管线注入）+ KnowledgeStore（按需知识，Tool 模式）+ 工具调用（实时状态）
- Spec 体系：SpecPlanner 规划 → HarnessRunner 执行 → Guard/Checkpoint 验证
- 工具协议：BanvasToolProtocol + ToolRegistry，Tool Handler 签名 `(input: TInput) => Promise<TOutput>`
- LLM 客户端：LLMClient 接口，DeepSeek（主）+ Kimi（备），LLMRouter 做健康检测
- 记忆层：LocalEpisodicMemory（中期经验）+ LocalSemanticMemory（长期事实）
- 冲突检测：ConflictDetector + DisambiguationHandler
- AISchema ↔ BanvasGL 双向转换层，LLM 输出直接映射为画布操作

### 编辑态 / 运行态分层包

| 包 | 职责 |
|---|---|
| `@banyuan/banvas-design` | 编辑态 React 绑定：`useDesignBanvas` Hook、交互分发（InteractionDispatcher）、Worker 管理（快照 Diff/文本排版）、AppTree/PropertyPanel 等 UI 组件 |
| `@banyuan/banvas-runtime` | 运行态统一接口层：平台无关的运行态契约定义 |
| `@banyuan/banvas-runtime-web` | 运行态 Web 平台适配：`useRuntimeBanvas` / `useCanvasInit` / `useRuntimeEvents` |
| `@banyuan/flow-design` | 流程图编辑器：`useFlowBanvas` Hook、NodeView/EdgeView/PortView 视图、FlowEditorModal |
| `@banyuan/banyan-sdk` | 伞包，聚合所有子包统一导出 |

### Banyan —— 低代码平台应用

基于上述引擎构建的完整低代码平台，包含三个子应用：

- **frontend**（React 19 + Vite + Ant Design 6，:5174）：拖拽画布编辑器、属性面板、AI 对话栏、数据库 Schema 设计器、云函数流程编辑器
- **backend**（Koa + MongoDB/Mongoose，:3001）：应用 CRUD、动态 ORM（SchemaService + OrmService，集合名 `app_{appId}_{collectionName}`）、云函数管理、AI 请求代理（SSE 10 步代理）、构建/预览任务
- **electron**（Electron 36）：跨平台桌面壳，构建为可分发的安装包

### 知识服务（Knowledge Server）

独立知识微服务（:3003），为 XiangDi AI Agent 提供知识检索能力：LanceDB 向量存储 + BM25 文本检索 + Cross-Encoder 精排，按 BanvasGL 版本隔离知识表。ONNX Runtime 本地推理 Embedding，不依赖外部 Embedding API。

---

## 运行时服务架构

```
前端(:5174) ←── Vite proxy /api ──▶ Banyan 后端(:3001)
                                          │
                                          │ HTTP SSE 代理
                                          ▼
                                   XiangDi 服务(:3002) ──▶ 知识服务(:3003)
                                   apps/xiangdi-server      apps/knowledge-server
```

- **Banyan 后端**：负责 MongoDB 持久化、应用 CRUD、构建/预览任务、AI 请求代理
- **XiangDi 服务**：无状态 AI Agent 服务（MasterGraph V2），pages 随请求传入/随 done 事件返回，不访问 MongoDB
- **知识服务**：独立知识微服务，按 BanvasGL 版本隔离，不依赖业务数据库
- **AI 请求流程**：前端 → Banyan 后端（读 pages from MongoDB）→ XiangDi 服务（执行）→ Banyan 后端（写 pages to MongoDB）→ 前端

---

## 项目结构

```
Banyuan/
├── packages/
│   ├── banvasgl/            # 核心 2D 图形引擎 (@banyuan/banvasgl)
│   ├── banvas-design/       # 编辑态 React 绑定 (@banyuan/banvas-design)
│   ├── banvas-runtime/      # 运行态统一接口层 (@banyuan/banvas-runtime)
│   ├── banvas-runtime-web/  # 运行态 Web 平台适配 (@banyuan/banvas-runtime-web)
│   ├── flow/                # 声明式流程执行器 (@banyuan/flow)
│   ├── flow-design/         # 流程图编辑器 (@banyuan/flow-design)
│   ├── xiangdi-agent/       # AI Agent 引擎 (@banyuan/xiangdi-agent)
│   └── banyan-sdk/          # 伞包 SDK (@banyuan/banyan-sdk)
├── apps/
│   ├── banyan/              # 低代码平台应用
│   │   ├── frontend/        #   React 19 + Vite + Ant Design 6 (:5174)
│   │   ├── backend/         #   Koa + MongoDB (:3001)
│   │   └── electron/        #   Electron 36 桌面壳
│   ├── xiangdi-server/      # XiangDi AI Agent 独立 HTTP 服务 (:3002)
│   └── knowledge-server/    # 知识微服务：向量检索 + BM25 + 精排 (:3003)
├── examples/
│   └── lunlunglass/         # 示例：眼镜店管理系统
│       ├── shared/printer/  #   共享打印库 (@lunlunglass/printer)
│       ├── studio/          #   Template Studio（模板设计系统）
│       └── pos/             #   Store POS（门店运营系统）
└── docs/
    ├── business.md          # 业务上下文
    ├── pitfalls.md          # 踩坑记录
    ├── adr/                 # 架构决策记录（ADR-001 ~ ADR-024）
    └── todos/               # 实现计划
```

### 包间依赖方向

```
@banyuan/flow (独立，无 workspace 依赖)
    ↑
@banyuan/banvasgl (依赖 flow)
    ↑
@banyuan/banvas-runtime (peerDep: banvasgl)
@banyuan/banvas-runtime-web (peerDep: banvasgl + banvas-runtime)
@banyuan/banvas-design (peerDep: banvasgl + banvas-runtime-web)
@banyuan/flow-design (peerDep: banvasgl + banvas-runtime-web + flow)
    ↑
@banyuan/banyan-sdk (聚合以上全部)
@banyuan/xiangdi-agent (optional peerDep: banvasgl)
    ↑
apps/banyan/frontend (依赖 banyan-sdk)
apps/banyan/backend (依赖 flow)
apps/xiangdi-server (依赖 xiangdi-agent + banvasgl)
apps/knowledge-server (依赖 banvasgl，仅读取 version 做表名隔离)
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript (strict) | ~5.7 |
| 包管理 | pnpm workspace | 10.10 |
| 引擎构建 | tsup | ^8.4 |
| 前端框架 | React | ^19.0 |
| 前端构建 | Vite | ^6.3 |
| UI 组件 | Ant Design | ^6.0 |
| 后端框架 | Koa | ^2.15 |
| 数据库 | MongoDB (mongoose) | ^8.7 |
| 向量存储 | LanceDB | — |
| 桌面 | Electron | ^36.1 |
| Schema 验证 | Zod | ^3.23 |
| AI Graph | LangGraph (StateGraph) | — |
| 运行时 target | ES2020 | — |
| 模块系统 | ESNext (ESM + CJS 双出) | — |

---

## 为什么这样设计

### BanvasGL：为了跨平台，渲染层必须与宿主解耦

Banyuan 的目标之一是让同一份应用能跑在浏览器、Electron 桌面、将来可能的移动端和小程序。DOM 是浏览器的产物，字体渲染、事件模型、滚动行为在不同平台上表现不一致，用 DOM 做跨平台注定要持续踩坑。Canvas 2D 在所有这些宿主里行为一致，是唯一能真正做到"一套渲染逻辑，多端运行"的底层。自研引擎的代价是要自己建场景图、事件系统这些基础设施，但换来的是渲染行为完全可控、跨平台路径清晰。

### 分层拆包：编辑态 / 运行态 / 流程图必须物理隔离

一个低代码平台的运行态产物不应包含编辑器代码——编辑器有 Worker 管理、交互分发、组件物料等重逻辑，全塞进运行态 bundle 会让产物体积膨胀数倍。通过将 BanvasGL 拆为核心引擎 + 编辑态绑定 + 运行态绑定 + 流程图编辑器，每个消费方只引入自己需要的部分，构建时自动 tree-shake。

### XiangDi：AI 生成的目标是有约束的结构，不是自由文本

直接调 LLM API 或套现有框架，对于生成自由文本（文章、代码片段）是够用的。但 Banyuan 的 AI 生成目标是一个有严格数据结构约束的画布——LLM 的输出必须能精确映射为画布操作，必须在执行前对齐意图、执行后验证结果。这种"约束驱动的生成"在现有框架里没有原生支持。XiangDi 把约束（Spec）和校验（Harness）内置为引擎的一等公民，是为了让这套机制对所有接入方都开箱即用。

### 后端能力体系：低代码平台的承诺不应该在后端断掉

现有低代码平台的天花板几乎都在同一个地方：前端能拖拽生成，后端还是要自己写。Banyuan 做后端能力体系（动态 ORM + Schema Builder + 云函数 + 声明式 Flow 执行器），是为了让平台的能力边界延伸到完整可部署的应用，让用户无需离开平台即可完成数据层和逻辑层搭建。

### 知识服务独立部署：AI 的检索能力不应与业务耦合

知识服务（knowledge-server）独立于 XiangDi 服务和 Banyan 后端，只操作 LanceDB 向量存储，不接触 MongoDB 业务数据。按 BanvasGL 版本隔离知识表，使得引擎升级时知识库可以平滑迁移。ONNX 本地推理避免了对外部 Embedding API 的依赖，降低延迟和成本。

---

## 快速开始

**前置条件**：Node.js >= 20、pnpm >= 10、MongoDB >= 6.0、DeepSeek API Key

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 配置 AI API Key（在 apps/xiangdi-server/ 下创建 apiKey.json）
echo '{ "apiKey": "sk-your-deepseek-key" }' > apps/xiangdi-server/src/apiKey.json
```

### 启动命令

根目录提供两个开发启动命令，分别对应两个应用场景：

```bash
# 启动 Banyan 低代码平台（含 AI 能力）
pnpm dev:banyan

# 启动 LunlunGlass 示例应用
pnpm dev:lunlunglass
```

### dev:banyan 启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| @banyuan/flow | — | tsup watch，流程引擎代码变更自动重编译 |
| @banyuan/banvasgl | — | tsup watch，图形引擎代码变更自动重编译 |
| @banyuan/banvas-runtime | — | tsup watch |
| @banyuan/banvas-runtime-web | — | tsup watch |
| @banyuan/banvas-design | — | tsup watch |
| @banyuan/banyan-sdk | — | tsup watch |
| @banyuan/xiangdi-agent | — | tsup watch，AI 引擎代码变更自动重编译 |
| XiangDi 服务 | :3002 | 无状态 AI Agent HTTP 服务 |
| Knowledge 服务 | :3003 | 知识检索微服务 |
| Banyan | :5174 / :3001 | 前端(Vite) + 后端(Koa) |

### dev:lunlunglass 启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| @banyuan/flow | — | tsup watch |
| @banyuan/banvasgl | — | tsup watch |
| LunlunGlass | :5173 | 示例应用（Vite） |

---

## Banyan 前端页面结构

Banyan 前端基于 React 19 + react-router-dom，采用 Layout + Page 分层：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | HomePage | 首页（创建/打开应用入口） |
| `/applications` | ApplicationListPage | 应用列表 |
| `/application/:id` | UIPage | 画布编辑器（AppTree + 组件物料 + 画布 + 属性抽屉 + AI 对话） |
| `/application/:id/database` | DatabasePage | 数据库 Schema 设计器 |
| `/application/:id/functions` | FunctionsPage | 云函数流程编辑器 |

顶部 ApplicationLayout 提供应用级操作（保存、构建、Tab 导航），子页面通过 `AppLayoutCtx` 与 Layout 共享状态（appName、getPages 注册等）。

---

## 路线图

- [x] BanvasGL 引擎核心：场景图、渲染、动画、序列化
- [x] BanvasGL FlexView 弹性布局容器
- [x] BanvasGL 分层拆包：核心/编辑态/运行态/流程图物理隔离
- [x] BanvasGL ViewRegistry + SchemaRunner + Addon 管线
- [x] Flow 引擎：声明式节点图执行器（前后端分离）
- [x] XiangDi AI Agent 引擎：MasterGraph V2 + Spec 体系 + Harness
- [x] XiangDi 多 LLM 支持：DeepSeek + Kimi + LLMRouter
- [x] XiangDi 知识检索：独立知识服务 + 混合检索 + 精排
- [x] Banyan 编辑器：拖拽画布 + 属性面板 + AI 对话
- [x] Banyan 后端 Phase 1：Schema Builder + 动态 ORM
- [x] Banyan 后端 Phase 2：云函数 Tab + Flow 执行器集成
- [x] Banyan 应用构建：Electron 打包 + 跨平台桌面安装包
- [ ] AI 生成云函数：自然语言 → 业务函数
- [ ] 实时协同编辑
- [ ] 多租户 SaaS 部署
- [ ] MVP 发布

---

## 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| BanvasGL | [packages/banvasgl/README.md](./packages/banvasgl/README.md) | 核心 2D 图形引擎详细文档 |
| XiangDi Agent | [packages/xiangdi-agent/README.md](./packages/xiangdi-agent/README.md) | AI Agent 引擎详细文档 |
| XiangDi Server | [apps/xiangdi-server/README.md](./apps/xiangdi-server/README.md) | AI Agent 独立 HTTP 服务 |
| Knowledge Server | [apps/knowledge-server/README.md](./apps/knowledge-server/README.md) | 知识微服务 |
| Banyan | [apps/banyan/README.md](./apps/banyan/README.md) | 低代码平台（frontend + backend + electron） |
| LunlunGlass | [examples/lunlunglass/README.md](./examples/lunlunglass/README.md) | 示例应用：眼镜店管理系统 |
| 业务上下文 | [docs/business.md](./docs/business.md) | 产品逻辑、用户故事、功能边界 |
| 踩坑记录 | [docs/pitfalls.md](./docs/pitfalls.md) | 已知陷阱与规避方式 |
| 架构决策记录 | [docs/adr/](./docs/adr/) | 关键设计决策的背景与权衡（ADR-001 ~ ADR-024） |

---

## 许可证

Banyuan 采用**双重授权**模式：

- **开源版本**：[AGPL-3.0](./LICENSE) —— 适用于个人学习、学术研究、开源项目。
- **商业授权**：[LICENSE-COMMERCIAL](./LICENSE-COMMERCIAL) —— 企业客户可获得闭源使用权，无需开源自身代码。

如有商业授权需求，请联系：[TODO: your-email@example.com]

---

<p align="center">
  <em>虽由人作，宛自天开。</em>
</p>
