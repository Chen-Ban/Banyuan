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
└───────────┘  └───────────┘       │     └────┬────┘   │       └─────────┘  └────┬────┘
                                   │          │         │                        │ refines
                              ┌────▼────┐ ┌───▼────┐ ┌──▼─────┐            ┌────▼────────┐
                              │A4a 布局 │ │A5b 前后│ │A6a 版本│            │A8b 平台抽象 │
                              │策略模式 │ │端执行器│ │迁移注册│            │层 (跨平台)  │
                              └─────────┘ │隔离    │ └────────┘            └────┬────────┘
                                          └────────┘                          │ enables
                                                                       ┌────▼────────┐
                                                                       │A9 Rust 原生 │
                                                                       │核心迁移     │
                                                                       │（提案）     │
                                                                       └────┬────────┘
                                                                            │ enables
                                                                       ┌────▼────────┐
                                                                       │A9a 统一     │
                                                                       │2D/3D GPU    │
                                                                       │渲染（提案） │
                                                                       └─────────────┘
```

关系说明：

- A0 是根定位决策，确立「图形运行时」定位与机制/策略分离契约，A1 及其余所有 engine 决策均 refines A0
- A1 是顶层组织决策，分解为七个子系统架构（A2~A8）
- A2→A2a：Canvas 2D 渲染能力使相机模型成为可能
- A3→A3a：交互状态机架构衍生出逐层激活策略
- A4→A4a：视图体系确立后，布局以策略模式扩展
- A5→A5a→A5b：FlowSchema 是 BanvasGL 内置子系统（过程式 AST + Push-Pull 调度，v2.0.0 边消解为内嵌引用，v2.1.0 统一执行器模型）→ 子路径导出物理隔离 → 前后端执行器隔离（本质定义在前，物理形态在后）
- A6→A6a：序列化系统衍生出版本迁移能力
- A7→A7a：物料系统的核心是占位符替换机制
- A8→A8a：宿主集成层使三态统一引擎成为可能
- A8→A8b：平台抽象层将 React/Web 宿主集成泛化为跨平台接口注入（A8b refines A8）
- A8b→A9：平台抽象接口作为天然 FFI 边界，使 Rust 原生核心迁移成为可能（A9 refines A8b）
- A9→A9a：Rust 核心建立后，wgpu 生态使 GPU 渲染成为自然扩展——2D（vello）+ 3D（rend3）统一在同一渲染后端 trait 下（A9a refines A9）

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
### A1. 六层引擎架构

**✅ 已实施** · refines A0

BanvasGL 代码组织为六层，依赖方向严格自上而下：

```
hook（React 集成，peerDep）
  ↑
actions（封装操作 API）
  ↑
engine（App/Scene/Renderer/Camera/Interaction/Serializer/Material）
  ↑
view（View 基类 + 子类 + addon + property）
  ↑
graph（图形基元：形状/文本/媒体/轨迹）
  ↑
base ─┬─ types      纯接口契约，零实现
      ├─ foundation 数学/样式/动画/常量/工具（零图形依赖）
      └─ flow       FlowSchema 类型 + 运行时 + 执行器（仅依赖 types）
```

types、foundation、flow 三者处于同一基础设施平面——各自都仅依赖 types，互不引用。将它们展开为三个独立层级是平白多出两层；flow 挂在纵向栈旁边也不反映「被 engine 引用」这一唯一的上下关系。合并为 base 层后，上层可横向引用 base 内任一子模块，纵向只余六层。

**决策链：** A0 确立图形运行时定位（runtime ⊃ rendering + 机制/策略分离）→ 六层划分是该运行时的内部结构，承载机制实现（base { types/foundation/flow } / graph / view / engine）并把策略注入点收敛到 actions/hook 边界 → 引擎需要服务多种场景（前端渲染/后端流程执行/React 集成/独立测试）→ 分层隔离各职责 → 单一入口 index.ts 统一导出公共 API → 子路径导出服务特定场景。

**约束：**

- types 是纯接口，不含实现代码，含 guards.ts 类型守卫；flow 类型在 `src/types/foundation/flow/`
- foundation 是零依赖原子模块（数学/样式/动画/常量 + flow 运行时），仅依赖 types；flow 实现在 `src/foundation/flow/`
- flow 仅依赖 types，与 foundation 同级互不引用；运行时通过 package.json exports 子路径导出
- graph 层依赖 base（foundation + types，不含 flow）
- view 层依赖 graph + base
- engine 层是运转核心，依赖 view + graph + base（含 flow）
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

### A5. FlowSchema 是 BanvasGL 的内置流程控制子系统——有向图形态的过程式 AST

**✅ 已实施** · refines A0 · 流程控制子系统的本质定义决策。Flow 不做独立 npm 包，由此决策自然确立。

FlowSchema 是一棵以**有向图**形态承载的**过程式抽象语法树（procedural AST as a directed graph）**。它用「语义化的节点 + 内嵌引用」声明一段程序的**执行流程**：节点按在控制路径上的位置与有无副作用分为五类（control / action / source / compute / function），控制流由节点 `slots[*].next` 字段承载，数据依赖由 `SlotValue = unknown | DataRef` 承载。

> FlowSchema is a procedural AST expressed as a directed graph, executed via Push-Pull scheduling: Push walks the `next` chain, Pull resolves DataRefs recursively.

**v2.0.0 核心设计：边消解为节点内嵌引用。** 边的本质是节点之间的关系，不是独立存在的事物——控制流是"A 执行完后去 B"（A 的属性），数据流是"B 的输入来自 A"（B 的属性）。因此 v2.0.0 将 ControlEdge / DataEdge 两层边数组消解为节点内部字段：

| 原边类型 | 消解为 | 所在位置 |
|----------|--------|----------|
| `FlowControlEdge` | `slots[*].next: string` | control / action 节点的 slot |
| `FlowDataEdge` | `SlotValue = unknown \| DataRef` | 所有节点的 slot.input |

`DataRef { nodeId, field }` 天然编码了"谁连到我"——`nodeId` 指向源节点，`field` 指向源节点的输出字段名。Runner 的 Pull 阶段遇到 DataRef 时递归 `stepNode` 求值源节点并取对应 field。不需要在顶层维护 DataEdge 数组。

**执行模型：Push-Pull 混合调度。**

- **Push（推进）**：FlowRunner 从显式 `entry` 节点出发，沿节点 `slots[*].next` 字段推进 control/action 节点。Condition 的 slot 自带 `filter + next`，Loop/Parallel/Function 的 slot 自带 `body + next`。`next` 为空字符串即该条控制路径结束，无需强制汇合。
- **Pull（拉取）**：action 节点执行前、control 节点判据求值前，沿 `DataRef` 反向递归拉取 source/compute 子树求值。source 直接出值（字面量或查上下文），compute 递归拉取其输入后计算出值。action 节点的输出通过 DataRef 被下游引用。

**图结构：顶层开放 DAG，子图为可调用闭包。**

- 顶层 FlowSchema：显式 `entry` 标起点，不设 `exit`。`next` 为空字符串即自然结束。多条控制路径汇入同一节点即 OR 汇合。
- 子图（内嵌 FlowSchema body）：可调用闭包。通过 `entry` 标起点，独立作用域帧（FrameRecord）。Function / Loop / Parallel 节点内嵌 `body: FlowSchema`，通过 `runSubGraph()` 在新帧中执行。

**五个语义边界：**

- **`navigate` 必须是终点节点**：navigate 切换 Scene 后当前 flow 的 context 失效，`next` 必须为空字符串。
- **`onError` 是补偿（cleanup），非恢复（recovery）**：`onError` 是 slot 级别的字段（在 Action / Function slot 上），执行完毕后流程终止——下游不应消费已失败节点的无效输出。和 Saga 补偿模式一致。
- **`Function` 是函数隔离闭包**：不穿透读取外层帧变量。所有依赖显式通过 inputs 传入。和 React Hook 不能隐式访问组件 state 同理。
- **`Return` 写 `returnRef.value`**：Return 节点将 inputs 写入当前帧的 `returnRef.value`，`runSubGraph` 返回该值。仅用于子图。
- **`Condition` 无默认分支**：全部 slot 的 filter 均不匹配时流程终止（`nextNodeId: null`）。

**FlowSchema 只描述「流程控制」，不描述「面向对象」（本定义的核心边界）：**

面向对象定义在 **View / Page / App 的数据层**——**View 本身就是那个「对象」**：它持有状态，暴露行为（`events` 的 12 个事件处理器 + `lifetimes`），FlowSchema 是挂在这些字段上的「**方法体**」。

**决策链：** A0 确立 BanvasGL 是「面向声明式 UI 的 2D 图形运行时（含流程控制）」→ 流程控制是 BanvasGL 根定义的一部分 → View.events / View.lifetimes 的类型都是 FlowSchema | null → FlowSchema 是 View 的方法体 → 方法是过程式程序，用有向图承载即过程式 AST → v2.0.0 将 ControlEdge/DataEdge 消解为节点内嵌引用（next + DataRef），消除边数组与节点间引用完整性的维护成本 → 顶层图是开放 DAG，子图是可调用闭包 → OO 语义归 View/Page/App，空间坐标归外壳层。

**约束：**

- FlowSchema 的语义边界 = 流程控制。OO 原语不进入 FlowSchema。
- 节点按调度行为分五类（`category: 'control' | 'action' | 'source' | 'compute' | 'function'`），25 种 NodeKind（详见 C17）。
- 控制流由 `slots[*].next: string` 承载（空字符串 = 终止），数据依赖由 `SlotValue = unknown | DataRef` 承载。
- 编辑时校验：控制路径有向无环；DataRef forward-reference；navigate 的 next 必须为空字符串。
- 节点空间坐标（x/y）不属于 FlowSchema。
- Flow 不做独立 npm 包——A0 已确立流程控制是 BanvasGL 的组成部分。代码通过子路径导出物理隔离（见 A5a）。
- FlowSchema 版本号 `FLOW_SCHEMA_VERSION = "2.0.0"`；FlowRunner 调度模型版本 v2.1.0（统一执行器模型）。

**反例：**

- 把 OO 概念塞进 FlowSchema——与「View 即对象」的数据层职责重叠。
- 让 FlowSchema 继续携带 x/y 坐标——职责泄漏。
- Flow 作为独立 npm 包——割裂 BanvasGL 的完整语义。
- 把 FlowSchema 理解为「纯数据流图」或「纯状态机」——丢失过程式程序本质。
- 在顶层图强制 SESE（如 Blender GN）——事件驱动程序不需要所有分支汇合。
- 维护独立边数组而非内嵌引用——增加引用完整性维护成本和 O(n) 扫描开销。

---

### A5a. Flow 子模块通过子路径导出实现物理隔离

**✅ 已实施** · 细化 A5 · 属于 A1 base 层

A5 已确立 Flow 是 BanvasGL 的内置子系统（不做独立包）。本决策解决随之而来的工程问题：**后端云函数也需执行 FlowSchema，但不应被迫引入整个图形引擎的渲染层代码**。方案是子路径导出 + tsup splitting：前端的 `flow/client` 和后端的 `flow/server` 各自独立打包，后者不会加载任何 Canvas/DOM/React 代码。

流程执行引擎作为 `packages/banvasgl/src/foundation/flow/` 内部子模块（与 types、foundation 共处 base 层），设计哲学为**领域专用声明式解释器**：

```
FlowSchema（nodes + entry）  ≈ AST
    ↓
NodeExecutor（registry）     ≈ 操作语义
    ↓
FlowRunner（FrameStack + cap） ≈ 运行时环境
```

**v2.1.0 统一执行器模型：** Runner 退化为纯编排外壳（帧栈管理 / ID→节点映射 / 缓存 / 错误恢复 / 步数限制），所有 NodeKind 均通过 `ExecutorRegistry`（按 NodeKind 索引的映射类型）分发。Executor 负责数据产出 + `nextNodeId` 决策。

**决策链：** A5 确立 Flow 归属 BanvasGL（不做独立包）→ 后端云函数执行 FlowSchema 时不应被迫加载图形引擎 → 子路径导出 + tsup splitting → 前端取 `./flow/client`、后端取 `./flow/server`，各自只加载所需代码。

**约束：**

- Flow 源码位于 `packages/banvasgl/src/foundation/flow/`，包含 FlowRunner / FrameStack / executors / presets 四个子目录；类型位于 `src/types/foundation/flow/`
- 子路径导出：包级 exports 仅有四个子路径：`.`（主入口，含 Flow 类型）、`./react`、`./flow/client`、`./flow/server`；**不存在 `./flow` 公开子路径**——内部组件（FlowRunner 类、NodeExecutor 注册表、各求值器）不对外暴露，只暴露预组装工厂
- tsup splitting 保证 `flow/server` 入口不加载图形引擎代码，后端可安全使用
- FlowRunner 执行模型：v2.1.0 Push-Pull 混合调度（Push 沿 `next` 字段推进，Pull 沿 `DataRef` 递归求值；MAX_STEPS=1000 安全阀）；所有节点通过 `ExecutorRegistry`（按 NodeKind 索引的映射类型）分发

**反例：**

- Flow 逻辑与图形引擎代码混编不分离——后端引入云函数执行器时会加载整个图形引擎，依赖爆炸

---

### A5b. 前后端执行器共享 FlowSchema 但物理隔离

**✅ 已实施** · 细化 A5a

前端通过 `createClientFlowRunner()` 创建 FlowRunner（注册 shared + 前端 action 执行器），后端通过 `createServerFlowRunner()` 创建 FlowRunner（注册 shared + 后端 action 执行器）。

**决策链：** 同一个 FlowSchema JSON 在不同环境下执行时可用节点不同 → Preset 工厂模式：工厂函数创建 Runner 时按预设批量填充 `ExecutorRegistry`。

**约束：**

- **前端节点**（6 个）：setViewData / setViewVisible / playAnimation / navigate / cloudFunction（+ 共享的 setVariable）
- **后端节点**（5 个）：httpRequest / dbQuery / dbInsert / dbUpdate / dbDelete（+ 共享的 setVariable）
- **共享节点**（13 个）：literal / context（source）、math / compare / logic / concat / format / get（compute）、condition / loop / parallel / return（control）、function
- `ExecutorRegistry` 是映射类型 `{ [K in NodeKind]?: NodeExecutor<NodeForKind<K>, C> }`，Runner 的 dispatch 在 switch 中取出对应字段，类型天然匹配，无需 as 断言
- App 持有唯一的 `FlowRunner<FrontendCapProxy>` 实例，Scene.triggerSchema 直接调用 `flowRunner.run(schema)`
- 前端 cap 提供 `navigate` / `setViewData` / `setViewVisible` / `playAnimation` / `httpClient`
- 后端 cap 提供 `db`（query/insert/update/delete）/ `httpClient`

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

---

## 平台抽象子系统

### A8b. 平台抽象层：IDrawingContext / IPlatformCanvas / ICanvasHost

**✅ 已实施** · refines A8（从 React-only 宿主集成泛化为平台无关抽象）

A8 的宿主集成仅覆盖 React + Web 场景（useCanvasInit、useCanvasCamera、DOM 事件）。跨平台（iOS/Android/Node 服务端渲染）要求引擎核心不持有任何平台特定类型（HTMLCanvasElement、CanvasRenderingContext2D、OffscreenCanvas）。

本决策将宿主集成从「React hook 桥接」升级为「平台无关接口注入」。

**决策链：** A0 确立机制/策略分离 → A8 建立 React hook 宿主集成 → 跨平台需求要求引擎不依赖 DOM 类型 → 定义平台无关绘图接口 IDrawingContext（替代 CanvasRenderingContext2D）→ 定义平台画布注入接口 IPlatformCanvas（替代 HTMLCanvasElement）→ 定义引擎内部宿主接口 ICanvasHost（替代 CanvasContext 具体类）→ React/Web 绑定抽取为独立包 @banyuan/banvasgl-react。

**三个核心接口：**

| 接口 | 定义位置 | 职责 | 对应 Web 实现 |
|------|---------|------|-------------|
| `IDrawingContext` | `types/platform/drawing.ts` | 平台无关 2D 绘图 (~50 方法) | `WebDrawingContext` (banvasgl-react) |
| `IPlatformCanvas` | `types/platform/canvas.ts` | 平台画布工厂 + 双缓冲管理 | `WebPlatformCanvas` (banvasgl-react) |
| `ICanvasHost` | `types/platform/host.ts` | 引擎内部画布宿主（含 composite） | 原 `CanvasContext` 类隐式实现 |

**包拆分：**

```
@banyuan/banvasgl              # 平台无关核心（零 DOM/React 依赖）
    ├── IDrawingContext / IPlatformCanvas / ICanvasHost
    ├── Graph / View / Scene / Camera / Renderer / Flow
    └── 无 DOM lib，无 React peerDep

@banyuan/banvasgl-react        # Web 平台注入 + React Hook
    ├── WebDrawingContext (CanvasRenderingContext2D → IDrawingContext)
    ├── WebPlatformCanvas (HTMLCanvasElement → IPlatformCanvas)
    ├── useCanvasInit / useCanvasCamera / useFixedCanvasInit
    └── 依赖: @banyuan/banvasgl + react (peerDep)

@banyuan/banvas-react-runtime  # Web 人机交互运行策略（原 banvas-runtime）
    ├── WebEventAdapter / ClickRecognizer / DragRecognizer
    └── 依赖: @banyuan/banvasgl-react + @banyuan/banvasgl
```

**约束：**

- IDrawingContext 覆盖 banvasgl 内部实际使用的 Canvas 2D API 子集，不追求完整覆盖
- IDrawingContext 的类型定义使用平台无关枚举（DrawingFillRule 替代 CanvasFillRule 等），不依赖 lib.dom
- IPlatformCanvas 的 toDataURL / toBlob 为可选方法——不是所有平台都支持
- 引擎通过 `App.createFromPlatform(platform)` 工厂接收平台注入，旧 `App.create(HTMLCanvasElement)` 保留为过渡兼容
- View 通过 `ICanvasHost.composite()` 执行双缓冲合成，不直接访问 OffscreenCanvas

**反例：**

- 方案 A：在 banvasgl 内部定义 WebCanvas 实现，通过条件编译切换——条件编译增加构建复杂度，且无法在类型层面阻止非 Web 代码使用 DOM 类型
- 方案 B：保留 CanvasRenderingContext2D 作为绘图抽象，仅抽象创建过程——CanvasRenderingContext2D 来自 lib.dom，使引擎始终依赖 DOM 类型声明，且渐变/图案/图像数据返回类型（CanvasGradient/CanvasPattern/ImageData）无法在非 DOM 环境表达
- 方案 C：使用 OffscreenCanvas 作为跨平台抽象——OffscreenCanvas 同样是 DOM 类型，Node.js 中不可用

**实施方案：** 本决策已在 banvasgl v0.1.0 中实施完成。@banyuan/banvasgl-react 包已创建。

---

## Rust 原生核心

### A9. Rust 原生核心迁移（提案）

**未实施** · refines A8b（平台抽象层使原生核心迁移成为可能）

A8b 的平台抽象接口（IDrawingContext / IPlatformCanvas / ICanvasHost）是天然的 FFI 边界。引擎核心的场景图遍历、布局计算、命中检测、FlowSchema 执行、动画插值等计算密集型操作可以从 TypeScript 迁移至 Rust，通过 WASM（Web）/ napi-rs（Node）/ UniFFI（移动端）暴露统一 C-ABI，不同平台注入各自的 IDrawingContext 实现。

**为什么是 Rust 而非 C++：**

| 维度 | Rust | C++ (Skia) |
|------|------|-------------|
| WASM 互操作 | wasm-bindgen 自动类型桥接，~200KB 产物 | Emscripten + CanvasKit ~3-8MB |
| Node 原生模块 | napi-rs 一行宏，12 架构预编译 CI | node-addon-api 手动绑定 |
| 移动端桥接 | UniFFI 自动生成 Swift/Kotlin | 手写 JNI + ObjC++ |
| 2D 渲染后端 | femtovg (GPU) + cosmic-text (文本) + kurbo (几何) | Skia (旗舰但构建复杂) |

**决策链：** A8b 定义平台无关接口 → IDrawingContext trait 可直接映射为 Rust trait → 引擎核心（Scene/View/Graph/Flow/Animation）从 TS 迁移至 Rust → 通过 wasm-bindgen 暴露 C-ABI → banvasgl-react 的 WebDrawingContext 继续作为 IDrawingContext 的 Web 实现，但引擎计算在 WASM 中执行 → Node 端通过 napi-rs 加载 .node 原生模块 → 移动端通过 UniFFI 生成 Swift/Kotlin 绑定。

**分阶段路线：**

| 阶段 | 时间 | 内容 |
|------|------|------|
| Phase 1：原型验证 | 1-2 月 | Rust workspace + wasm-bindgen；最小 Scene + Circle → render；性能对比 TS 版 1000 图形帧率 |
| Phase 2：核心迁移 | 3-4 月 | Graph (14 种) → View 体系 → Layout (flex/list/grid) → Flow 执行器 (25 种 NodeKind) → Camera/Animation |
| Phase 3：包整合 | 2-3 月 | @banyuan/banvasgl-native npm 包；RustPlatformCanvas 实现 IPlatformCanvas；banvasgl-react 新增 useNativeEngine 切换 |
| Phase 4：多平台 | 2-3 月 | WASM (web) + napi-rs (Node) + UniFFI (iOS/Android) |

**约束：**

- 保留 TypeScript 引擎版本的向后兼容——Rust 核心是可选的加速模式，通过 `useNativeEngine: true` 启用
- IDrawingContext trait 必须与 TypeScript 的 IDrawingContext 接口保持 1:1 语义映射
- Scene 序列化格式（JSON → FlatBuffers）需重新设计，以降低 WASM ↔ JS 数据传递开销
- Flow 执行器（25 种 NodeKind）是最大的单一迁移模块，但也是纯计算——编译后性能收益最大

**风险：**

- WASM ↔ JS 数据传递开销可能抵消计算收益（缓解：FlatBuffers 序列化，或 shared memory）
- Rust 学习曲线对团队的影响（缓解：Phase 1 原型阶段评估）
- 双代码库维护成本（缓解：TS 版本进入维护模式——只修 bug，不加新特性）

**反例：**

- 全量 C++ 迁移——Skia 构建系统（gn + 7MLOC）对 80 文件的引擎严重过度；WASM 产物 3-8MB 对 Web 部署不可接受
- 保持纯 TypeScript + 性能优化——引擎核心计算（布局/命中检测/Flow 执行）在 V8 中已高度优化，但跨平台（iOS/Android）仍需 JS 运行时，无法做到原生集成

**实施方案：** 待 Phase 1 原型验证后创建具体实施 spec。详见 [Rust 原生核心迁移 — 实施方案](../../specs/engine/rust-native-core.md)。

---

### A9a. 统一 2D / 3D GPU 渲染（提案，A9 后继）

**未实施** · refines A9（Rust 核心使 GPU 渲染成为可能）

A9 的核心收益不仅是「用编译型语言重写引擎计算逻辑」，更重要的是打开了 GPU 渲染的通道——因为 Rust 生态提供了从 GPU 驱动抽象（wgpu）到声明式 2D 渲染器（vello）到 3D 场景图（rend3）的完整链。这套链路可以让 banvasgl 在不改上层 API（`IDrawingContext` / `IRenderBackend`）的前提下，把渲染从 CPU Canvas 2D 升级到 GPU。

**五层架构：**

```
Level 5: 应用框架 — banvasgl-react / SwiftUI / Compose
         ↓ ISurface（窗口 surface 注入）
Level 4: 引擎核心 (Rust) — banvasgl-core
         场景树 / View 布局 / 命中检测 / Flow 执行 / 动画
         ↓ IRenderBackend trait（统一 2D+3D 渲染后端接口）
Level 3: 渲染后端 (Rust)
         ├── vello (2D GPU, 基于 compute shader)
         ├── rend3 (3D GPU, 基于 wgpu)
         └── tiny-skia (2D CPU 回退, 无 GPU 时自动降级)
         ↓ wgpu API
Level 2: GPU 抽象层 — wgpu (Rust, Google 主导)
         ┌─────────┬─────────┬──────────┬────────┐
         │  Metal  │ Vulkan  │ DirectX  │ WebGPU │
         │ macOS/  │ Linux/  │ Windows  │ 浏览器 │
         │   iOS   │ Android │          │ WASM   │
         └─────────┴─────────┴──────────┴────────┘
         ↓ OS 系统调用
Level 1: 操作系统 GPU 驱动 (AMD / NVIDIA / Intel / Apple)
```

**关键设计：引擎核心不直接对接 GPU。** Level 2 的 `wgpu` 已经抹平了 Metal / Vulkan / DirectX / WebGPU 的所有差异——一套 Rust trait 自动翻译成四种 GPU 后端。引擎只需要调用 Level 3 的渲染后端（vello / rend3），渲染后端内部调用 wgpu，wgpu 负责平台适配。开发者不需要写任何 `MTLDevice` / `VkDevice` / `ID3D12Device` 代码。

**2D + 3D 统一在一个场景中：**

上层 API 以 View 类型区分渲染维度，引擎核心统一调度，渲染后端混合执行：

```typescript
// 声明式 API：3D 场景容器 + 2D UI 叠加
<Scene3D>
  <ModelView src="product.glb" />       // rend3 处理
  <CombinedView>                         // vello 处理
    <TextView text="产品详情" />
  </CombinedView>
</Scene3D>
```

对应的 Rust 侧渲染 trait：

```rust
/// 统一渲染后端 trait（扩展自 2D 后端）
pub trait RenderBackend {
    // ── 2D 部分（无论何时都可用）──
    fn begin_2d_pass(&mut self);
    fn draw_path(&mut self, path: &Path, style: &Style2D);
    fn draw_text(&mut self, text: &str, font: &Font, position: Point2);
    fn end_2d_pass(&mut self);

    // ── 3D 部分（有 GPU 时可用，CPU 回退时返回 Unsupported）──
    fn begin_3d_pass(&mut self, camera: &Camera3D, lights: &[Light]) -> Result<(), GpuError>;
    fn draw_mesh(&mut self, mesh: &Mesh, material: &Material, transform: &Matrix4);
    fn end_3d_pass(&mut self);
}
```

**决策链：** A8b（平台抽象）→ A9（Rust 迁移）→ A9a（统一 2D/3D GPU 渲染）。A9 建立了 Rust 核心，A9a 在 Rust 核心的基础上选择 wgpu 作为 GPU 抽象层，vello + rend3 作为渲染后端，tiny-skia 作为 CPU 降级方案。

**约束：**

- `IRenderBackend` 是引擎核心的内部 trait，不暴露给上层——上层仍通过 `IPlatformContext` 注入 surface，引擎内部自动选择 GPU / CPU 后端
- 浏览器通过 WebGPU（Chrome 113+, Edge 113+）获得 GPU 加速；不支持的浏览器自动降级到 tiny-skia → Canvas 2D
- 2D 部分 API 必须向后兼容——现有的 `IDrawingContext` 调用路径不变，仅在引擎内部重定向到 vello 的渲染通道
- 3D 功能是可选的——不引入 3D View 类型时，引擎编译产物不包含 rend3 依赖

**风险：**

- WebGPU 浏览器覆盖率目前约 75%（Chrome + Edge + Opera），Firefox 和 Safari 仍在实现中——需要可靠的 CPU 降级路径
- vello 仍处于较早期阶段（0.x 版本），API 可能变动
- 3D 渲染（rend3）与 2D UI（vello）的深度排序（z-order）需要引擎层统一管理——不能简单地把 2D 画在 3D 之上

**反例：**

- 在 TypeScript 层做 GPU 渲染——Three.js 等方案成熟，但无法与引擎的状态管理（Flow/动画/布局）深度集成，且多线程渲染受阻于 JS 单线程
- 使用 Skia 的 GPU 后端——Skia 同样通过 Metal/Vulkan/DX 提供 GPU 渲染，但其 Rust 绑定不成熟，构建复杂度高，且与 Rust 生态（wgpu/vello/cosmic-text）不兼容

**实施时机：** A9 Phase 2（引擎核心迁移）完成后、Phase 3（包整合）之前。原型可以单独验证：在 `crates/banvasgl-render/` 中实现 `vello` 后端，用 A9 的 `Scene + Circle` 场景验证 GPU 渲染帧率。
