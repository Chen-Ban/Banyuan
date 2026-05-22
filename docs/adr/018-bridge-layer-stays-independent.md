# ADR-018: banvas-design / flow-design 保持独立包，不移入应用层

> 状态：已接受
> 日期：2025-05-21
> 决策者：chenxin176

## 背景

`@banyuan/banvas-design` 和 `@banyuan/flow-design` 当前作为独立包存在于 `packages/` 目录下。它们封装了设计态的 React hook（useDesignBanvas、useFlowBanvas）、画布交互调度、Web Worker 管理、视图创建策略，以及一系列 UI 组件（PropertyPanel、PageList、FlowContextMenu 等）。

这两个包的唯一消费者是 banyan 前端（通过 banyan-sdk 伞包中转）。它们依赖 antd、react 等宿主环境库作为 peerDep。从表象看，它们像是「banyan 的业务组件」，自然会产生一个疑问：既然只有 banyan 用，为什么不直接移入 `apps/banyan/frontend/src/hooks/` 下，减少包数量和构建环节？

经过分析，这两个包的真实定位需要从两个维度理解：它们既是引擎的设计态绑定层，更是低代码平台的两块核心基石能力。

## 决策

banvas-design 和 flow-design **保持为独立包**，不移入 banyan 应用层。

## 核心定位：低代码平台的基石能力

Banyan 是一个零代码 + AI 的设计平台，它的核心能力由三根支柱构成：

- **页面设计**（banvas-design）：拖拽式可视化页面编辑，所见即所得
- **流程设计**（flow-design）：可视化流程/逻辑编排，驱动应用行为
- **AI 赋能**（XiangDi）：自然语言生成和修改页面与流程

三者同等重要，各自有独立的复杂度、独立的演进方向、独立的故障域。页面设计走样式/布局/响应式/组件体系方向，流程设计走执行引擎/状态机/条件分支/AST 转换方向，AI 走 Agent Loop/Spec 规划/工具协议方向。将它们作为独立包管理，本质上是对核心能力的风险隔离——改动一根支柱时，不会波及另外两根。

## 跨平台的正确边界

一个关键认知：**需要跨平台的是 Banyan 构建出的应用，而不是 Banyan 设计工具本身。**

```
Banyan（设计工具）              →  永远是 Electron + React，不跨平台
     │ 构建
     ▼
产出的应用（需要跨平台）        →  iOS / Android / Desktop / Web
     │ 渲染                         │ 逻辑执行
     ▼                              ▼
banvasgl 平台无关画布            flow → AST → 目标平台代码
适配层在运行态                   适配层在编译态
```

跨平台适配发生在两个地方：banvasgl 的运行态渲染（为不同平台提供 canvas 绑定）和 flow 的编译转换（将流程 schema 转为目标平台可执行的代码）。而 banvas-design / flow-design 服务的是 Banyan 编辑器——它就是 Electron 套壳的 React 应用，不存在 Qt 或其他平台的需求。

因此，banvas-design 和 flow-design **就是 React 实现**，不需要为「平台桥接」预留抽象。它们的独立性来源于职责分层和能力隔离，而非平台适配。

## 为什么不移入应用层

**1. 核心能力应独立演进。** 页面设计和流程设计各自是一个复杂子系统，有独立的架构决策（ADR-015 div 化、ADR-016 分层拆包）、独立的迭代节奏。作为独立包可以独立发版、独立测试、独立 review，降低变更的影响半径。

**2. 引擎级逻辑不是业务组件。** 这两个包包含 InteractionDispatcher（交互状态机）、WorkerManager（Worker 生命周期）、viewCreatorStrategies（视图工厂策略）、NodeView/PortView/EdgeView（流程视图类）等引擎级机制。放在应用层的 `hooks/` 或 `components/` 下会混淆架构层次，暗示这些是「可随意修改的 UI 逻辑」。

**3. 构建隔离防止耦合蔓延。** 独立包通过 TypeScript 模块边界强制隔离。应用层只能通过公共 API 消费这两个包，不能旁路引用内部模块。这保证了核心能力的内聚性，避免应用层业务逻辑渗透进引擎机制。

**4. 故障隔离。** 页面设计出 bug 时，流程设计不受影响，反之亦然。独立包意味着独立的构建产物、独立的类型检查。一个包的类型错误不会阻塞另一个包的开发。

**5. Worker 入口需要独立产物。** banvas-design 有 `./worker` 子入口，输出 Web Worker 脚本。独立包构建 Worker 产物的方式清晰、可控。

## banvas-runtime：构建产物的渲染核心，风险最高的包

在整个体系中，banvas-runtime 的角色与 banvas-design / flow-design 截然不同。后两者影响的是设计体验——出 bug 时设计师的操作受阻，但不影响已发布的应用。banvas-runtime 则直接决定了**所有已构建应用的运行表现**——它是构建产物的渲染引擎，面向的是终端用户。

风险差异：

- banvas-design 出 bug → 设计器内某个交互异常，影响设计师，可热修复
- flow-design 出 bug → 流程编辑器内某个操作失败，影响设计师，可热修复
- **banvas-runtime 出 bug → 所有已构建的应用渲染异常或崩溃，影响全量终端用户，已分发的安装包无法热修复**

banvas-runtime 是跨平台渲染的落地点。未来当 Banyan 支持构建 iOS/Android/多平台桌面应用时，banvas-runtime 需要为每个目标平台提供对应的 canvas 绑定实现。它的正确性直接关系到构建结果是否符合设计稿预期——颜色、布局、字体、动画、事件响应，任何一处偏差都是面向用户的 bug。

因此 banvas-runtime 在工程实践上应该有更高的质量门槛：更严格的类型约束、更完备的测试覆盖（尤其是跨平台渲染一致性测试）、更谨慎的发版节奏。它虽然在分层图中与引擎核心层同级，但其风险权重是所有包中最高的。

## 当前分层全景

```
┌──────────────────────────────────────────────────────┐
│  应用层  apps/banyan (frontend + backend + electron)  │
│  消费 banyan-sdk 伞包的公共 API                       │
│  Electron + React，不跨平台                           │
├──────────────────────────────────────────────────────┤
│  核心能力层（三根支柱，独立演进）                       │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐     │
│  │banvas-design│ │flow-design │ │  XiangDi     │     │
│  │ 页面设计    │ │ 流程设计    │ │  AI 赋能     │     │
│  └────────────┘ └────────────┘ └──────────────┘     │
├──────────────────────────────────────────────────────┤
│  引擎核心层（平台无关，时态无关）                       │
│  banvasgl（图形引擎）  flow（流程引擎）                 │
│  banvas-runtime（运行态渲染）                          │
└──────────────────────────────────────────────────────┘

         ↓ 构建时，引擎核心层的产物适配各目标平台 ↓

┌──────────────────────────────────────────────────────┐
│  目标平台运行态                                        │
│  banvasgl → 各平台 canvas 绑定                        │
│  flow → AST → Swift / Kotlin / JS / Dart             │
└──────────────────────────────────────────────────────┘
```

## 替代方案

### 方案 A：移入 apps/banyan/frontend/src/hooks/

将 banvas-design 和 flow-design 的代码合并到前端应用的 hooks 目录下，消除独立包的构建开销。

否决原因：hooks 目录暗示「轻量 React 封装」，与包内引擎级逻辑（状态机、Worker、视图类）不匹配。更重要的是，将核心能力内嵌于应用层，丧失了独立演进和故障隔离的优势。

### 方案 B：移入 apps/banyan/frontend/src/engine/

在前端应用内创建 engine/ 目录存放代码，语义比 hooks/ 更清晰。

否决原因：虽然语义稍好，但丧失了物理包边界带来的隔离保证。应用代码可以 bypass 公共 API 直接引用内部模块，长期会导致耦合蔓延。且 Worker 产物的构建在应用内部配置更复杂。

### 方案 C：合并 banvas-design 和 flow-design 为一个包

将两者合并为 `@banyuan/design-bindngs`，减少包数量。

否决原因：页面设计和流程设计是两个独立领域（ADR-016），演化节奏不同，故障域不同。合并会导致一方的变更影响另一方的构建和发版。保持分离是核心能力独立管理原则的体现。

## 后果

- 页面设计和流程设计作为低代码平台的核心基石，继续以独立包的形式管理和演进
- 每个核心能力有独立的版本号、独立的构建验证、独立的故障域
- 跨平台适配明确发生在构建产物的运行态层面（banvasgl canvas 绑定 + flow AST 转换），而非设计工具层面
- banvas-design / flow-design 明确定位为 React 实现，不做平台抽象，减少过度设计
- 开发时各包通过 tsup watch 实时增量构建，配合 Vite HMR 形成顺畅的开发链路，无额外配置负担
- banyan-sdk 伞包继续作为应用层的统一入口，屏蔽底层包结构的复杂性
