# @banyuan/banvasgl

> BanvasGL —— 以 Canvas 为纸，以代码为笔。

BanvasGL 是 Banyuan 平台**面向声明式 UI 的 2D 图形运行时（含流程控制）**——*A 2D graphics runtime for declarative UI, with built-in flow control*。它提供完整的画布渲染、视图管理、动画系统、FlowSchema 执行和交互机制，是整个低代码平台的图形基础。作为运行时，它只提供机制（原子事件 / 几何变换 / FlowSchema 执行），高层交互策略由上层注入（定位详见 docs/adr/engine/architecture.md A0）。

---

## 它做什么

BanvasGL 解决的问题是：**让同一套渲染逻辑在浏览器和桌面端表现完全一致**。

用 DOM 做跨平台，字体渲染、事件模型、滚动行为在不同平台上都不一样。Canvas 2D 在所有宿主里行为一致，代价是要自己构建场景图、事件系统等基础设施——BanvasGL 就是这套基础设施。

---

## 核心能力

**场景图体系**：App → Scene → View 的树形结构。View 是基本构建单元，支持嵌套、分组、层级管理。容器视图统一为 `CombinedView`，通过 `layoutMode`（`free` / `flex` / `list` / `grid` / `scroll`）切换自动布局策略（`ILayoutStrategy`）——不再存在独立的 FlexView / ListView 等布局容器类型（见 ADR-031）。

**流程引擎（Flow）**：内置的声明式流程执行器。每个 View 通过事件（onClick 等）和生命周期（onCreated/onAttach/onDestroy）绑定 FlowSchema。Push-Pull 混合调度模型——Push 沿 `next` 字段推进控制流，Pull 沿 `DataRef` 递归求值数据依赖。25 种节点（source / compute / control / action / function），前后端通过独立的 preset 工厂（`createClientFlowRunner` / `createServerFlowRunner`）创建 FlowRunner，共享同一套 FlowSchema 格式。

**动画系统**：关键帧动画，支持缓动函数和时间线控制。

**事务化操作**：所有画布修改通过 TransactionManager 执行，天然支持撤销/重做。

**物料系统**：预置组件模板（按钮、输入框、卡片等），支持实例化和序列化。

**序列化**：完整的 JSON 序列化/反序列化，支持版本迁移。

---

## 使用方式

BanvasGL 通过子路径导出提供不同能力：

| 导入路径 | 用途 |
|----------|------|
| `@banyuan/banvasgl` | 核心图形引擎 + Flow 类型（App、Scene、View、FlowSchema、FlowNode 等 25 种 NodeKind） |
| `@banyuan/banvasgl/react` | React Hook 绑定（`useCanvasInit` / `useCanvasCamera`） |
| `@banyuan/banvasgl/flow/client` | 前端 FlowRunner 工厂（`createClientFlowRunner()`） |
| `@banyuan/banvasgl/flow/server` | 后端 FlowRunner 工厂（`createServerFlowRunner()`） |

仅有 4 个导出路径，不存在公开的 `./flow` 子路径——内部组件（FlowRunner 类、NodeExecutor 注册表、各求值器）不对外暴露，只暴露预组装工厂。高层交互识别（点击/拖拽等）不在本包，而在运行策略层 [`@banyuan/banvas-runtime`](../banvas-runtime/README.md)。

Flow 的类型（FlowSchema、FlowNode、FlowSlot、DataRef 等）统一从主入口导出，因为 View.events 的类型就是 FlowSchema，前端消费者天然需要。flow/client 和 flow/server 只提供预组装的 Runner 工厂函数，不暴露内部实现。

---

## 为什么 Flow 内置于 BanvasGL

View 是带有流程控制语义的对象——渲染和交互逻辑天然内聚。Flow 独立为子路径导出而非独立包，是因为后端需要单独使用流程执行能力（`@banyuan/banvasgl/flow/server`），而 tsup 多入口构建保证了物理隔离——引入 flow/server 不会加载图形引擎代码。

---

## 在 Monorepo 中的位置

BanvasGL 是依赖链的最底层，不依赖 monorepo 中的任何其他包。上层所有应用和引擎都依赖它：

```
apps/banyan/frontend       ──▶  @banyuan/banvasgl
apps/banyan/backend        ──▶  @banyuan/banvasgl/flow/server
apps/xiangdi-server        ──▶  @banyuan/banvasgl（类型）
@banyuan/xiangdi-agent     ──▶  @banyuan/banvasgl（optional peer）
@banyuan/banvas-runtime    ──▶  @banyuan/banvasgl（peer，运行策略层）
deploy-agent 产物 (ECS)     ──▶  @banyuan/banvasgl/flow/server（执行云函数）
```

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
