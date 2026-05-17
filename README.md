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

## 模块概览

Banyuan 是一个 monorepo，由三个相互独立的核心模块组成，依赖方向单向向下：应用层依赖引擎层，引擎层不感知应用层的存在。

```
┌─────────────────────────────────────────────────────────────┐
│                    Banyan 低代码平台                          │
│                                                             │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│   │  React 编辑器 │  │  Koa API 服务 │  │  Electron 桌面壳  │  │
│   │  拖拽 · AI   │  │  MongoDB     │  │  构建 · 打包      │  │
│   └──────┬──────┘  └──────┬───────┘  └──────────────────┘  │
│          │                │                                 │
├──────────┼────────────────┼─────────────────────────────────┤
│          ▼                ▼                                 │
│   ┌─────────────┐  ┌──────────────────────────────────────┐ │
│   │  BanvasGL   │  │           XiangDi                    │ │
│   │  2D 渲染引擎  │  │         AI Agent 引擎                │ │
│   └─────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### BanvasGL —— 自研 2D 图形引擎

零外部依赖的 Canvas 2D 渲染引擎，是整个平台的图形基础。核心能力包括：完整的场景图体系（嵌套视图、分组、层级管理）、关键帧动画系统、可视化流程执行引擎（FlowRunner，用于编排组件交互逻辑）、事务化撤销/重做、以及序列化/反序列化。

引擎对外暴露三个物理隔离的入口：编辑态（完整设计器能力）、运行态（最小渲染集，不含编辑器代码）、服务端（去掉 DOM 依赖，可在 Node.js 中运行）。

→ 详见 [BanvasGL README](./packages/BanvasGL/README.md)

### XiangDi —— AI Agent 引擎

驱动 AI 生成能力的 Agent 引擎，以独立 npm 包的形式存在，可被任何宿主集成。核心是一个 Spec 驱动的 Plan-and-Execute 架构：SpecPlanner 将自然语言规划为类型化的变更计划，AgentLoop 按计划驱动工具调用，Harness 层在关键节点提供前置守卫、后置验证和人工确认。

引擎内置 AISchema ↔ BanvasGL 双向转换层，LLM 的输出可以直接映射为画布操作。

→ 详见 [XiangDi README](./packages/XiangDi/README.md)

### Banyan —— 低代码平台应用

基于 BanvasGL 和 XiangDi 构建的完整低代码平台，包含三个子应用：React 编辑器（拖拽画布 + 属性面板 + AI 对话）、Koa 后端服务（应用管理、构建任务、AI 代理、数据 API）、Electron 桌面壳（跨平台打包）。

后端能力体系（Schema Builder + 自动 ORM + 云函数）正在建设中，目标是让用户无需离开平台即可完成完整应用的数据层和逻辑层搭建。

→ 详见 [Banyan README](./apps/banyan/README.md)

---

## 为什么这样设计

### 为什么自研渲染引擎，而不用 DOM + CSS

市面上的低代码平台大多基于 DOM + CSS 构建画布。这在简单场景下够用，但有几个问题难以绕开：复杂动画和精确图形交互（如端口连线、像素级吸附对齐）在 DOM 上实现成本很高；服务端渲染预览图需要引入 headless browser，重且慢；运行时产物因为要带着编辑器的 DOM 操作逻辑，很难做到真正的精简。

Canvas 2D 方案让渲染逻辑与宿主环境解耦——同一套引擎代码可以跑在浏览器、Electron、Node.js 服务端，图形命中检测精确到像素，动画和交互在引擎内部闭环。代价是需要自己实现场景图、事件系统、文本排版等基础设施，但这些一旦建好，上层能力的扩展就非常稳定。

### 为什么自研 Agent 引擎，而不用 LangGraph / CrewAI

主流 Agent 框架的核心抽象是图节点（LangGraph）或角色（CrewAI），它们解决的是"如何编排多个 LLM 调用"的问题。但 Banyuan 面临的核心问题不是编排，而是**约束**：AI 生成的结果必须符合画布的数据结构约定，必须在执行前验证意图、执行后验证结果，必须在出错时能够回滚。这些需求在现有框架里都是用户自己在外层实现的，框架本身对此毫无感知。

XiangDi 把 Spec 内置为引擎的一等公民数据结构，而不是一个外挂的 Markdown 文件。项目级规范自动注入每次执行的 system prompt，变更计划在执行前经过类型化规划，Guard/Checkpoint 直接读取 Spec 字段做校验。这让 AI 的行为从一开始就在约束之内，而不是生成完了再做后处理。

另一个考量是可嵌入性。XiangDi 是一个库，不是一个平台，任何宿主都可以集成它，Spec 是强类型的数据结构而不是松散的配置文件。

### 为什么后端选择 MongoDB + 云函数，而不是 SQL + 传统服务

低代码平台的后端能力有一个两难：SQL 的关系模型对用户来说太重——加一个字段要写 migration，改个表结构要停服，这对"随时调整"的低代码使用习惯非常不友好。但完全 schemaless 又让 AI 生成函数时缺乏上下文，不知道数据长什么样。

Banyuan 的方案是把"存储层"和"描述层"分开：MongoDB 负责存储（schemaless，加字段无需 migration），平台层维护一份显式的 Schema 定义（用户在 UI 上建表定义字段）。这份 Schema 在运行时自动生成 ORM 访问层，让云函数通过 `ctx.db.users.find(...)` 操作数据；同时作为 AI 生成函数的上下文，让 AI 知道这个应用的数据模型。

云函数是后端逻辑的最小抽象单元，比"传统服务"轻得多——用户只需要关心输入输出和业务逻辑，数据库连接、路由注册、错误处理都由平台负责。构建时所有云函数打包进一个 Koa 服务器壳子，与前端 bundle 一起输出，用户得到一个可以直接部署的完整应用。

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
