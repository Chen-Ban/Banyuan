# ADR-016: BanvasGL 分层拆包——核心层与领域层分离

> 状态：~~已接受~~ **已废弃（2026-05-28）**  
> 日期：2025-07-18  
> 决策者：chenxin176
>
> **废弃原因**：实践中 BanvasGL 作为单一引擎包的内聚性优于物理拆包。FlowViews（NodeView/EdgeView/PortView）与核心 View 体系共享大量基础设施（addon 管线、事件系统、渲染管线、TransactionManager），拆出后会导致频繁的跨包 breaking change 和版本同步负担。当前通过目录隔离（`src/view/FlowViews/`）已足够清晰，无需物理拆包。Flow 执行器（`@banyuan/flow`）的独立拆分是合理的（已完成），但视图层保持在 banvasgl 内。

## 背景

BanvasGL 当前承载了两个独立领域的职责：

- **页面/应用领域**：CombinedView（div 容器）、GraphView、TextView、ImageView、useDesignBanvas、useRuntimeBanvas 等，服务于可视化页面的设计与预览
- **流程编辑领域**：NodeView、PortView、EdgeView、FlowRunner、useFlowBanvas 等，服务于流程图的编辑与执行

ADR-013 已决策将 FlowRunner（纯逻辑执行器）独立为 BanvasFlow 包。ADR-015 决策将 CombinedView div 化，使其走向 CSS Box Model 方向。两个领域的演化方向已经明确分叉：页面领域走样式/布局/响应式，流程领域走执行引擎/状态机/条件分支。

同时，两个领域共享的底层能力（图形基元、数学工具、渲染器、相机、Scene、View 基类）是领域无关的基础设施。

将不同领域的代码放在同一个包中，改动一方时需要担心另一方是否受影响，且越晚拆分，隐式耦合越多、成本越高。当前两个领域的代码边界还很清晰，处于"可以干净切割"的窗口期。

## 决策

将 BanvasGL 拆分为三层：核心层（领域无关的图形基础设施）+ 两个领域层（各自独立演化）。

```
packages/
├── BanvasGL/          # 核心层：Graph、Math、Renderer、Camera、Scene、View、ContainerView
├── BanvasDesign/      # 页面/应用领域（暂定名，待明确）
└── BanvasFlow/        # 流程编辑领域
```

依赖方向：

```
BanvasDesign ──▶ BanvasGL (核心层)
BanvasFlow   ──▶ BanvasGL (核心层)
```

两个领域层之间无依赖，各自独立发版、独立测试。

## 核心层（BanvasGL）包含什么

核心层是纯图形基础设施，不包含任何领域特定的 View 子类：

- Graph 基元体系（Graph、CombinedGraph、RoundedRect、Line、Arc、Bezier、Rectangle 等）
- 数学工具（Matrix、Point3、Bounds、向量运算等）
- Renderer（Canvas 2D 双缓冲渲染管线）
- Camera（视口变换、缩放、平移）
- Scene（场景图管理、事件分发）
- View 抽象基类 + ContainerView 抽象类（可渲染、可交互、可嵌套的画布节点）
- TransactionManager（事务化操作）
- Worker 基础设施（通信协议、调度器）
- Addon 基类（插件机制）

## 流程编辑领域（BanvasFlow）包含什么

- NodeView、PortView、EdgeView
- FlowRunner + NodeExecutorRegistry（ADR-013 已决策）
- useFlowBanvas hook
- 流程编辑相关的交互逻辑（连线拖拽、端口吸附等）
- BoundingBoxAddon 在流程节点上的特化行为

## 页面/应用领域的拆分暂缓明确

页面/应用领域包含设计态（useDesignBanvas）和预览/运行态（useRuntimeBanvas）。预览态本质上是设计态屏蔽了交互细节和编辑状态属性，两者属于同一个大领域，但后续如何演进尚不明确——是否需要进一步拆分设计态和运行态、运行态是否需要更轻量的渲染路径等问题还没有答案。

**当前策略**：先将流程领域干净地拆出去（边界已经很清晰），页面/应用领域暂时留在 BanvasGL 中（或独立为 BanvasDesign 但内部不做进一步拆分），等演化方向明确后再决定内部结构。

## 拆分原则

- **领域边界是拆分的充分理由**，不以代码量为门槛
- **越早拆成本越小**：隐式耦合少、依赖关系清晰、重构范围可控
- **核心层保持领域无关**：任何领域特定的 View 子类、hook、交互逻辑都不应出现在核心层
- **拆分后各包独立构建、独立发版**：通过 pnpm workspace 管理，版本号独立演进

## 替代方案

### 方案 A：包内目录隔离，不做物理拆包

在 BanvasGL 内部用 `src/design/` vs `src/flow/` 目录隔离，共享同一个 package.json 和构建配置。

否决原因：目录隔离是"君子协定"，无法阻止跨领域的隐式引用。物理拆包通过 TypeScript 的模块边界强制隔离，编译期就能发现违规依赖。且独立领域应该有独立的版本号和发布节奏。

### 方案 B：等代码量膨胀后再拆

等到两个领域各自复杂到"不得不拆"时再动手。

否决原因：越晚拆，隐式耦合越多，拆分成本指数增长。当前处于窗口期，两个领域的边界还很干净。

## 后果

- 流程领域获得独立演化空间，不受页面领域改动影响
- 核心层保持稳定和精简，作为两个领域的公共基础
- 页面/应用领域的内部结构留有演进空间，不过早做决定
- 构建配置和 CI 需要适配多包结构（已有 pnpm workspace 基础）
- AGENTS.md 和包间依赖图需要同步更新
