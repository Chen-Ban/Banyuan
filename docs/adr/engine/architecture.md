# 引擎 · 架构级决策

> 整体怎么组织——@banyuan/banvasgl（面向声明式 UI 的 2D 图形运行时，含流程控制）顶层架构。定位见 A0。

---

## 决策依赖图

```
                     ┌──────────────────────────────────────────────┐
                     │  A0 库定位：声明式 UI 图形运行时（含流程控制）│
                     │     —— 机制/策略分离契约（根定位决策）        │
                     └───────────────────────┬──────────────────────┘
                                             │ refines
                     ┌───────────────────────▼──────────────────────┐
                     │  A1 八层引擎架构（顶层组织决策）              │
                     └───────────────────────┬──────────────────────┘
                                             │ decomposes into
        ┌────────────┬────────────┬──────────┼──────────┬────────────┬────────────┐
        │            │            │          │          │            │            │
┌───────▼──┐  ┌──────▼───┐  ┌────▼────┐  ┌──▼───┐  ┌──▼───┐  ┌────▼────┐  ┌────▼────┐
│A2 渲染架构│  │A3 交互架构│  │A4 视图  │  │A5 Flow│  │A6 序列│  │A7 物料  │  │A8 宿主  │
│(renderer) │  │(interact) │  │  体系   │  │顶层定义│  │化系统 │  │  系统   │  │集成层   │
└─────┬─────┘  └─────┬─────┘  └────┬────┘  └──┬───┘  └──┬───┘  └────┬────┘  └────┬────┘
      │              │              │          │         │            │            │
      │ enables      │ enables      │          │         │            │            │
      │              │              │          │         │            │            │
┌─────▼─────┐  ┌─────▼─────┐       │     ┌────▼────┐   │       ┌────▼────┐  ┌────▼────┐
│A2a 相机   │  │A3a 逐层   │       │     │A5a Flow │   │       │A7a 占位 │  │A8a 三态 │
│驱动无限   │  │激活策略    │       │     │融合物理 │   │       │符替换   │  │统一引擎 │
│画布       │  │            │       │     │隔离     │   │       │机制     │  │         │
└───────────┘  └───────────┘       │     └────┬────┘   │       └─────────┘  └─────────┘
                                   │          │         │
                              ┌────▼────┐ ┌───▼────┐ ┌──▼─────┐
                              │A4a 布局 │ │A5b 前后│ │A6a 版本│
                              │策略模式 │ │端执行器│ │迁移注册│
                              └─────────┘ │隔离    │ └────────┘
                                          └────────┘
```

关系说明：

- A0 是根定位决策，确立「图形运行时」定位与机制/策略分离契约，A1 及其余所有 engine 决策均 refines A0
- A1 是顶层组织决策，分解为七个子系统架构（A2~A8）
- A2→A2a：Canvas 2D 渲染能力使相机模型成为可能
- A3→A3a：交互状态机架构衍生出逐层激活策略
- A4→A4a：视图体系确立后，布局以策略模式扩展
- A5→A5a→A5b：FlowSchema 顶层定义（过程式 AST）→ Flow 融合 BanvasGL 物理隔离 → 前后端执行器隔离（本质定义在前，物理形态在后）
- A6→A6a：序列化系统衍生出版本迁移能力
- A7→A7a：物料系统的核心是占位符替换机制
- A8→A8a：宿主集成层使三态统一引擎成为可能

---

## 库定位

### A0. banvasgl 定位为「面向声明式 UI 的 2D 图形运行时（含流程控制）」

**未实施** · 所有 engine 决策的上位根决策

banvasgl 的定位从早期的「带流程控制的图形渲染库」**升级**为「面向声明式 UI 的 2D 图形运行时（含流程控制）」。

> A 2D graphics runtime for declarative UI, with built-in flow control.

**为什么是「运行时（runtime）」而非「渲染库（rendering library）」：** 渲染库只回答「怎么把图形画出来」，而 banvasgl 还回答「View 的事件/生命周期如何驱动 FlowSchema 执行」「编辑/预览/线上三态如何共享同一套内核」「应用数据如何序列化与版本迁移」——它承载的是一个声明式应用从加载到交互到流程执行的**完整运行闭环**。运行时在语义上**包含**渲染（`runtime ⊃ rendering`），因此用 runtime 定位既不丢失渲染能力的表达，又准确覆盖了流程控制与三态运行职责。

**机制 / 策略分离契约（本定位的核心推论）：**

banvasgl 作为运行时，只提供**机制（mechanism）**，不内置**策略（policy）**。机制是「如何做某件事的底层能力」，策略是「在什么场景下、以什么规则使用这些能力」。

| 维度 | 机制（runtime 提供） | 策略（上层提供） |
|------|---------------------|-----------------|
| 输入 | 原子指针事件（pointerdown/move/up）、命中检测、几何变换 | 把原子事件解释成何种高层交互 |
| 流程 | FlowSchema 执行（FlowRunner）、`flowEnabled` gate | 何时允许执行流程（三态语义） |
| 交互 | resize/rotate/move 等几何操作原语 | 何时进入编辑状态机、把原子事件序列识别成何种高级交互 |

这条契约自动收敛此前所有「某能力该归哪一层」的纠结，归属可直接从「它是机制还是策略」推导：

- **归 banvasgl（机制）**：原子指针事件、命中检测、几何变换、FlowSchema 执行、`flowEnabled` gate、序列化/版本迁移。
- **归 banyan（编辑策略）**：InteractionStateMachine（作者态 10 状态编辑状态机）——它是「把原子事件解释成编辑操作」的策略，只服务设计态。
- **归 banvas-runtime（运行策略）**：高级交互识别器（InteractionRecognizer，把原子事件序列识别成 click/doubleclick/contextmenu/drag/hover/focus 等 `IViewEvents` 语义）+ `useRuntimeBanvas`（运行态画布组装）——它是「把原子事件解释成终端用户高级交互并派发到 View.events」的策略，服务预览/线上态。注意是「基于原子事件的高级交互识别」（桌面鼠标/键盘事件模型），非触摸手势。

**未来演进路线（先 runtime、后按需抽 core）：** 当出现第三方纯图形需求时，可将运行时内部已分层的「渲染 + 几何 + 命中检测 + 原子事件」机制层抽取为通用 `banvas-core`，banvasgl 保留「FlowSchema + events + lifetimes」应用语义层并依赖 core。因为这些机制现在已在运行时内部分层存在，未来拆分是一次「抽取（extract）」而非「重写（rebuild）」，演进成本接近于零。反向时序（先做通用图形库、再往上叠应用语义）会逆向重构，故不采用。

```
现在：banvasgl（runtime）
  └─ 内部已分层：渲染机制 / 几何机制 / 命中检测 / FlowSchema 执行 / 原子事件

未来若有第三方纯图形需求（按需抽取，非现在）：
  banvas-core（通用渲染）  ←── 抽取「渲染 + 几何 + 命中 + 原子事件」机制层
  banvasgl（runtime）      ←── 保留「FlowSchema + events + lifetimes」应用语义层，依赖 core
```

**决策链：** View.events / View.lifetimes / Scene 生命周期的类型都是 FlowSchema | null，渲染与流程控制天然耦合 → 「渲染库」无法表达流程控制与三态运行职责 → 升级为「图形运行时」准确覆盖完整运行闭环 → 运行时只提供机制不内置策略，使三态/编辑交互/运行交互的分层归属可机械推导 → 机制层未来可按需抽取为通用 core。

**约束：**

- banvasgl 对外暴露机制原语（原子事件 InteractionInput、命中检测 hitTest、几何操作、FlowSchema 执行入口），不内置高级交互识别（click/drag/hover 等由上层策略解释）。原子事件须硬件无关（pointer 归一化鼠标/触摸/笔，设备差异降为属性），具体契约与跨平台缺口见 M10a。
- 高层交互的「策略」必须由上层注入：编辑策略由 banyan 提供，运行策略由 banvas-runtime 提供，二者均不下沉进 banvasgl 内核。
- 运行时内部须保持「机制层（渲染/几何/命中/原子事件）」与「应用语义层（FlowSchema/events/lifetimes）」的内部分层，为未来抽取 banvas-core 预留边界。
- 定位陈述（中英文）须与下游文档（AGENTS.md、README、package.json description、ADR README）保持一致（同步更新单独成轮）。

**反例：**

- 定位为「图形渲染库」——丢失流程控制与三态运行职责的语义表达，且与 View.events/lifetimes 依赖 FlowSchema 的事实不符。
- 现在就拆出通用图形库再往上叠应用语义——逆向时序，需重写而非抽取，属过度设计。
- 把高级交互策略（编辑状态机、运行态交互识别、useRuntimeBanvas）内置进 banvasgl——破坏机制/策略分离，使三态与第三方复用都受污染（参见 Konva/Fabric 内置高层交互的反例）。

---

## 顶层组织

### A1. 八层引擎架构

**✅ 已实施** · refines A0

BanvasGL 代码组织为八层，依赖方向严格自上而下：

```
hook（React 集成，peerDep）
  ↓
actions（封装操作 API）
  ↓
engine（App/Scene/Renderer/Camera/Interaction/Serializer/Material）
  ↓
view（View 基类 + 子类 + addon + property）
  ↓
graph（图形基元：解析图形/组合图形/文本/媒体/轨迹）
  ↓
foundation（数学/样式/动画/常量/工具）
  ↓
types（纯接口契约，零实现）

flow（独立子模块，子路径导出，被 engine 层引用）
```

**决策链：** A0 确立图形运行时定位（runtime ⊃ rendering + 机制/策略分离）→ 八层划分是该运行时的内部结构，承载机制实现（types/foundation/graph/view/engine/flow）并把策略注入点收敛到 actions/hook 边界 → 引擎需要服务多种场景（前端渲染/后端流程执行/React 集成/独立测试）→ 分层隔离各职责 → 单一入口 index.ts 统一导出公共 API → 子路径导出服务特定场景。

**约束：**

- types 层是纯接口，不含实现代码，含 guards.ts 类型守卫
- foundation 是零依赖原子模块（数学/样式/动画/常量）
- graph 层只依赖 foundation 和 types
- view 层依赖 graph + foundation + types
- engine 层是运转核心，依赖 view + graph + foundation + types + flow
- flow 层独立于图形层，通过 package.json exports 子路径导出
- actions 封装对 engine/view 的复合操作
- hook 层桥接引擎与 React 宿主，声明 React 为 peerDep

---

## 渲染子系统

### A2. Canvas 2D 双缓冲渲染，预留 Renderer 接口

**✅ 已实施** · 属于 A1 渲染层

MVP 阶段使用 Canvas 2D 双缓冲渲染。渲染层抽象为 Renderer 接口，后续可替换为 WebGPU 实现。

**决策链：** 产品目标（快速验证）-> 选择 API 最简单的渲染后端 -> Canvas 2D。接口化隔离未来升级路径。

**约束：**

- 双缓冲：OffscreenCanvas 绘制 → transferToImageBitmap → 主 Canvas 显示
- DPR 融入变换矩阵：逻辑坐标 × dpr = 物理像素，相机在逻辑空间操作
- 渲染顺序：decoration 背景 → clip → 内容 + 子节点 → addon 插件
- 视口裁剪：OrthographicCamera 模式下仅渲染与视口相交的 View
- 帧循环由 Scene 管理（requestAnimationFrame），Renderer 不主动触发帧
- 节点数 > 1000 时可能出现渲染性能瓶颈，需要视口剔除 + 空间索引缓解

**反例：**

- WebGL 2——文本渲染需自建 MSDF font atlas，Safari 实现有坑，开发成本远超收益
- WebGPU——浏览器支持未普及（Firefox/Safari），2D 渲染管线工程量大，列入路线图远期目标

---

### A2a. 相机驱动的无限画布模型

**✅ 已实施** · 依赖 A2

Canvas DOM 元素尺寸 = 外部容器尺寸（自适应）。Scene 使用 OrthographicCamera，通过 camera position + zoom 的 VP 矩阵决定世界的哪部分映射到视口。

**决策链：** 用户需要无限画布浏览 -> CSS 缩放模型无法实现真正的无限画布和清晰缩放 -> 采用业界主流（Figma/tldraw/Excalidraw）相机模型 -> 引擎层已有 OrthographicCamera 全套基础设施。

**约束：**

- 缩放 = camera.zoom(factor)，平移 = camera.pan(dx, dy)
- 事件坐标从屏幕空间转世界空间需经 VP 逆矩阵
- Zoom-to-cursor：缩放前后鼠标指针下方世界点的屏幕位置保持不变
- DPR 与相机缩放在不同层级独立应用，互不干扰
- 支持两种模式：固定模式（传 width/height，contain fit 居中）和自适应模式（铺满容器）

**反例：**

- CSS 样式缩放（旧方案）——缩放后文本模糊（像素被拉伸而非重绘）、不支持平移、世界有固定边界

---

## 交互子系统

### A3. 交互状态机架构（InteractionStateMachine + Delegate 模式）

**✅ 已实施** · refines A0 · 属于 A1 引擎层

交互系统采用**纯逻辑状态机 + Delegate 注入**架构。InteractionStateMachine 是零 DOM、零 React 依赖的纯状态机，通过 InteractionDelegate 接口声明所有外部能力需求，由宿主注入实现。

> **A0 机制/策略定位：** 按 A0 机制/策略分离契约，「把原子事件解释成何种高层交互」属于**策略**，InteractionStateMachine（作者态编辑状态机）是**编辑策略**，归属 banyan，不下沉进 banvasgl 内核；banvasgl 只提供该策略消费的**机制**——原子指针事件、命中检测、几何变换原语（resize/rotate/move）与 InteractionDelegate 机制接口（见 C9/C10）。本决策描述的是「策略如何用机制原语组织成状态机」这一通用结构，机制原语本身由 banvasgl 运行时提供。

**决策链：** A0 确立机制/策略分离 → 交互编排（把原子事件解释成拖拽/缩放/旋转/框选/文本选区/连线/顶点编辑）属策略，由宿主注入 → 状态机是管理复杂交互策略的最佳模式 → 状态机只消费 banvasgl 暴露的几何/命中机制原语，通过 InteractionDelegate 接口解耦，零宿主环境依赖。

**约束：**

- 判别联合状态：idle → hover → moving/resizing/rotating/panning/box-selecting/text-selecting/editing-point/connecting
- InteractionCapability 集合配置启用的交互能力（pan/move/resize/rotate/connect/box-select/text-selection/edit-point/drop）；能力集是**策略取值**，由上层按运行态注入（见 C10）
- 状态机纯逻辑，不持有 DOM 引用，不监听事件（事件由宿主转发）
- 机制归属：原子事件/命中检测/几何变换原语归 banvasgl；状态机编排（编辑策略）归 banyan，运行态高级交互识别 + useRuntimeBanvas（运行策略）归 banvas-runtime（A0 归属推导）
- 启用何种能力集是策略决策：编辑态启用全部能力，预览态/线上态禁用所有编辑能力——此差异由上层注入不同 Capability 集与 Delegate 实现达成，banvasgl 不内置该取值

**反例：**

- 事件监听散落在各 View 中——状态冲突难以管理，拖拽和框选互斥逻辑无法集中处理
- React 状态管理交互——引擎内核不应依赖 React 渲染周期
- 把编辑状态机或运行态高级交互识别内置进 banvasgl 内核——破坏 A0 机制/策略分离，污染三态复用与未来 banvas-core 抽取边界

---

### A3a. 逐层激活策略（resolveActivationTarget）

**✅ 已实施** · 细化 A3

容器嵌套场景下，点击事件通过 `resolveActivationTarget()` 实现逐层穿透选中：首次点击选中外层容器，再次点击穿透进入内层。

**决策链：** 容器可多层嵌套 → 用户需要精确选中任意层级的元素 → 一次点击无法确定用户意图 → 逐层穿透是 Figma/Sketch 的业界标准交互模式。

**约束：**

- 首次点击：选中命中链最外层的未选中容器
- 双击或再次点击已选中容器：穿透进入下一层
- 穿透到叶子节点后不再深入
- 按住特定修饰键可直接选中最深层元素（快捷穿透）

---

## 视图子系统

### A4. View 继承体系与 addon mixin 模式

**✅ 已实施** · 属于 A1 视图层

`View` 基类派生出子类（TextView/ImageView/GraphView 等）和容器视图 `ContainerView`（CombinedView 的基类）。能力通过 addon mixin 附加：BoundingBoxAddon、BoxDecorationAddon、VertexAddon、AnimationAddon、TextSelectionAddon。

**决策链：** 视图能力有正交维度（装饰 × 动画 × 选区 × 包围盒）→ 传统多层继承会组合爆炸 → mixin 模式按需附加，避免菱形继承。

**约束：**

- addon 通过 `use()` 或初始化时自动 attach
- addon 之间不允许相互依赖
- 新增能力优先考虑 addon，而非新建子类
- 流程图视图（NodeView/EdgeView/PortView）定义在 `view/FlowViews/` 目录，NodeView 继承 ContainerView
- PropertyAdapter 系统为属性面板提供统一的属性读写适配

---

### A4a. 布局统一挂载到 CombinedView 的 layoutMode 策略模式

**✅ 已实施** · 细化 A4

禁止新增独立的布局容器 ViewType。新布局能力以新的 `layoutMode` 值 + 对应 LayoutStrategy 实现挂载到 `CombinedView`。

**决策链：** 早期每种布局都是独立的 ViewType → 导致 ViewType 膨胀、AI 生成时决策空间过大 → 改为 CombinedView 作为统一容器 + layoutMode 枚举 + 策略模式。

**约束：**

- CombinedView.layoutMode 当前支持：free / flex / list / grid
- 每个 layoutMode 对应一个 LayoutStrategy 实现（FlexLayoutStrategy / ListLayoutStrategy / GridLayoutStrategy）
- `getLayoutStrategy()` 工厂函数根据 layoutMode 返回对应策略
- `isLayoutManaged` 属性决定子元素是否可自由拖拽（布局托管时禁止自由移动）
- AI 生成时只需决定 layoutMode 值，不需要在 ViewType 级别选择

**反例：**

- 每种布局一个独立 ViewType——种类膨胀，AI 难以选择，跨布局组合困难

---

## 流程控制子系统

### A5. FlowSchema 顶层定义——有向图形态的过程式 AST

**✅ 已实施** · refines A0 · 流程控制子系统的本质定义决策

FlowSchema 是一棵以**有向图**形态承载的**过程式抽象语法树（procedural AST as a directed graph）**。它用「语义化的节点 + 有向边」声明一段程序的**执行流程**：动作节点（FlowActionNode）≈ 语句（statement），值节点（收敛为源节点 SourceNode 与计算节点 ComputeNode 两亚种）≈ 表达式（expression），控制边（ControlEdge）≈ 控制流转移，数据边（DataEdge）≈ 表达式求值依赖。

> FlowSchema is a procedural AST expressed as a directed graph: action nodes are statements, value nodes are expressions, control edges are control-flow transfers, data edges are value dependencies.

**FlowSchema 只描述「流程控制」，不描述「面向对象」（本定义的核心边界）：**

面向对象（对象的状态、行为、封装）不属于 FlowSchema 的表达范畴，它定义在 **View / Page / App 的数据层**——**View 本身就是那个「对象」**：它持有状态（属性/样式/布局），暴露行为（`events` 的 13 个事件处理器 + `lifetimes` 的 3 个生命周期钩子），并以视图树实现封装与组合。而 FlowSchema 正是挂在这些事件/生命周期字段上的「**方法体（method body）**」——它回答的是「当某个事件触发时，按什么流程执行哪些动作」，是纯粹的**过程式 / 数据流**描述，因此**不应**承载 class/继承/多态/this 绑定等 OO 原语。

```
App / Page / View（数据层）        ← 面向对象在这里：View 即对象（状态 + 行为 + 封装）
  └─ View.events / View.lifetimes  ← 对象的「行为」声明，类型为 FlowSchema | null
       └─ FlowSchema               ← 对象的「方法体」：过程式 AST（仅流程控制）
            nodes + edges          ← 语句/表达式 + 控制流/数据流
```

**空间坐标（x/y）移出 FlowSchema——职责回归图形化外壳层：**

FlowSchema 早期在节点上携带 `x?/y?` 空间坐标，是因为当时没有独立的「图形化外壳」层，schema 不得不兼任「布局承载者」。现在编辑态由图形化外壳（NodeView/EdgeView/PortView + 画布）负责节点的空间摆放，坐标属于**视图呈现职责**而非**程序语义**。FlowSchema 作为过程式 AST，其语义完全由 `nodes`（含 kind 与配置）+ `edges`（控制流/数据流拓扑）确定，与节点画在画布何处无关。因此坐标应从 schema 移除，由图形化外壳层独立持有——这是一次**职责回归（responsibility restoration）**：schema 回归「纯语义」，外壳回归「纯呈现」。

**决策链：** View.events / View.lifetimes / Scene 生命周期的类型都是 FlowSchema | null → FlowSchema 是 View 这个「对象」的方法体 → 方法体的本质是「按流程执行动作」的过程式描述，用有向图承载即过程式 AST（节点=语句/表达式，边=控制流/数据流）→ OO 语义归 View/Page/App 数据层（View 即对象），FlowSchema 不重复表达 → 既然 OO 与呈现都不归 schema，节点空间坐标（x/y）也不应留在 schema，回归图形化外壳层 → schema 收敛为「纯语义有向图」，外壳/执行器/descriptor 都建立在这个稳定本质之上。

**约束：**

- FlowSchema 的语义边界 = 流程控制：顺序 / 条件分支 / 延迟 / 子程序调用（callFlow）/ 子流程内联（subFlow）/ 变量赋值 / 提前终止（return）/ 列表迭代（forEach）/ 并行（parallel）。OO 原语（class/继承/多态/this）不进入 FlowSchema。
- 节点分两类：动作节点（statement）与值节点（expression）；边分两类：控制边（控制流转移，含分支标签）与数据边（表达式求值依赖）。二者共同构成有向图 AST。两类边在 schema 中**显式分型**（ControlEdge / DataEdge 判别联合），不靠可选字段隐式区分——具体字段契约见协议级 C15。
- 节点空间坐标（x/y）不属于 FlowSchema，由图形化外壳层持有；序列化/反序列化 FlowSchema 不得读写坐标（坐标作为外壳侧的视图状态单独持久化）。
- FlowSchema 的语义自洽性必须与图形化形态可逆：外壳层从 schema 派生端口/连线，能完整还原控制流与数据流拓扑（含数据边），不得丢失语义。
- 节点与边的具体字段形状（值节点收敛为源节点/计算节点两亚种、ControlEdge/DataEdge 显式分型、参数插槽混合模型）由协议级 **C15. FlowSchema 图结构契约** 固化，本决策只定义「是什么」，C15 定义「长什么样」。

**反例：**

- 把 OO 概念（对象定义、继承、方法分派）塞进 FlowSchema——与「View 即对象」的数据层职责重叠，造成双重事实源；FlowSchema 只是 View 对象的方法体，不该重新发明对象系统。
- 让 FlowSchema 继续携带 x/y 坐标——职责泄漏，schema 同时是「程序语义」与「画布布局」两种身份，外壳层与执行器都被迫感知呈现细节。
- 把 FlowSchema 理解为「纯数据流图」或「纯状态机」——丢失了它作为「过程式程序」的本质（有顺序、有分支、有子程序调用、有提前返回），无法准确表达完整控制流集合。

---

### A5a. Flow 融合进 BanvasGL，子路径导出实现物理隔离

**✅ 已实施** · 细化 A5 · 属于 A1 flow 层

流程执行引擎作为 `@banyuan/banvasgl` 的内部子模块（`src/flow/`），设计哲学为**领域专用声明式解释器**：

```
FlowSchema（nodes + edges）  ≈ AST
    ↓
NodeExecutor（registry）     ≈ 操作语义
    ↓
FlowContext（env + 变量表）  ≈ 运行时环境
```

**决策链：** View.events 和 View.lifetimes 的类型都是 FlowSchema | null，渲染层天然依赖流程定义 -> BanvasGL 语义上是「带流程控制的图形引擎」而非纯渲染包 -> 但后端云函数也需执行 FlowSchema，不应强制引入图形引擎代码 -> 子路径导出 + tsup splitting 保证后端入口只加载流程执行器代码。

**约束：**

- Flow 源码位于 `packages/banvasgl/src/flow/`，包含 types/runtime/executors/presets 四个子目录
- 子路径导出：`./flow`（核心类型+运行时+注册表）/ `./flow/client`（前端预设）/ `./flow/server`（后端预设）
- tsup splitting 保证各入口文件独立打包，后端引入 flow/server 不会加载图形引擎代码
- FlowRunner 执行模型：建图 → 找入口（无入边的首个动作节点）→ 主循环（MAX_STEPS=1000）→ 分支/错误路由/return 终止

**反例：**

- Flow 作为独立 npm 包——引入了不必要的包间依赖管理复杂度，且语义上 Flow 就是 BanvasGL 的一部分
- Flow 逻辑与图形引擎代码混编不分离——后端引入云函数执行器时会加载整个图形引擎，依赖爆炸

---

### A5b. 前后端执行器共享 FlowSchema 但物理隔离

**✅ 已实施** · 细化 A5a

前端通过 createClientFlowRunner() 创建执行器（注册 client + shared 节点），后端通过 createServerFlowRunner() 创建执行器（注册 server + shared 节点）。

**决策链：** 同一个 FlowSchema JSON 在不同环境下执行时可用节点不同 -> Strategy Registry 模式：工厂函数创建 Runner 时按预设批量注册节点执行器。

**约束：**

- 前端节点：animate / navigate / setData / setVisible
- 后端节点：dbQuery / dbInsert / dbUpdate / dbDelete / httpRequest / script / transform
- 共享节点：condition / delay / setVariable / callFlow / subFlow / return / forEach / parallel
- App 持有唯一的 ClientFlowRunner 实例，Scene.triggerSchema 直接构造 FlowContext 并调用 FlowRunner.run

---

## 序列化子系统

### A6. 序列化系统（类型注册表 + 递归序列化）

**✅ 已实施** · 属于 A1 引擎层

核心序列化器 `Serializer` 采用单例 + 类型注册表模式，通过 `$type/$value` 包装实现多态反序列化。

**决策链：** 应用数据需要持久化到 MongoDB → View 树必须可序列化为 JSON → 多态类型（不同 ViewType）需要在反序列化时恢复正确的类实例 → 类型注册表 + 标记字段。

**约束：**

- 每个可序列化类通过 `Serializer.register(typeName, constructor)` 注册
- 序列化输出：`{ $type: 'TextView', $value: { ...properties } }`
- 反序列化时根据 `$type` 查找注册表，调用对应构造函数
- 支持循环引用检测和最大深度限制
- addon 状态不序列化（attach 时按配置重建）
- ID 保持稳定（序列化/反序列化后 view.id 不变）

---

### A6a. 版本迁移注册表（MigrationRegistry）

**✅ 已实施** · 细化 A6

`MigrationRegistry` 管理数据版本迁移函数，确保旧版本数据可升级到当前引擎版本。

**决策链：** 引擎迭代会改变数据结构 → 用户已保存的应用数据不能丢失 → 需要版本化迁移机制 → 注册表模式管理迁移函数链。

**约束：**

- 迁移函数按版本号注册，按序执行
- 迁移是幂等的（重复执行不会破坏数据）
- 迁移外置到 CI/CD 管线（不在运行时阻塞加载）

---

## 物料子系统

### A7. 物料系统（模板 ↔ 实例双向转换）

**✅ 已实施** · 属于 A1 引擎层

物料系统实现 View 实例与物料模板之间的双向转换：`MaterialInstantiator`（模板→实例）和 `MaterialSerializer`（实例→模板）。

**决策链：** 低代码平台需要物料库（预制组件）→ 物料本质是参数化的 View 模板 → 需要实例化时替换占位符、重生成 ID、填充参数。

**约束：**

- MaterialInstantiator：占位符替换 + ID 重生成 + 参数填充 + 资源替换
- MaterialSerializer：反向操作，将 View 实例抽象为可复用模板
- NodeView 特殊路径：端口由构造函数按 schema 自动推导，不走通用 deserialize
- 物料模板格式与 View JSON 格式兼容，额外包含参数定义和占位符标记

---

### A7a. 占位符替换机制

**✅ 已实施** · 细化 A7

物料模板中的动态内容通过占位符标记，实例化时由 `placeholders.ts` 工具进行 JSON path 级别的替换。

**决策链：** 物料模板需要参数化（如文本内容、图片 URL、颜色主题）→ 占位符是最直观的参数化方式 → JSON path 定位确保替换精确。

**约束：**

- 占位符格式：`{{paramName}}` 或 JSON path 引用
- pathUtils.ts 提供 JSON path 遍历和替换工具
- 替换发生在反序列化之前（先替换文本，再构造实例）

---

## 宿主集成子系统

### A8. 引擎 ↔ 宿主 Hook 层架构

**✅ 已实施** · 属于 A1 hook 层

React hook 层通过 2 个核心 hook 桥接引擎与宿主：`useCanvasInit`（底层初始化）和 `useCanvasCamera`（相机交互）。引擎通过 `useSyncExternalStore` 模式通知 React 状态变化。

**决策链：** 引擎不依赖 React，但需要与 React 宿主协同 → hook 是 React 端的集成层 → useSyncExternalStore 是 React 18+ 推荐的外部状态订阅模式。

**约束：**

- useCanvasInit：App 生命周期 + DOM 结构 + ResizeObserver + DPR 响应 + appJSON 反序列化
- useCanvasCamera：相机驱动的无限画布交互（仅自适应模式启用）
- App 实现 `subscribe` / `getVersion` / `notify` 三件套
- actions 修改引擎状态后调用 `app.notify()` 递增版本号
- React 层通过 `useSyncExternalStore` 订阅，实现精确重渲染
- hook unmount 时调用 App.destroy() 清理资源

---

### A8a. 三态统一引擎，hook 层区分行为

**未实施** · 依赖 A8

三态（编辑态/预览态/线上态）全部使用 @banyuan/banvasgl 同一个引擎包，通过不同的 hook 配置控制行为边界。

**决策链：** 产品需要设计到预览到发布的完整链路 -> 尝试过独立 runtime 包但从未落地 -> 核心洞察：三态差异仅在交互能力配置和 FlowSchema 是否执行 -> 统一引擎 + 不同 InteractionCapability 集合。编辑态启用全部交互能力且 FlowSchema 不执行，预览态和线上态禁用编辑能力且 FlowSchema 完整执行。

**约束：**

- 两种 hook 共享底层 useCanvasInit（Canvas DOM 初始化、Renderer 创建、Camera 设置）
- 预览态前端通过编辑器内就地切换 hook（`useDesignBanvas`→`useRuntimeBanvas`）实现，不使用 iframe；**预览态是前后端异源的混合态——前端与编辑态同源（编辑器内渲染），后端复用 deploy-agent 的 `scaffoldServer` 在本地起真实服务（详见 app/A5）**
- 线上态通过 deploy-agent Production Mode 全量构建部署到 ECS

> **预览态后端边界（本 ADR 范围）：** A8a 只负责 engine 侧——预览态前端与编辑态共享同一套 `useRuntimeBanvas` 运行策略 + `flowEnabled` gate。预览态「后端如何提供」（本地起 scaffoldServer + 本地 Mongo）属 app 域服务拓扑，由 app/A5 决策，不在本 engine ADR 内展开。

**反例：**

- 独立 runtime 包——多包同步维护负担大，且从未实际创建
- iframe 嵌入预览——BanvasGL 是自包含 Canvas 引擎，hook 切换零延迟，iframe 增加不必要通信开销
- 预览态做成「纯前端就地切换、无独立后端」——无法验证 FlowSchema 后端节点（callFlow/dbQuery）的真实执行，预览价值受限（修正：预览态需配本地真实后端，见 app/A5）

**实施方案：** [三态统一引擎，hook 层区分行为](../../specs/engine/tristate-unified-engine.md)
