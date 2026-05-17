<p align="center">
  <img src="./assets/banyuan-logo.png" alt="Banyuan Logo" width="120" />
</p>

<h1 align="center">班园 Banyuan</h1>

<p align="center">
  <em>虽由人作，宛自天开 —— 以画布为山石，以组件为草木，以数据为活水，造一方数字园林。</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0%20%2F%20Commercial-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/banvasgl-v0.1.0-green.svg" alt="BanvasGL Version" />
  <img src="https://img.shields.io/badge/xiangdi-v0.1.0-orange.svg" alt="XiangDi Version" />
  <img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/electron-36-47848f.svg" alt="Electron 36" />
</p>

---

**Banyuan（班园）** 是一个低代码可视化应用构建平台。用户通过拖拽或自然语言描述来设计多页面应用，定义数据模型、编排交互逻辑、编写业务函数，最终一键构建为可独立部署的完整应用（前端 + 后端服务器）。

<!-- TODO: 添加截图或 GIF 演示 -->

---

## 为什么要做 Banyuan

现有低代码平台普遍存在一个根本性的割裂：**前端可以拖拽生成，后端还是要自己写**。用户在平台上设计好了界面，一旦涉及数据持久化或业务逻辑，就必须跳出平台、自己搭服务器、自己写 API、自己部署。这使得"让非技术用户也能构建完整应用"的承诺成为空话。

Banyuan 的目标是消除这道墙。数据模型在 UI 上可视化定义，业务逻辑以云函数的形式编写，构建时前端 bundle 和后端服务器壳子一起生成，一键部署得到一个完整可运行的应用。AI 贯穿其中——不只是生成界面，也生成数据模型和业务函数。

---

## 架构设计

Banyuan 由三个独立的核心层构成，每一层都是为了解决一个具体问题而存在。

### BanvasGL —— 为什么自研渲染引擎

市面上的低代码平台大多基于 DOM + CSS 构建画布，这在简单场景下够用，但一旦涉及复杂动画、精确的图形交互（如端口连线、吸附对齐）、或者需要在 Node.js 服务端渲染预览图，DOM 方案就会遇到天花板。

BanvasGL 选择 Canvas 2D 作为渲染底层，自建场景图体系。这带来了几个关键能力：渲染结果与宿主环境无关（浏览器、Electron、Node.js 服务端都能跑同一套代码）；图形命中检测精确到像素级；动画和交互逻辑完全在引擎内部闭环，不依赖 CSS 动画或 DOM 事件冒泡。

引擎对外暴露三个入口，物理隔离：编辑态包含完整的设计器能力，运行态只保留渲染和交互的最小集（不含任何编辑器代码），服务端入口去掉了所有 DOM 依赖。这样运行时产物足够小，服务端渲染不会因为引入 React/DOM 而报错。

### XiangDi —— 为什么 Spec 要内置于引擎

AI 生成界面的核心难题不是"让 LLM 输出 JSON"，而是**如何保证生成结果符合项目约定、如何在生成过程中做校验、如何在出错时回滚**。主流 Agent 框架（LangGraph、CrewAI 等）的核心抽象是图节点或角色，Spec 完全不在其架构层——如果要约束 AI 的行为，需要用户自己在外层套一层，框架本身对此毫无感知。

XiangDi 的选择是把 Spec 内置为引擎的一等公民。每次 AI 执行前，引擎自动加载项目级规范（从 `AGENTS.md` 读取，注入 system prompt），将自然语言规划为类型化的变更计划，然后在执行前做前置守卫、执行后做结果验证。Spec 贯穿规划 → 执行 → 验证全链路，而不是一个外挂的 Markdown 文件。

这个设计的另一个好处是：XiangDi 是一个可嵌入的引擎包，不绑定任何 IDE 或界面，任何宿主（Electron、Web、CLI）都可以集成它。

### 后端能力体系 —— 为什么选择 MongoDB + 云函数

低代码平台的后端能力面临一个两难：SQL 数据库关系模型严格，用户加字段需要 migration，心智负担重；完全 schemaless 又让 AI 生成函数时缺乏上下文，不知道数据长什么样。

Banyuan 的方案是：用 MongoDB 存储用户数据（schemaless，加字段无需 migration），但在平台层维护一份显式的 Schema 定义（用户在 UI 上建表、定义字段类型）。这份 Schema 有两个用途：一是在运行时自动生成 ORM 访问层，让云函数通过 `ctx.db.users.find(...)` 这样的 API 操作数据，不需要写任何数据库代码；二是作为 AI 生成函数时的上下文，让 AI 知道这个应用有哪些数据模型。

云函数是后端逻辑的最小抽象单元——一个函数，明确的输入输出，平台注入数据库访问能力。构建时，所有云函数被打包进一个 Koa 服务器壳子，与前端 bundle 一起输出，用户得到一个可以直接部署的完整应用。

---

## 项目结构

```
Banyuan/
├── packages/
│   ├── BanvasGL/        # 核心 2D 图形引擎（npm 包）
│   └── XiangDi/         # AI Agent 引擎（npm 包）
├── apps/
│   ├── banyan/          # 低代码平台
│   │   ├── frontend/    #   React 编辑器
│   │   ├── backend/     #   Koa + MongoDB API 服务
│   │   └── electron/    #   桌面壳
│   └── xiangdi/         # XiangDi 独立 HTTP 服务
└── examples/
    └── lunlunglass/     # 示例：眼镜店管理系统
```

依赖方向是单向的：应用层依赖引擎层，引擎层不感知应用层的存在。

---

## 快速开始

**前置条件**：Node.js >= 18、pnpm >= 10、MongoDB >= 6.0

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 启动 Banyan 低代码平台
pnpm dev:banyan
```

启动后前端编辑器运行在 `http://localhost:5174`，Electron 桌面窗口会自动打开。

---

## 路线图

- [x] BanvasGL 引擎核心：场景图、渲染、动画、序列化
- [x] BanvasGL 流程引擎（FlowRunner）：可视化交互逻辑编排
- [x] XiangDi AI Agent 引擎：AgentLoop + Spec 体系 + Harness
- [x] Banyan 编辑器：拖拽画布 + 属性面板 + AI 对话
- [ ] 后端能力体系：Schema Builder + 自动 ORM + 云函数 Tab
- [ ] 构建时服务器壳子：前端 bundle + Koa 服务器一键输出
- [ ] AI 生成云函数：自然语言 → 业务函数
- [ ] MVP 发布

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
