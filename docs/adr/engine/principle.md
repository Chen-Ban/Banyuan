# 引擎 · 原则级决策

> 遇到取舍时怎么选——引擎开发中的设计原则与权衡标准。

---

## 决策依赖图

```
┌───────────────────────────────────────────────────────────────┐
│  P1 最小化 AI 决策空间（贯穿性设计哲学，影响所有子系统）       │
└────────┬──────────────────────┬───────────────────┬───────────┘
         │ drives               │ drives            │ drives
         │                      │                   │
┌────────▼────────────┐  ┌─────▼──────────┐  ┌─────▼──────────────┐
│ P2 layoutMode 扩展   │  │ P3 FlowSchema  │  │ P4 固定事件集       │
│ 不新增 ViewType      │  │ 前后端一致性    │  │ 不允许自定义事件名   │
└─────────────────────┘  └────────────────┘  └────────────────────┘

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐
│ P5 渲染正确性>性能   │  │ P6 单向数据流        │  │ P7 引擎纯净原则          │
│  （渲染层根本原则）   │  │  （数据管理根本原则） │  │  （架构边界守护）         │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────────┘
           │ enables                │ enables                 │ enables
┌──────────▼──────────┐  ┌─────────▼───────────┐  ┌──────────▼──────────────┐
│ P5a 像素级三态一致   │  │ P6a 禁止直接修改     │  │ P7a Flow 子模块后端     │
│                      │  │ View 属性            │  │ 可独立运行              │
└─────────────────────┘  └─────────────────────┘  └─────────────────────────┘

┌─────────────────────────────────────┐
│ P8 Delegate 模式解耦交互与宿主       │
└─────────────────────────────────────┘
```

关系说明：

- **engine:A0 是 banvasgl 定位与机制/策略分离的根契约**，本文件中 P5a（三态一致）、P7/P7a（引擎纯净）、P10（Delegate 模式）均 refines A0——它们都是 A0「runtime 只提供机制、策略由上层注入」契约在原则层的展开
- P1 是贯穿性设计哲学，直接驱动 P2（布局扩展策略）、P3（FlowSchema 一致性）、P4（固定事件集）
- P5→P5a：渲染正确性原则衍生出三态像素级一致的具体要求（P5a 同时 refines engine:A0）
- P6→P6a：单向数据流原则衍生出禁止直接修改属性的具体约束
- P7→P7a：引擎纯净原则衍生出 Flow 后端可独立运行的具体要求（P7/P7a 同时 refines engine:A0）
- P8 独立：Delegate 模式是交互子系统的设计原则
- P10（Delegate 模式）是 A0 机制/策略分离在交互维度的原则化身（refines engine:A0）

---

## 设计哲学

### P1. 最小化 AI 决策空间

**✅ 已实施**

引擎设计优先让 AI 生成时的决策空间尽可能小：统一容器 + layoutMode（不让 AI 选 ViewType）、固定 13 个事件（不让 AI 定义事件名）、FlowSchema 节点集有限枚举。

**决策链：** AI 生成准确率与选项数成反比 → 每减少一个可选维度，AI 生成的正确率就提升 → 引擎提供"刚好够用"的选项集，不提供灵活到 AI 无法把控的自由度。

**约束：**

- 新增 ViewType / Event / FlowNode kind 需要同时评估对 AI 生成准确率的影响
- 优先复用已有抽象（如 layoutMode 值扩展），而非新增顶层概念
- 复杂逻辑在 FlowSchema 内部组合（subFlow / condition / loop），不在 API 层暴露

---

### P2. 布局是行为，不是身份——新布局以 layoutMode 扩展，不新增 ViewType

**✅ 已实施** · 由 P1 驱动

核心哲学：**CombinedView 对标 HTML 的 `<div>`——一个通用容器，布局方式由 CSS 属性（layoutMode）决定，而非由元素标签（ViewType）决定。** 正如 Web 不会为 flex 布局发明 `<flex-div>` 标签，BanvasGL 也不为每种布局新增独立 ViewType。

**决策链：** 早期每种布局都是独立的 ViewType（曾设想 FlexView、ScrollView、ListView、GridView 为独立类型）→ 跨研究 Flutter/SwiftUI/Figma/Retool 发现：每新增一个独立 ViewType，维护成本呈线性增长（序列化/反序列化、AI Projection、属性面板适配、物料注册、工具协议、PropertyAdapter 全部需要新增分支）→ 核心洞察：布局是容器内子元素的排列策略，正交于容器本身的身份 → 统一为 CombinedView + layoutMode 枚举 + 策略模式。

**演进约束（为什么不后补）：** ViewType 一旦持久化到用户数据（pages JSON）中就无法轻易废弃——哪怕只有一个用户使用了某个 ViewType，它在引擎中就必须永久保留。因此"先加类型后收窄"的策略不可行，必须在架构层面从一开始就控制 ViewType 增长。

**约束：**

- 新增 layoutMode 需要同时实现对应的 LayoutStrategy
- AI Projection 转换器需同步更新以支持新 layoutMode
- 现有代码中 FlexView 作为历史实现保留，新代码不得新增同类
- 引擎原语判定标准（满足任一才值得新增 ViewType 而非 layoutMode）：布局算法不可组合性、性能不可替代性（如虚拟化需与渲染管线深度集成）、约束传递特殊语义

---

### P3. FlowSchema 前后端一致性原则

**✅ 已实施** · 由 P1 驱动

同一份 FlowSchema JSON 在前后端的语义必须保持一致：节点图拓扑相同、变量传递规则相同，仅可用节点集合不同。

**决策链：** 低代码产品中，用户在前端编辑的流程会部分在后端执行（云函数）→ 如果语义不一致会导致行为不可预测 → 统一核心执行语义，仅在节点注册表层面区分环境。

**约束：**

- FlowContext 的变量作用域规则前后端一致（scoped + global）
- condition 节点的表达式求值逻辑一致
- edge 的路由规则（default / conditional）一致
- 前后端差异只体现在节点集合（client 节点 vs server 节点）

---

### P4. 固定事件集，不允许自定义事件名

**✅ 已实施** · 由 P1 驱动

View 的事件处理器固定为 13 个预定义事件名，不允许用户或 AI 自定义事件名。

**决策链：** 自定义事件名 → AI 需要"发明"事件名 → 命名不一致导致绑定失败 → 固定枚举消除这一自由度。

**约束：**

- 13 个事件：onClick / onLongPress / onDoubleClick / onChange / onFocus / onBlur / onScroll / onSwipe / onDragStart / onDragEnd / onInput / onSubmit / onSelect
- 新增事件需要引擎版本升级，不能由用户动态添加
- 事件语义明确，AI 只需选择"哪个事件触发哪个 FlowSchema"

---

## 渲染层

### P5. 渲染正确性 > 极致性能

**✅ 已实施**

当正确性与性能发生冲突时，引擎优先保证渲染结果正确（像素级一致），在正确性满足后再做性能优化。

**决策链：** 低代码产品的核心体验是"所见即所得" → 设计态与预览态的视觉偏差会直接破坏用户信任 → 性能可以逐步优化，但正确性问题一旦出现就是 Bug。

**约束：**

- 不因为渲染优化而跳过 dirty view 的重绘
- 文本换行、对齐、溢出处理必须与产物（线上态）一致
- DPR 缩放在渲染时精确应用，不做四舍五入近似

---

### P5a. 三态像素级一致

**✅ 已实施** · 由 P5 衍生 · refines engine:A0

编辑态、预览态、线上态的渲染结果必须像素级一致（在相同 DPR 和视口尺寸下）。

> **A0 机制/策略定位：** 三态能像素级一致，根因正是 A0 机制/策略分离——渲染是 banvasgl 运行时提供的**单一机制**（同一 Renderer、同一套渲染逻辑），三态之间的差异全部在**策略层**（编辑/预览/线上注入不同的 InteractionCapability 与 flowEnabled 取值），机制层零分叉，故必然像素级对齐。

**决策链：** A0 渲染机制单一、策略外置 → 用户在编辑态看到的效果就是最终产物 → 三态使用同一个 Renderer + 同一套渲染逻辑（机制层不分叉）→ 差异仅在交互/流程的策略层（注入不同 Capability 集与 flowEnabled）。

**约束：**

- 三态共享同一个 Canvas2DRenderer 实现
- 字体渲染、图片缩放、圆角裁剪逻辑完全相同
- 线上态不做任何"简化渲染"优化
- 三态差异只允许出现在策略层（交互能力集 + flowEnabled），不允许渗入渲染机制层

---

## 数据管理

### P6. 单向数据流：操作 → 事务 → 渲染

**✅ 已实施**

用户操作（鼠标/键盘/AI 指令）产生 mutation 请求 → TransactionManager 记录并应用 → 标记 dirty → 下一帧渲染。

**决策链：** 双向绑定易导致循环触发和状态不一致 → 单向数据流便于推理和调试 → 事务化使得每步变更可追溯。

**约束：**

- 禁止直接修改 View 属性（必须通过 TransactionManager 或封装的 action）
- 渲染是被动的——只在 dirty 时才触发重绘
- 事务 commit 后触发 onChange 事件，订阅者可做持久化/同步

---

### P6a. 禁止直接修改 View 属性

**✅ 已实施** · 由 P6 衍生

任何对 View 属性的修改必须通过 TransactionManager 或 actions 层封装的操作函数，禁止直接赋值。

**决策链：** 直接赋值绕过事务 → 无法撤销 → 无法追踪变更来源 → 破坏单向数据流。

**约束：**

- View 属性的 setter 仅在 TransactionManager 内部调用
- actions 层是外部修改 View 的唯一合法入口
- AI 工具协议通过 actions 层操作，同样受事务管理

---

## 架构边界

### P7. 引擎纯净原则：宿主环境依赖通过 hook/peerDep 隔离

**✅ 已实施** · refines engine:A0

`@banyuan/banvasgl` 作为图形运行时核心包，不直接依赖 React/DOM 等宿主环境 API。宿主集成通过 React hook 层实现并声明为 peerDependency。

> **A0 机制/策略定位：** 「引擎纯净」是 A0「runtime 只提供机制、不内置策略」在依赖维度的展开——纯净 = 机制纯净。运行时只暴露与宿主无关的机制（渲染/几何/命中/FlowSchema 执行），既不烧死宿主框架依赖，也不内置高层交互策略；宿主框架适配（hook）与高层策略（编辑/运行）都由上层注入。这同时为未来抽取 banvas-core 预留了干净的机制边界。

**决策链：** A0 runtime 只提供机制 → 机制不应绑定特定宿主（引擎可能在非 React 环境如 Vue、纯 Node.js 测试中运行）→ 硬依赖宿主框架限制可移植性、违背机制纯净 → 通过接口注入或 hook 层桥接，策略与宿主适配均外置。

**约束：**

- packages/ 下的库包禁止 `import 'react'` 或 `import 'react-dom'`（hook/ 目录除外，声明为 peerDep）
- Canvas DOM 元素由宿主通过 hook 创建后传递给 App/Renderer
- InteractionStateMachine 零 DOM 依赖，事件由宿主转发
- 机制纯净不止于「无宿主依赖」，还包括「不内置高层交互策略」——编辑状态机（banyan）/运行态高级交互识别（banvas-runtime）不下沉进内核（呼应 A0）

---

### P7a. Flow 子模块后端可独立运行 + 仅暴露预设工厂

**✅ 已实施** · 由 P7 衍生 · refines engine:A0

`@banyuan/banvasgl/flow/server` 在 Node.js 环境下直接运行，无 DOM、无 Canvas、无 React 依赖。外部消费者通过 `createServerFlowRunner()` 工厂函数获取完整配置的 Runner 实例，不允许自由组装内部组件。

> **A0 机制/策略定位：** FlowSchema 执行是 A0 明确归属 banvasgl 运行时的**机制**。runtime ⊃ rendering 意味着流程执行机制可独立于渲染机制存在——后端只取流程执行机制、不取渲染机制，正是 A0「机制可按入口分层取用」的物理体现。

**决策链：** A0 FlowSchema 执行是 banvasgl 机制且 runtime ⊃ rendering → 后端云函数只需流程执行机制、不需渲染机制 → 不能因执行 FlowSchema 而引入图形运行时的渲染层代码 → tsup splitting 保证 flow/server 入口独立打包 → 但不应暴露内部实现（FlowRunner 类、NodeExecutorRegistry、各执行器），只暴露预组装工厂。

**公开 API 边界（4 个子路径导出）：**

- `@banyuan/banvasgl` — 主入口，导出所有 Flow 类型（FlowSchema/FlowNode/FlowContext 等），因为 View.events 类型就是 FlowSchema
- `@banyuan/banvasgl/react` — React Hook 层
- `@banyuan/banvasgl/flow/client` — 仅导出 `createClientFlowRunner()` 工厂
- `@banyuan/banvasgl/flow/server` — 仅导出 `createServerFlowRunner()` 工厂

**约束：**

- flow/server 的依赖链中不包含任何浏览器 API
- ServerFlowContext 注入 db 和 httpClient，不注入 App/Scene/View
- 可在纯 Node.js 环境中 `import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server'` 并执行
- 不存在 `@banyuan/banvasgl/flow` 公开子路径——内部组件（FlowRunner、NodeExecutorRegistry、各执行器）不对外暴露
- 外部不可自行 `new FlowRunner(registry)` 组装，必须通过预设工厂获取实例

---

## Addon 管线

### P9. 声明式管线分发——Addon 只描述参与哪些管线，引擎统一调度

**✅ 已实施**

核心思想：**Addon 不主动"监听"管线事件，而是声明自己参与哪些管线阶段，由引擎侧统一的管线调度器按序分发。** 这避免了观察者模式下的注册顺序问题和多 Addon 竞态问题。

**类比：** 类似 GPU 图形管线的固定阶段（vertex → fragment → output），BanvasGL 的渲染管线和命中测试管线也有固定阶段顺序。Addon 相当于在特定阶段插入的 shader——它只声明"我在哪个阶段参与"，管线调度器保证调用顺序。

**为什么不用事件监听：** 早期曾考虑让 Addon 自行 addEventListener 监听 render/hitTest 事件 → 问题暴露：多个 Addon 同时参与渲染时调用顺序不可控（BoundingBox 应在 BoxDecoration 之后绘制）；Addon 卸载时需手动 removeEventListener，遗漏导致内存泄漏 → 改为声明式注册 + 引擎端确定性调度。

**约束：**

- Addon 通过静态描述声明参与的管线阶段，不直接操作调度器
- 管线阶段有固定执行顺序，引擎保证该顺序
- 新增管线阶段需修改调度器而非各 Addon
- Addon 组合产生的交互由调度器负责协调（如 BoundingBox 绘制时间点）

---

## 交互设计

### P10. Delegate 模式解耦交互逻辑与宿主环境

**✅ 已实施** · refines engine:A0

InteractionStateMachine 通过 InteractionDelegate 接口声明所有外部能力需求（如获取选中状态、修改 View 位置、触发事务），由宿主注入实现。

> **A0 机制/策略定位：** Delegate 模式是 A0 机制/策略分离的统一手法——交互状态机是上层**策略**，它通过 Delegate 接口向下声明对 banvasgl **机制**（几何操作、事务、选区原语）的需求，机制由运行时/宿主侧注入实现。状态机本身不持有 View/Scene，正是策略与机制解耦的边界。

**决策链：** A0 机制/策略分离 → 交互逻辑（策略）需要操作 View 和 Scene（机制对象）→ 但策略不应直接持有机制层引用 → Delegate 模式让状态机只描述“需要什么机制能力”，由运行时/宿主提供实现。

**约束：**

- InteractionDelegate 接口定义了所有交互操作的抽象方法
- 状态机内部只调用 delegate 方法，不直接操作 View/Scene
- 不同宿主（编辑态/预览态）可注入不同的 delegate 实现
- 测试时可注入 mock delegate，无需真实 Canvas 环境
