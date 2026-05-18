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

### BanvasGL：为了跨平台，渲染层必须与宿主解耦

Banyuan 的目标之一是让同一份应用能跑在浏览器、Electron 桌面、将来可能的移动端和小程序。DOM 是浏览器的产物，字体渲染、事件模型、滚动行为在不同平台上表现不一致，用 DOM 做跨平台注定要持续踩坑。Canvas 2D 在所有这些宿主里行为一致，是唯一能真正做到"一套渲染逻辑，多端运行"的底层。自研引擎的代价是要自己建场景图、事件系统这些基础设施，但换来的是渲染行为完全可控、跨平台路径清晰。

### XiangDi：AI 生成的目标是有约束的结构，不是自由文本

直接调 LLM API 或套现有框架，对于生成自由文本（文章、代码片段）是够用的。但 Banyuan 的 AI 生成目标是一个有严格数据结构约束的画布——LLM 的输出必须能精确映射为画布操作，必须在执行前对齐意图、执行后验证结果。这种"约束驱动的生成"在现有框架里没有原生支持，用户需要自己在外层实现，反而更复杂。XiangDi 把约束（Spec）和校验（Harness）内置为引擎的一等公民，是为了让这套机制对所有接入方都开箱即用，而不是每次都重新发明。

### 后端能力体系：低代码平台的承诺不应该在后端断掉

现有低代码平台的天花板几乎都在同一个地方：前端能拖拽生成，后端还是要自己写。用户设计好了界面，一旦需要数据持久化或业务逻辑，就必须跳出平台自己搭服务器。这让平台的实际价值大打折扣——它生成的只是一个界面原型，不是一个可以交付的应用。Banyuan 做后端能力体系，是为了让平台的能力边界延伸到完整可部署的应用，把这道墙彻底拆掉。

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

**前置条件**：Node.js >= 20、pnpm >= 10、MongoDB >= 6.0、DeepSeek API Key

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 配置 AI API Key（在 apps/xiangdi/ 下创建 apiKey.json）
echo '{ "apiKey": "sk-your-deepseek-key" }' > apps/xiangdi/apiKey.json
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
| BanvasGL | — | tsup watch，引擎代码变更自动重编译 |
| XiangDi 引擎 | — | tsup watch，AI 引擎代码变更自动重编译 |
| XiangDi 服务 | :3002 | 无状态 AI Agent HTTP 服务 |
| Banyan 前端 | :5174 | React 编辑器（Vite） |
| Banyan 后端 | :3001 | Koa API + MongoDB 持久化 |
| Electron | — | 桌面窗口自动打开 |

### dev:lunlunglass 启动的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| BanvasGL | — | tsup watch，引擎代码变更自动重编译 |
| LunlunGlass | :5173 | 示例应用（Vite） |

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
