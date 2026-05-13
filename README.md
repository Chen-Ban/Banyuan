<p align="center">
  <img src="https://placeholder.com/banyuan-logo.svg" alt="Banyuan Logo" width="120" />
</p>

<h1 align="center">半园 Banyuan</h1>

<p align="center">
  <em>虽由人作，宛自天开 —— 以画布为山石，以组件为草木，以数据为活水，造一方数字园林。</em>
</p>

<p align="center">
  <!-- TODO: Replace with real badges when CI/CD and npm publishing are set up -->
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/banvasgl-v0.1.0-green.svg" alt="BanvasGL Version" />
  <img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/electron-36-47848f.svg" alt="Electron 36" />
</p>

---

**Banyuan（半园）** 是一个以自研 2D 画布引擎为核心的低代码可视化应用设计与生成平台。用户通过拖拽组件、配置属性、编排交互逻辑来设计多页面应用，最终一键构建为跨平台桌面安装包（macOS / Windows / Linux）。

<!-- TODO: 添加截图或 GIF 演示 -->

---

## 核心特性

**BanvasGL 引擎** —— 零外部依赖的自研 2D 图形引擎

- Canvas 2D 双缓冲渲染，支持 DPR 适配
- 丰富的图形基元：线段、圆弧、贝塞尔曲线、多边形、圆角矩形、图片、视频、富文本等
- 完整的场景图体系，支持嵌套视图与分组
- 关键帧动画系统，内置多种缓动函数
- 可视化逻辑引擎（FlowRunner），通过连线编排交互行为，无需编写代码
- 事务化撤销/重做，重计算通过 Web Worker 异步执行
- 吸附对齐、图层管理、序列化/反序列化
- 三入口架构：编辑态 / 服务端 / 运行态物理隔离，运行时产物不含编辑器代码

**Banyan 低代码平台** —— 开箱即用的可视化设计器

- 拖拽式画布编辑器：框选、多选、缩放、旋转、对齐吸附
- 属性 / 样式 / 数据 / 事件四选项卡属性面板
- 内嵌流程图编辑器，可视化编排组件交互事件
- 多页面管理与页面间导航
- 自动保存，一键构建跨平台桌面应用
- 即时预览，零构建在浏览器中查看效果

---

## 架构

```
┌─────────────────────────────────────────────────┐
│           Banyan 低代码平台 / 你的应用             │
│      (React 编辑器 + Koa API + Electron 壳)       │
├─────────────────────────────────────────────────┤
│              React Hook 桥接层                    │
│  useDesignBanvas · useFlowBanvas · useRuntimeBanvas │
├─────────────────────────────────────────────────┤
│              BanvasGL 渲染引擎                     │
│  SceneGraph · Renderer · Animation · FlowRunner   │
│  Serializer · SnapAlign · Math · Workers          │
└─────────────────────────────────────────────────┘
```

BanvasGL 作为独立的 npm 包，通过三个 React Hook 向上层应用暴露能力：`useDesignBanvas`（编辑态）、`useFlowBanvas`（流程编辑态）、`useRuntimeBanvas`（运行态）。上层应用只需消费 Hook 返回的画布元素和操作集，无需关心引擎内部实现。

项目采用 pnpm monorepo 管理，包含核心引擎包、平台服务包、Banyan 低代码平台应用，以及 LunlunGlass 眼镜店管理系统示例。

---

## 项目结构

```
Banyuan/
├── packages/
│   ├── BanvasGL/          # 核心 2D 图形引擎 (npm 包)
│   └── server/            # 平台后端服务 (预览 + 构建)
│
├── apps/
│   └── banyan/            # Banyan 低代码平台
│       ├── frontend/      #   React + Vite + Ant Design
│       ├── backend/       #   Koa + MongoDB
│       └── electron/      #   Electron 桌面壳
│
└── examples/
    └── lunlunglass/       # 示例：眼镜店管理系统
        ├── frontend/
        ├── backend/
        └── electron/
```

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 10
- [MongoDB](https://www.mongodb.com/) >= 6.0

### 安装与启动

```bash
git clone <repository-url> Banyuan
cd Banyuan
pnpm install

# 启动 Banyan 低代码平台
pnpm dev:banyan

# 或启动 LunlunGlass 示例
pnpm dev:lunlunglass
```

启动后，前端编辑器运行在 `http://localhost:5174`（Banyan）或 `http://localhost:5173`（LunlunGlass），Electron 桌面窗口会自动打开。

### 其他命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:banyan` | 启动 Banyan 全栈开发 |
| `pnpm dev:lunlunglass` | 启动 LunlunGlass 全栈开发 |
| `pnpm dev:server` | 启动构建/预览服务 |
| `pnpm build` | 构建 BanvasGL 引擎 |
| `pnpm build:all` | 构建所有子包 |

---

## 使用

### 编辑态 —— 构建你自己的设计器

```tsx
import { useDesignBanvas } from 'banvasgl';

function MyEditor({ pages }) {
  const {
    Banvas,             // 画布 React 元素
    actions,            // 操作集 (view / page / history)
    selectedViewId,     // 当前选中视图
    builtinComponents,  // 内置组件
  } = useDesignBanvas(pages, { width: 800, height: 600 });

  return (
    <div>
      <Sidebar components={builtinComponents} />
      {Banvas}
      <PropertyPanel viewId={selectedViewId} actions={actions} />
    </div>
  );
}
```

### 运行态 —— 渲染已发布的应用

```tsx
import { useRuntimeBanvas } from 'banvasgl/runtime';

function App({ pages }) {
  const { Banvas } = useRuntimeBanvas(pages, { width: 800, height: 600 });
  return <div>{Banvas}</div>;
}
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 渲染引擎 | Canvas 2D · Web Workers · TypeScript |
| 前端 | React 19 · Vite 6 · Ant Design 6 |
| 后端 | Koa 2 · Mongoose 8 · MongoDB |
| 桌面端 | Electron 36 |
| 构建 | tsup · pnpm workspace |

---

## 路线图

<!-- TODO: 根据实际规划补充 -->

- [ ] 单元测试与 CI/CD
- [ ] npm 包发布
- [ ] 更多内置组件
- [ ] 自定义组件 SDK
- [ ] 协同编辑
- [ ] 插件系统

---

## 贡献

<!-- TODO: 添加详细贡献指南 -->

欢迎提交 Issue 和 Pull Request。

---

## 许可证

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)

---

<p align="center">
  <em>虽由人作，宛自天开。</em>
</p>
