# 三态统一引擎，hook 层区分行为 — 实施方案

## 关联决策

- **域 / 粒度 / 标题**：engine / architecture / **A8a. 三态统一引擎，hook 层区分行为**
- **上位定位**：**A0. banvasgl 定位为「面向声明式 UI 的 2D 图形运行时（含流程控制）」** —— 本方案是 A0「机制/策略分离契约」在三态场景下的直接落地。
- **决策链回顾**：产品需要"设计 → 预览 → 发布"完整链路 → 曾尝试独立 runtime 包但从未落地 → 核心洞察：三态差异仅在「交互策略」与「FlowSchema 是否执行」，二者都不是引擎机制本身 → banvasgl 作为运行时只提供机制（原子事件 / 命中检测 / 几何变换 / FlowSchema 执行 / `flowEnabled` gate），三态差异由上层注入不同策略表达。
- **上游依赖**：A0（根定位 / 机制策略契约）、A8（宿主集成层 / hook）、A3（InteractionStateMachine + Delegate）、A5b（前后端执行器隔离，提供 `createClientFlowRunner`）

---

## 机制 / 策略分离视角（方案纲领）

本方案的每一个分层归属判断都从 A0 契约「banvasgl 提供机制，上层提供策略」机械推导，不再各自零散论证。三态的本质差异不在引擎，而在**上层注入了何种策略**：

| 能力                                                                                                           | 性质         | 归属                      | 理由（来自 A0）                                                               |
| -------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- | ----------------------------------------------------------------------------- |
| 原子事件（pointerdown/move/up、keydown/up）、命中检测、几何变换                                                | 机制         | `@banyuan/banvasgl`       | 「如何感知输入、如何命中、如何变换图形」的底层能力，与场景无关                |
| FlowSchema 执行（FlowRunner）                                                                                  | 机制         | `@banyuan/banvasgl`       | 「如何执行一段声明式流程」的底层能力                                          |
| `flowEnabled` gate                                                                                             | 机制         | `@banyuan/banvasgl`       | 「是否放行流程执行」的统一开关原语，由上层按三态语义置值                      |
| InteractionStateMachine（10 态编辑状态机）                                                                     | **编辑策略** | `banyan/frontend`         | 「把原子事件解释成设计稿编辑操作」的规则，只服务编辑态                        |
| 运行态高级交互识别（把原子事件序列解释成 click/dblclick/drag/focus 等 View.events 语义）+ 事件→FlowSchema 派发 | **运行策略** | `@banyuan/banvas-runtime` | 「把原子事件解释成终端用户交互并触发对应 View.events」的规则，服务预览/线上态 |

**一句话推论**：三态共享同一套机制（banvasgl），差异仅是「注入哪种策略 + `flowEnabled` 取何值」。编辑态注入编辑策略且 `flowEnabled=false`；预览/线上态注入运行策略且 `flowEnabled=true`，预览与线上再以注入配置（数据来源 / callFlow 端点）区分。

> **关键澄清（本次修订重点）**：运行态「把原子事件解释成高级交互并派发到 View.events」是**运行策略**，与编辑态的 InteractionStateMachine 完全对称——一个把原子事件解释成「设计稿编辑动作」，一个把原子事件解释成「终端用户交互语义」。两者都不属于 banvasgl 机制层。因此承载它的 hook **不能**放在 banvasgl，而必须随运行策略包 `@banyuan/banvas-runtime` 一起进入用户产物。`@banyuan/banvasgl-react` 提供纯机制的 `useCanvasInit`（初始化画布、暴露 actions 与原子事件回调）。

---

## banvasgl 暴露的原子事件契约（机制层边界 + 跨平台设计目标）

A0 反复提到「原子事件」，但此前未列清单，也未从跨平台目标论证其字段设计。本节先固化**当前代码现状**，再依据业界标准给出**跨平台目标契约**与现状缺口。

### 设计纲领：原子事件必须硬件无关（hardware-agnostic）

业界三大跨平台框架对「底层输入」的定义高度一致——**用一个硬件无关的「指针（pointer）」抽象，把鼠标 / 触摸 / 触控笔归一化成同一套底层事件，设备差异降级为「附加属性」而非「不同事件类型」。**

- **W3C Pointer Events**（权威标准）：一套 `pointerdown/pointermove/pointerup/pointercancel` 取代分裂的 `mouse*` 与 `touch*`；设备差异放进属性 `pointerType('mouse'|'touch'|'pen')` / `pointerId`（多指靠 id 区分）/ `pressure` / `tiltX/tiltY`。
- **Flutter**：明确分两层——第一层「原始指针事件」`PointerDownEvent/PointerMoveEvent/PointerUpEvent/PointerCancelEvent`（硬件无关，描述触摸/鼠标/笔的位置移动），第二层「手势/语义识别」由 GestureDetector + Gesture Arena 把指针序列识别成 onTap/onPan 等语义。
- **React Native**：Gesture Responder System 底层是归一化 touch 事件，PanResponder 在其上「把多次触摸调和成单个手势」。

**收口点原则**：上层所有识别器与 View.events 只认归一化的原子 pointer 事件；换平台时只改「原生事件 → 原子事件」的**适配器（adapter）一层**，识别器与 View.events 零改动。这正是「一套逻辑、桌面/移动/笔三端跑」的本质，也是 banvasgl 跨平台目标的机制层基石。

### 当前代码现状（`packages/banvasgl/src/types/interaction.ts`）

banvasgl 通过 `InteractionInput` 判别联合对上层暴露**五种原子输入**：

| 原子输入 type | 当前字段                                                         | 语义     |
| ------------- | ---------------------------------------------------------------- | -------- |
| `pointerdown` | worldPoint, clientX, clientY, button, multiSelect                | 指针按下 |
| `pointermove` | worldPoint, clientX, clientY, canvasWidth, canvasHeight, ctrlKey | 指针移动 |
| `pointerup`   | worldPoint, clientX, clientY                                     | 指针抬起 |
| `keydown`     | code, repeat                                                     | 键按下   |
| `keyup`       | code                                                             | 键抬起   |

命名虽对齐 W3C（`pointer*`），但**字段悄悄绑死了桌面鼠标/键盘假设**，并非真正硬件无关。

### 跨平台目标契约（全量对齐 W3C Pointer Events）

目标覆盖桌面 + 移动触摸 + 触控笔，原子事件字段须从此目标反推。把上表逐字段对照 W3C，「字段绑死桌面」具体暴露为四个缺口——前两个是**缺能力**（移动/笔做不出），后两个是**多杂质**（桌面专属语义混入）与**缺精度**（笔的高级属性缺失）：

| #   | 缺口                                                         | 类型   | 业界依据                                                                                                                  | 影响                                                               |
| --- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| G1  | 缺 `pointerType`（'mouse'\|'touch'\|'pen'）/ `pointerId`     | 缺能力 | W3C 用 pointerType 区分设备、pointerId 区分多指                                                                           | 无法区分输入设备，**多指能力被从根上堵死**（pinch/多指旋转做不出） |
| G2  | 缺 `pointercancel` 原子事件                                  | 缺能力 | W3C / Flutter 均列为必备                                                                                                  | 触摸/笔场景系统强制取消（来电、手势冲突、滚动接管）时状态机会卡死  |
| G3  | `multiSelect` / `ctrlKey` 是编辑策略派生字段，却混入原子事件 | 多杂质 | `multiSelect`（ctrl/cmd 多选）、`ctrlKey`（等比缩放）都是**桌面编辑策略**从修饰键派生的语义，不该出现在硬件无关原子事件里 | 编辑语义泄漏进机制层，污染跨平台与第三方复用                       |
| G4  | 缺 `pressure` / `tiltX/tiltY`（可选）                        | 缺精度 | W3C pen 输入标准属性                                                                                                      | 触控笔笔锋/压感类能力无入口                                        |

> `button`（鼠标左/中/右键）**不在缺口之列**——它是 W3C 标准的硬件无关属性，触摸端缺省即可，目标契约里保留它，只是从必填降级为可选（见下方草案 `button?`）。真正的杂质只有 `multiSelect`/`ctrlKey` 这两个由修饰键派生的编辑策略字段。

**目标 `InteractionInput`（设计草案，本轮不改代码）：**

```ts
interface PointerInputBase {
  worldPoint: Point3;
  clientX: number;
  clientY: number;
  pointerId: number; // G1：多指/多设备区分
  pointerType: "mouse" | "touch" | "pen"; // G1：硬件无关的设备标签
  pressure?: number; // G4：0~1，鼠标恒 0.5/0，笔/触摸真实压感
  tiltX?: number;
  tiltY?: number; // G4：触控笔倾角
}
interface PointerDownInput extends PointerInputBase {
  type: "pointerdown";
  button?: number;
} // G3：button 降级为可选属性
interface PointerMoveInput extends PointerInputBase {
  type: "pointermove";
}
interface PointerUpInput extends PointerInputBase {
  type: "pointerup";
}
interface PointerCancelInput extends PointerInputBase {
  type: "pointercancel";
} // G2：新增
interface KeyDownInput {
  type: "keydown";
  code: string;
  repeat: boolean;
}
interface KeyUpInput {
  type: "keyup";
  code: string;
}

type InteractionInput =
  | PointerDownInput
  | PointerMoveInput
  | PointerUpInput
  | PointerCancelInput
  | KeyDownInput
  | KeyUpInput;
```

要点（对应上表三类缺口的处置）：

- **移杂质（G3）**：`multiSelect` / `ctrlKey` **移出原子事件**——它们是修饰键派生的**策略语义**，应由上层（编辑态 banyan）在识别时从 `keydown`/`keyup` 维护的修饰键状态自己推导，不属硬件无关输入。
- **上下文外移**：`canvasWidth/canvasHeight`（pan 计算需要）不是策略语义、而是画布**环境上下文**，同样不该塞进描述单次指针的原子事件，宜由 Delegate 注入。
- **保留 `button`（非缺口）**：`button` 是硬件无关属性，保留但降级为可选——触摸/笔端可缺省；右键语义（onContextMenu）由上层根据 `button===2` 或长按规则识别。
- **设备差异降为属性（G1）**：桌面端 hover 由「鼠标产生连续 `pointermove`」天然表达，触摸端无 hover——这是设备差异，由 `pointerType` 区分后上层决定是否派发 enter/leave，**不在机制层制造两套事件**。

机制层（banvasgl）职责（不变）：(1) **定义** `InteractionInput` 契约类型并**接收**已归一化的原子输入（注意：banvasgl 本身平台无关，**不接触原生 DOM/touch 事件，也不做归一化**——归一化是上层适配器的活，见下节）；(2) 命中检测 `actions.view.hitTest(point) → IInteractResult` / `hitTestAll` / `hitTestDetailed`；(3) 几何变换原语（经 `InteractionDelegate` 27 个方法暴露）；(4) FlowSchema 执行入口 `Scene.triggerSchema` 与 `flowEnabled` gate。

banvasgl **不**定义 click、双击、长按、拖拽、pinch 等高级语义——这些都是「把原子事件序列按某种规则解释」的策略，归上层。

> **本轮范围**：以上为跨平台目标设计契约（写进 spec / ADR 固化方向），`InteractionInput` 的字段重构属机制层契约变更，会牵连各上层适配器（编辑态 `useInteraction`、运行态 banvas-runtime 适配器）与 InteractionStateMachine，G1/G2/G4 + canvasWidth 外移的落地步骤见 `docs/specs/engine/atomic-event-cross-platform.md`，本轮不改代码。

### 平台适配落点：归一化在 banvas-runtime，不在 banvasgl

「把原生事件翻译成 `InteractionInput`」这一步**不属于 banvasgl 机制层**——banvasgl 是平台无关的纯机制，它只定义 `InteractionInput` 契约并接收已归一化的输入。真正做归一化（适配）的是**消费方所在的层**，且**只有 banvas-runtime 需要跨平台适配**：

|            | 编辑态（banyan/frontend）                                | 用户应用（banvas-runtime，预览/线上）                                     | banvasgl（机制层）             |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| 运行平台   | 仅 PC Web                                                | PC / 移动 / 触控笔                                                        | 平台无关                       |
| 是否做适配 | 做，但**退化**：仅 mouse/key 直译，**无 touch/pen 分支** | **做：唯一的跨平台适配点**，mouse + touch + pen → 统一 `InteractionInput` | **不做**，只接收已归一化的输入 |
| 适配落点   | `useInteraction`（DOM mouse/key → InteractionInput）     | banvas-runtime 内的输入适配器 + 识别器                                    | —                              |
| 适配之上   | InteractionStateMachine（编辑策略）                      | 识别器 + View.events + FlowSchema（**平台无关，一套跑三端**）             | hitTest / triggerSchema        |

要点：

- **跨平台适配只发生在 banvas-runtime 这一个包里**。banvasgl（往下）平台无关，用户写的 View.events / FlowSchema（往上）平台无关，分叉全部被 banvas-runtime 吃掉。
- banvas-runtime 内部再分两小层消化差异：底层「原生事件→InteractionInput」翻译（吃 mouse/touch/pen 的形态差异）+ 上层识别器（吃 hover 不派发、长按当右键这类**语义级**差异，靠少量 `pointerType`/`button` 分支）。对用户而言这两层都封装在 runtime 包内，用户无感。
- **编辑态不在跨平台范围内**：编辑器永远是 PC Web，`useInteraction` 的适配退化成最简单的 mouse/key 直译，没有 touch/pen 分支——这也是为什么三态里只有用户应用（运行态）讨论跨平台。

---

## View.events 契约（高级交互的落点，必须与代码对齐）

运行策略层识别出的高级交互最终要派发到 `View.events`。依据 `packages/banvasgl/src/types/view/view.ts` 的 `IViewEvents` 真实定义，View 暴露 **13 个桌面端交互事件**（注意：当前是桌面鼠标/键盘事件模型，不是触摸手势模型）：

| 分类       | 事件键          | 触发语义                                 |
| ---------- | --------------- | ---------------------------------------- |
| 点击类     | `onClick`       | mousedown + mouseup 在同一 View 上抬起   |
|            | `onDoubleClick` | 短时间内连续点击两次                     |
|            | `onContextMenu` | 右键点击（或长按触发上下文菜单）         |
| 鼠标移动类 | `onMouseEnter`  | 指针首次进入 View 命中区（不冒泡）       |
|            | `onMouseLeave`  | 指针离开 View 命中区（不冒泡）           |
|            | `onMouseMove`   | 指针在命中区内移动（高频，慎用复杂逻辑） |
|            | `onMouseDown`   | 按键在 View 上按下                       |
|            | `onMouseUp`     | 按键在 View 上抬起                       |
| 拖拽类     | `onDragStart`   | mousedown 后移动超阈值触发               |
|            | `onDrag`        | 拖拽进行中（高频）                       |
|            | `onDragEnd`     | mouseup 时触发                           |
| 焦点类     | `onFocus`       | View 获得焦点（仅可聚焦 View 如 Input）  |
|            | `onBlur`        | View 失去焦点                            |

每个事件的类型是 `EventHandler = FlowSchema | null`。另有 3 个生命周期钩子 `IViewLifetimes`：`onCreated` / `onAttach` / `onDestroy`，同为 `FlowSchema | null`。

> 若未来要支持移动端触摸手势（longpress / swipe / drag-sort 等），需先在 `IViewEvents` 增加对应事件键并更新本表与 ADR M17，再由 banvas-runtime 实现识别。本方案暂以现有桌面事件模型为准，不臆造代码中不存在的事件。

---

## 原子事件 → 高级交互 → View.events 映射链（运行策略层职责）

运行策略层（`@banyuan/banvas-runtime`）的核心工作是把机制层的原子事件序列解释成 View.events 语义并触发 FlowSchema。映射链如下：

```
banvasgl 机制层                banvas-runtime 运行策略层            banvasgl 机制层
─────────────────             ──────────────────────────         ─────────────────
pointerdown/up（同点无位移） →  解释为 click                  →  view.events.onClick     → triggerSchema
两次 pointerdown/up（间隔阈值内）→ 解释为 doubleclick            →  view.events.onDoubleClick → triggerSchema
pointerdown(button=2) 或长按  →  解释为 contextmenu            →  view.events.onContextMenu → triggerSchema
pointerdown→move(超阈值)→up    →  解释为 dragstart/drag/dragend →  view.events.onDrag*      → triggerSchema
pointermove 跨命中边界(仅mouse) →  解释为 enter/leave           →  view.events.onMouseEnter/Leave → triggerSchema
（可聚焦 View 命中 + 焦点切换）→  解释为 focus/blur            →  view.events.onFocus/onBlur → triggerSchema
```

每一步「解释」都是策略：阈值、时序、命中边界判定规则都由 banvas-runtime 决定，banvasgl 只提供原子输入与 hitTest。识别出目标 View 与事件键后，统一走 `scene.triggerSchema(view, view.events[eventKey], [interactionPayload])`，再由 `flowEnabled` gate 决定是否执行。表中 contextmenu（右键 `button===2` **或**长按）与 enter/leave（仅 `pointerType==='mouse'` 派发）即「同一 View.events 由不同平台的原子事件路径产出」的实例——平台分叉收敛在识别器内的少量 `pointerType`/`button` 分支，不向上扩散。

### 原子事件与 View.events 的内在联系（一层物理输入，一层语义解释）

二者不是改名关系，而是**同一交互的两层抽象，通过「识别 / 解释」连接**，三条本质关系：

1. **多对多映射，非一一对应**：一个 `onClick` = `pointerdown + pointerup（同点无位移）`（2 个原子事件 + 1 条规则）；一个 `onDrag` = `pointerdown + N×pointermove（超阈值）+ pointerup`（N+2 个原子事件 + 阈值规则）；一个 pinch（未来）= `2×pointerId 的 pointermove`（多原子事件 + 双指距离变化规则）。原子事件是**离散物理输入**，View.events 是**带时序/几何/命中语义的解释结果**。
2. **原子事件层决定 View.events 的能力天花板**：若原子事件不采集 `pointerType/pointerId/pressure`，则 View.events 永远做不出多指缩放、压感笔锋——这正是跨平台目标必须**从原子事件层埋字段**的根因，不能等到 View.events 层补救。
3. **跨平台收口点在原子事件层（适配器落在 banvas-runtime，不在 banvasgl）**：所有识别器、所有 View.events 只认归一化 `InteractionInput`，换平台只改 banvas-runtime 内那一个输入适配器。这把「平台差异」隔离在 banvas-runtime 包内（往下的 banvasgl 平台无关、往上的 View.events + FlowSchema 平台无关），用户应用一套代码跑三端。

### View.events 的命名是纯审美，与跨平台无关

需要澄清一个易混点：**View.events 叫 `onClick` 还是 `onTap` 是纯命名审美，不是跨平台议题。** 原因前述适配模型已经给出——View.events 消费的是 banvas-runtime **已归一化**的原子事件，它与"外部是什么平台"之间隔着适配器这一层，平台差异早在适配器/识别器里被吃掉了。所以无论事件键叫什么名字，跨平台能力都不受影响，只要**全局统一命名**即可。

因此命名只剩下一个表层权衡，与平台无关：

- **A. 保持现有 Mouse\* 命名**（现状）：onClick/onMouseEnter/onContextMenu。与现有代码、AI Projection 序列化、已存 FlowSchema 绑定数据零兼容成本；缺点仅是命名带鼠标字面色彩（但语义上 onMouseEnter 在触摸端本就不派发，不影响正确性）。
- **B. 改为平台中性命名**（onTap/onPointerEnter 风格）：纯属观感统一；代价是破坏向后兼容，须迁移已存 FlowSchema 绑定数据与序列化字段，改动面大、收益低。

结论：这是低优先级的命名审美问题，**不构成跨平台前置条件**。真正的跨平台硬约束是原子事件层的 G1~G4 重构（字段缺失才是能力天花板）。本方案不决议命名，仅记录（见文末开放问题）。

---

## 目标

将编辑态、预览态、线上态三者统一到 `@banyuan/banvasgl` 同一个引擎包之上，差异完全由所注入的策略层 + 配置表达，而非由独立引擎、iframe 或引擎分叉表达。

具体达成：

1. **引擎层 flowEnabled gate**：在 `Scene.triggerSchema` 增加集中式拦截，编辑态传 `flowEnabled: false` 后所有 FlowSchema（含生命周期）均不执行。
2. **新增 `@banyuan/banvas-runtime` 独立包**：承载运行策略层——高级交互识别（基于原子事件）+ `useRuntimeBanvas` hook（运行态画布组装）+ 事件→FlowSchema 派发。该包进入用户 ECS 产物，不进入 banyan 编辑器。
3. **修复 scaffold 产物**：`generateAppTsx` 目前是空壳（只有 `fetch('/app.json')` 无实际初始化），改为使用 `@banyuan/banvas-runtime` 的 `useRuntimeBanvas` 完整初始化画布。

非目标（本方案不处理，留给后续 spec）：

- banvas-runtime 各高级交互识别器的完整算法实现（本方案只建包骨架 + 接口定义 + click 这一最小识别）
- 预览态画布内工具栏的具体 UI 形态
- **预览态本地后端服务的全部编排**（启动/生命周期管理/本地 Mongo 接入/运行时端点指向/热更新）。本 spec 仅在引擎机制视角定性「预览态注入运行策略 + `flowEnabled=true` + 后端节点端点指向本地服务」，本地后端「怎么起、连什么库、进程怎么管、怎么热更新」属 app 域服务拓扑，由 **app / architecture / A5** 决策、**`docs/specs/app/preview-local-backend.md`** 实施方案承载（其中热更新是预览体验的关键路径，非可选优化，详见该 spec）。
- 移动端触摸手势识别（longpress/swipe/pinch 等，需先扩 `IViewEvents` + 更新 M17，且依赖 `docs/specs/engine/atomic-event-cross-platform.md` 的 G1 前置，距离较远）

---

## 三态行为矩阵（方案核心）

| 维度                             | 编辑态（design）                         | 预览态（preview）                                                                       | 线上态（production）                                  |
| -------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 入口 hook                        | `useDesignBanvas`（banyan 应用层）       | `useRuntimeBanvas`（banvas-runtime）                                                    | `useRuntimeBanvas`（banvas-runtime）                  |
| 底层机制 hook                    | `useCanvasInit`（banvasgl-react）       | `useCanvasInit`（banvasgl-react）                                                      | `useCanvasInit`（banvasgl-react）                    |
| 数据来源                         | 最近非 discard 对话引用的 AppContent     | 落库 appJSON（切预览前由编辑态自动保存）+ 本地后端服务返回的动态数据                                   | 已发布版本快照（`/app.json`）+ 线上后端返回的动态数据 |
| 注入的策略                       | InteractionStateMachine 全集（编辑策略） | 运行态高级交互识别（运行策略）                                                          | 运行态高级交互识别（运行策略）                        |
| FlowSchema 执行                  | **禁用**（`flowEnabled: false`）         | **启用**（`flowEnabled: true`）                                                         | **启用**（`flowEnabled: true`）                       |
| 后端节点（callFlow/dbQuery）目标 | —                                        | **本地后端服务**（详见 app spec）+ **本地 Mongo**                                       | 用户 ECS 产物 + 真实业务 DB                           |
| 前端呈现                         | 编辑器画布（UIPage）                       | **与编辑态同源**（同工程/同运行时/同 appJSON）——banyan 前端工程内独立 PreviewPage 用 `useRuntimeBanvas` 渲染，**不部署第二套前端、不使用 iframe**（页面拆分/切换详见 app 前端 spec） | deploy-agent 全量构建前端工程 → ECS                   |

> 预览态后端节点目标列只标了「本地后端服务 + 本地 Mongo」的**结果**，其编排实现（scaffoldServer 本地起服务、进程管理、热更新、运行时端点注入）见 **`docs/specs/app/preview-local-backend.md`**（决策 app/A5）。本 spec 的引擎视角只关心「预览态后端节点请求打到本地端点」这一事实，不关心该端点如何被拉起。

**核心观察（引擎视角）**：编辑态 ↔ 运行态的本质区别，从引擎机制看只有两点——「注入编辑策略 + `flowEnabled=false`」对「注入运行策略 + `flowEnabled=true`」。三态共用 `@banyuan/banvasgl-react` 的 `useCanvasInit` 机制底座。预览态在引擎侧与线上态完全一致（同一套 `useRuntimeBanvas` 运行策略 + `flowEnabled=true`），它与线上态的差异**不在引擎层**，而在后端服务拓扑（本地服务 + 本地 Mongo vs ECS + 真实业务库）与前端是否部署——这部分是 **app 域**职责，由 app/A5 决策、`docs/specs/app/preview-local-backend.md` 承载，本引擎 spec 不展开。

> **预览态全貌（一句话定位，细节见 app spec）**：预览态是「banyan 前端工程内的 PreviewPage（`useRuntimeBanvas` 同源、不部署第二套前端、不 iframe）+ 本地起的真实后端」的前后端异源混合态。其中：前端交互形态（默认预览态、UIPage/PreviewPage 拆分、顶部 switch、独立预览路由、切预览前自动保存）见 **`docs/specs/app/preview-default-mode-switch.md`**（决策 app/P5）；本地后端编排与覆盖边界（不覆盖前端构建产物、不覆盖部署正确性与数据真实性，「预览通过 ≠ 可上线」）见 **`docs/specs/app/preview-local-backend.md`**（决策 app/A5）。

---

## 分层归属澄清（从 A0 契约推导）

三层归属是 A0「机制/策略分离」的直接结论。关键判据：**一段逻辑是「如何做（机制）」还是「在什么场景下按什么规则做（策略）」**。机制沉入 banvasgl，策略上浮到对应宿主。

### InteractionStateMachine —— 编辑策略，归 `banyan/frontend`

`InteractionStateMachine` 的 10 个状态（idle / hover / panning / moving / resizing / rotating / box-selecting / text-selecting / editing-point / connecting）**全部是修改设计稿的操作**，本质是「把原子事件解释成设计稿编辑动作」的一套规则——这是**策略**，且只服务编辑态。

它依赖的几何操作（resize / rotate / move）才是机制，已在 banvasgl 内核（A3 的 `InteractionDelegate` 27 个方法注入这些引擎能力）。注意：`InteractionStateMachine` 类本身物理上位于 `packages/banvasgl/src/engine/interaction/`（零 DOM 依赖的纯状态机），但**实例化、DOM 事件绑定与 Delegate 适配**发生在 `apps/banyan/frontend/src/hooks/useInteraction.ts`——也就是说，编辑策略的「装配与启用」在 banyan 前端，运行态不装配它。

### 运行态高级交互识别 + useRuntimeBanvas —— 运行策略，归 `@banyuan/banvas-runtime`

终端用户在运行态会产生 click / 双击 / 拖拽 / 焦点切换等高级交互，需要把底层 `pointerdown/pointermove/pointerup` 序列**解释**成 `IViewEvents` 中的语义事件，再触发对应 View 的 FlowSchema。这与编辑态的 InteractionStateMachine 完全对称——同样是「把原子事件解释成何种高层交互」的**策略**，只是服务对象从创作者换成了终端用户。

按 A0，它既不属于 banvasgl（运行时只提供原子事件机制，不内置交互解释策略），也不属于 `banyan/frontend`（编辑器策略，不应打包进用户产物），而是运行态专属策略，必须进入用户 ECS 产物。因此 `useRuntimeBanvas`（运行态画布组装）与高级交互识别器一同放入独立包 `packages/banvas-runtime`，npm 包名 `@banyuan/banvas-runtime`。

> 这正是本次修订纠正的关键点：旧方案把 `useRuntimeBanvas` 放进 banvasgl hook 层，但该 hook 的实质工作是「绑定运行态事件派发 → onClick → triggerSchema」，这是运行策略而非机制，与「高级交互识别器必须外置」自相矛盾（旧方案曾误称其为 GestureRecognizer，本次一并纠正为 InteractionRecognizer）。按 A0 统一推导，承载运行策略的 hook 也必须随运行策略包外置。

### 三层分工（机制在内核，策略分两端）

```
@banyuan/banvasgl       运行时机制：原子事件(pointer/key) / 命中检测 / 几何变换 / FlowSchema 执行 / flowEnabled gate
@banyuan/banvasgl-react Web 平台注入 + React Hook：useCanvasInit / useCanvasCamera / WebDrawingContext / WebSurface
@banyuan/banvas-runtime 运行策略：高级交互识别(click/dblclick/drag/focus…) + useRuntimeBanvas + 事件→triggerSchema 派发（进用户产物）
banyan/frontend         编辑策略：InteractionStateMachine 装配 + useDesignBanvas + useInteraction（不进用户产物）
```

`banvas-runtime` 与 `banyan/frontend` 都依赖 `@banyuan/banvasgl-react` 暴露的同一套机制底座（`useCanvasInit` + 原子事件 + hitTest + triggerSchema），二者互不依赖，可独立演进。

---

## 引擎层改动：flowEnabled gate

当前 `Scene.triggerSchema` 是所有 FlowSchema（生命周期 + 交互事件）的唯一执行入口（`packages/banvasgl/src/engine/scene/Scene.ts` L321–L399，现有 guard 仅 `if (!schema) return` 与 `if (!runner)`，**无 flowEnabled 判断**）。编辑态目前依赖「不绑定交互事件 → 不调用 triggerSchema」的隐式约定，但**生命周期（onLoad/onShow）会在 navigateTo 时被引擎主动调用**，编辑态需要显式拦截。

方案：在引擎层引入集中式 gate，而非散落在各调用点。

### 改动点

`App` 新增只读字段 `flowEnabled: boolean`（默认 `true`），由 `IAppOptions` 注入：

```ts
// types/engine/app.ts（当前仅有 enablePageStack / maxPageStackSize / lifetimes，需新增）
export interface IAppOptions {
  // ...existing
  /** 是否允许 FlowSchema 执行。编辑态传 false，运行态传 true（默认 true）。 */
  flowEnabled?: boolean;
}
```

`Scene.triggerSchema` 在最前面增加 gate 判断（单一拦截点，覆盖生命周期 + 交互事件）：

```ts
public triggerSchema(view: IView, schema: FlowSchema | null, eventArgs: unknown[] = []): void {
  if (!schema) return
  if (this._app?.flowEnabled === false) return  // ← 编辑态在此统一短路
  const runner = this._app?.flowRunner
  // ...existing
}
```

**为什么放引擎层而非 hook 层**：FlowSchema 触发点分散在 Scene 生命周期、App 生命周期、未来的交互事件派发中，若由 hook 层「选择性不绑定」来实现，会留下生命周期这类引擎主动触发的漏网之鱼。集中 gate 是唯一可靠的拦截点。按 A0 契约，「是否放行流程执行」是一个**机制原语**（开关本身），归 banvasgl；而「三态各自该把开关置成什么值」才是策略，由上层 hook 注入——gate 在引擎层，取值在上层，二者分工清晰。

---

## hook 分层：useCanvasInit（机制，banvasgl-react）vs useRuntimeBanvas（策略，banvas-runtime）

### banvasgl-react 侧：useCanvasInit 是机制底座

`packages/banvasgl-react/src/hooks/useCanvasInit.tsx` 是纯机制底座，入参 `UseCanvasOptions { width?, height?, appOptions?, rendererOptions?, textInput? }`，返回 `{ actions, elements, derived }`。本方案**不在 banvasgl-react 新增 useRuntimeBanvas**。banvasgl-react hook 层维持现状（`useCanvasInit` + `useCanvasCamera`）。

### banvas-runtime 侧：新增 useRuntimeBanvas

`useRuntimeBanvas` 位于 `@banyuan/banvas-runtime`，因为它要装配运行策略（高级交互识别 + 事件派发），属策略层：

```ts
// packages/banvas-runtime/src/hook/useRuntimeBanvas.tsx
import { useCanvasInit } from "@banyuan/banvasgl-react";
import type { UseCanvasOptions } from "@banyuan/banvasgl";

export interface UseRuntimeOptions extends UseCanvasOptions {
  /** callFlow 等后端节点的目标配置（预览 vs 线上注入不同值） */
  appId?: string;
  /** 启用的高级交互类型，默认 ['click'] */
  interactions?: Array<
    "click" | "doubleclick" | "contextmenu" | "drag" | "hover" | "focus"
  >;
}

export function useRuntimeBanvas(appJSON: string, options: UseRuntimeOptions) {
  // 1. 复用 banvasgl-react 机制底座 useCanvasInit，flowEnabled = true，textInput = false
  const { actions, elements, derived } = useCanvasInit(appJSON, {
    ...options,
    appOptions: { ...options.appOptions, flowEnabled: true },
    textInput: false,
  });

  // 2. 装配运行策略：根据 options.interactions 组合高级交互识别器，
  //    监听 banvasgl 暴露的原子事件，识别 → hitTest 找目标 View →
  //    读取 view.events[eventKey] → scene.triggerSchema 派发
  useRuntimeInteraction({
    canvas: derived.canvas,
    actions,
    interactions: options.interactions ?? ["click"],
  });

  return {
    Banvas: elements.container,
    actions,
    currentPageId: derived.currentPageId,
  };
}
```

### 与 useDesignBanvas 的对称关系

|             | useDesignBanvas                                             | useRuntimeBanvas                                        |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| 底座        | `useCanvasInit`（banvasgl-react）                          | `useCanvasInit`（banvasgl-react，同一个）              |
| flowEnabled | false                                                       | true                                                    |
| 注入策略    | InteractionStateMachine（编辑策略，经 useInteraction 装配） | 高级交互识别（运行策略，经 useRuntimeInteraction 装配） |
| textInput   | true                                                        | false                                                   |
| 归属        | banyan/frontend（编辑策略层）                               | @banyuan/banvas-runtime（运行策略层）                   |

两个 hook 严格对称：同一机制底座，各自注入对应策略，都不在 banvasgl 内。

---

## 新包：@banyuan/banvas-runtime

### 包位置与结构

```
packages/banvas-runtime/
├── package.json          # name: @banyuan/banvas-runtime
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts                       # 公共 API 导出（useRuntimeBanvas 为主入口）
    ├── interaction/
    │   ├── InteractionRecognizer.ts   # 高级交互识别器基类（基于原子事件）
    │   ├── ClickRecognizer.ts         # 单击 / 双击 / 右键
    │   ├── DragRecognizer.ts          # 拖拽（dragstart/drag/dragend）
    │   └── HoverFocusRecognizer.ts    # enter/leave/focus/blur
    └── hook/
        ├── useRuntimeBanvas.tsx       # 运行态画布组装（机制底座 + 运行策略装配）
        └── useRuntimeInteraction.ts   # 组合识别器 + 监听原子事件 + triggerSchema 派发
```

> 命名刻意避开「Gesture / 手势」——运行态识别的是**基于原子事件的高级交互**（桌面端 click/dblclick/drag/hover/focus），并非触摸手势。统一称「交互识别器（InteractionRecognizer）」，与代码现有的桌面事件模型一致。

### 依赖关系

```json
{
  "peerDependencies": {
    "@banyuan/banvasgl": "workspace:*",
    "react": "^19.0.0"
  }
}
```

`@banyuan/banvas-runtime` 依赖 `@banyuan/banvasgl`（peerDep），不反向依赖。

### 高级交互识别器接口（骨架）

识别器消费 banvasgl 暴露的原子事件，产出 View.events 中的某个事件键：

```ts
// interaction/InteractionRecognizer.ts
import type { Point3 } from "@banyuan/banvasgl";

/** 识别结果指向 IViewEvents 的某个键 */
export type RuntimeEventKey =
  | "onClick"
  | "onDoubleClick"
  | "onContextMenu"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onMouseMove"
  | "onMouseDown"
  | "onMouseUp"
  | "onDragStart"
  | "onDrag"
  | "onDragEnd"
  | "onFocus"
  | "onBlur";

export interface RecognizedInteraction {
  eventKey: RuntimeEventKey;
  worldPoint: Point3;
  payload?: unknown;
}

/**
 * 识别器只消费 banvasgl 的原子事件（pointerdown/move/up、keydown/up），
 * 识别成高级交互后回调 emit。命中 View 与 triggerSchema 派发由 useRuntimeInteraction 统一处理。
 */
export abstract class InteractionRecognizer {
  constructor(protected emit: (r: RecognizedInteraction) => void) {}
  abstract onPointerDown(
    worldPoint: Point3,
    clientX: number,
    clientY: number,
    button: number,
  ): void;
  abstract onPointerMove(
    worldPoint: Point3,
    clientX: number,
    clientY: number,
  ): void;
  abstract onPointerUp(
    worldPoint: Point3,
    clientX: number,
    clientY: number,
  ): void;
  abstract reset(): void;
}
```

### useRuntimeInteraction hook（骨架）

```ts
// hook/useRuntimeInteraction.ts
import type { IBanvasActions } from "@banyuan/banvasgl";

export interface UseRuntimeInteractionOptions {
  canvas: HTMLCanvasElement | null;
  actions: IBanvasActions | null;
  /** 启用的高级交互类型，默认 ['click'] */
  interactions?: Array<
    "click" | "doubleclick" | "contextmenu" | "drag" | "hover" | "focus"
  >;
}

export function useRuntimeInteraction(
  options: UseRuntimeInteractionOptions,
): void {
  // 1. 根据 interactions 配置组合对应的 Recognizer
  // 2. 把 canvas 原生 pointer 事件归一化为世界坐标后喂给识别器
  // 3. 识别器 emit 出 RecognizedInteraction 后：
  //    a. 用 actions.view.hitTest(worldPoint) 找到目标 View
  //    b. 读取 view.events[eventKey]（FlowSchema | null）
  //    c. 调用 scene.triggerSchema(view, schema, [interactionPayload])
  //       （是否真正执行由 banvasgl 的 flowEnabled gate 决定）
}
```

**本方案只建立骨架和接口定义，并实现 click 这一最小可用识别**（pointerdown + pointerup 同点且位移 < 10px）；其余交互（doubleclick/contextmenu/drag/hover/focus）作为后续子任务实现。

---

## scaffold 产物修复

`packages/deploy-agent/src/scaffold.ts` 的 `generateAppTsx` 目前是空壳（只有 `fetch('/app.json')` 但没有实际初始化 BanvasGL）。修复为使用 banvas-runtime 的 `useRuntimeBanvas`：

```ts
function generateAppTsx(appJSON: AppJSON): string {
  return `import { useRuntimeBanvas } from '@banyuan/banvas-runtime';
import appData from '../public/app.json';

export function App() {
  const { Banvas } = useRuntimeBanvas(JSON.stringify(appData), {
    width: ${appJSON.width ?? "undefined"},
    height: ${appJSON.height ?? "undefined"},
    appId: '${appJSON.appId}',
    interactions: ['click'],
  });

  return (
    <div style={{ width: '100%', height: '100%' }} data-app-id="${appJSON.appId}">
      <Banvas />
    </div>
  );
}
`;
}
```

注意：`useRuntimeBanvas` 现从 `@banyuan/banvas-runtime` 导入（不再是 `@banyuan/banvasgl-react`），且 `flowEnabled: true` 已由 `useRuntimeBanvas` 内部固定注入，无需在 scaffold 重复传。

同时 `generatePackageJson` 需要加入 `@banyuan/banvas-runtime`：

```ts
dependencies: {
  react: '^19.0.0',
  'react-dom': '^19.0.0',
  '@banyuan/banvasgl': 'latest',
  '@banyuan/banvas-runtime': 'latest',  // ← 新增（提供 useRuntimeBanvas + 运行策略）
},
```

---

## G3 子任务：从原子事件移除编辑策略字段（不依赖移动端，可独立先行）

G3 是「原子事件硬件无关重构」（G1~G4）里**唯一不依赖移动端/触控笔需求**的一项，可作为首个独立子任务先落地，为后续 G1/G2/G4 清出干净的契约边界。

> **改动面定性（经代码核实修正）**：早期判断 G3「改动面最小」并不准确。核实 `apps/banyan/frontend/src/hooks/useInteraction.ts` 与 `InteractionStateMachine.ts` 后发现：**当前键盘事件并未全量接入状态机**——`useInteraction.onKeyDown` 仅在 `e.code==='Space'` 时派发、`onKeyUp` 更是只认 Space（其它 code 直接 return），状态机的 `onKeyDown/onKeyUp` 也只处理 Space、其余 default 丢弃。也就是说，修饰键当前是 mouse 事件那一刻**现取** `e.metaKey/e.ctrlKey`，状态机内部从未维护任何修饰键状态。因此 G3 需先补一条「修饰键接入链路」，它仍不依赖移动端、闭环清晰，但**不是零成本**。本节按修正后的事实给出方案。

### 问题与目标

`InteractionInput` 当前混入了两个**编辑策略派生字段**，违背 A0「原子事件硬件无关」原则（`packages/banvasgl/src/types/interaction.ts`）：

| 字段                   | 当前位置           | 当前来源                                                           | 当前消费方                                                          | 派生语义                               |
| ---------------------- | ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------- |
| `multiSelect: boolean` | `PointerDownInput` | `useInteraction.onMouseDown` 由 `Mac ? e.metaKey : e.ctrlKey` 算出 | `InteractionStateMachine.onPointerDown` → `select(id, multiSelect)` | 「按住 ctrl/cmd 多选」是**编辑态**规则 |
| `ctrlKey: boolean`     | `PointerMoveInput` | `useInteraction.onMouseMove` 由 `e.ctrlKey` 传入                   | `InteractionStateMachine.handleResizing` → `resize(..., ctrlKey)`   | 「按住 ctrl 等比缩放」是**编辑态**规则 |

**目标**：把这两个字段移出 `InteractionInput`，改由 `InteractionStateMachine` 内部维护修饰键状态自行推导。改造后原子事件只剩硬件无关字段，运行态（banvas-runtime）与第三方复用不再被编辑语义污染。

**为什么选「下沉到状态机维护」而非「现取后随 input 旁路传递」**：修饰键状态本就是交互状态机的固有职责，这与业界惯例同构——浏览器原生 `KeyboardEvent.getModifierState()` 与事件上的 `ctrlKey/metaKey` 本质就是平台层**持续维护**的一份修饰键状态在每个事件里给出的快照；游戏引擎（Unity Input System）与设计器状态机（如 tldraw）也都把修饰键作为可随时 query 的输入状态，而非依赖某个事件顺带捎来。把它下沉进 `InteractionStateMachine` 是「让正确的层持有正确的状态」，而非额外负担。

> 为什么 G3 能脱离 G1/G2/G4 先行：它不新增 `pointerType/pointerId/pointercancel/pressure`、不触碰移动端，改动面收敛在 banvasgl 状态机 + banyan 的 `useInteraction` 适配层，闭环清晰、可独立验收。

### 改造后的契约

```ts
// packages/banvasgl/src/types/interaction.ts
export interface PointerDownInput {
  type: "pointerdown";
  worldPoint: Point3;
  clientX: number;
  clientY: number;
  button: number; // 保留：硬件无关属性（见 G3 说明，button 非杂质）
  // ❌ 删除 multiSelect
}
export interface PointerMoveInput {
  type: "pointermove";
  worldPoint: Point3;
  clientX: number;
  clientY: number;
  canvasWidth: number;
  canvasHeight: number; // 本子任务暂留（外移属 G3 之外的「上下文外移」，单独处理）
  // ❌ 删除 ctrlKey
}
```

> 注意：本子任务**只移修饰键派生字段（multiSelect/ctrlKey）**。`canvasWidth/canvasHeight` 的外移（改由 Delegate 注入环境上下文）虽同属"原子事件减负"，但涉及 Delegate 接口扩展，属另一独立改动，不绑进 G3，以保持 G3 的最小闭环。

### 修饰键状态下沉到状态机

核实结论：状态机的 `onKeyDown/onKeyUp` 目前**只处理 Space**（`if (code==='Space') {...} return { stateChanged:false }`），其它 code 一律丢弃，内部不存在任何修饰键快照。G3 需在状态机内**新建**一份修饰键状态并在键盘分支维护：

```ts
// packages/banvasgl/src/engine/interaction/InteractionStateMachine.ts
// 新增内部状态（实例字段）
private _modifiers = { ctrl: false, meta: false, shift: false }

private updateModifier(code: string, pressed: boolean): void {
  if (code === 'ControlLeft' || code === 'ControlRight') this._modifiers.ctrl = pressed
  else if (code === 'MetaLeft' || code === 'MetaRight') this._modifiers.meta = pressed
  else if (code === 'ShiftLeft' || code === 'ShiftRight') this._modifiers.shift = pressed
}

// onKeyDown / onKeyUp 在保留现有 Space 逻辑的同时，新增修饰键维护分支
private onKeyDown(input: KeyDownInput): InteractionOutput {
  this.updateModifier(input.code, true)
  // ...existing Space 逻辑
  return { stateChanged: false }
}
private onKeyUp(input: KeyUpInput): InteractionOutput {
  this.updateModifier(input.code, false)
  // ...existing Space 逻辑
  return { stateChanged: false }
}

// 多选 = ctrl 或 meta（替代原 input.multiSelect，平台差异在此内部消化）
private get multiSelect(): boolean { return this._modifiers.ctrl || this._modifiers.meta }
// 等比缩放 = ctrl（替代原 input.ctrlKey）
private get keepAspect(): boolean { return this._modifiers.ctrl }
```

`onPointerDown` 把 `input.multiSelect` 改读 `this.multiSelect`；`handleResizing` 把入参 `ctrlKey` 改读 `this.keepAspect`。

> **平台语义变更（已确认接受）**：原逻辑是 `Mac ? e.metaKey : e.ctrlKey`——即 Windows 上只认 ctrl、不认 Win 键。下沉后状态机统一按「ctrl 或 meta 任一即多选」处理，这会让 Windows 上 Win 键点击也触发多选。Win 键点击多选本就罕见，此简化消除了适配层的平台分支，作为可接受的行为统一记录在此（非回归 bug）。

> **幽灵态复位（必做项，非可选）**：由于改成有状态维护，必须处理 keyup 丢失——按住 ctrl 时切走窗口、在别处松开，keyup 不会回到本窗口，`_modifiers.ctrl` 会卡在 `true`。这是「状态化修饰键」的固有边界，业界标准解法是**在 `window` 的 `blur` / `visibilitychange`（隐藏）时强制清空 `_modifiers`**。本子任务须一并实现该复位，且 `reset()` 也清空 `_modifiers`。

### 编辑态适配层简化（banyan/frontend）

`apps/banyan/frontend/src/hooks/useInteraction.ts` 构造 `InteractionInput` 时不再计算/传入这两个字段：

- `onMouseDown`：删除 `const multiSelect = Mac ? e.metaKey : e.ctrlKey` 与 dispatch 里的 `multiSelect` 字段（修饰键改由状态机从 keydown/keyup 感知）。
- `onMouseMove`：删除 dispatch 里的 `ctrlKey: e.ctrlKey`。
- **放开键盘事件过滤（核实后确认的前置工作）**：当前 `onKeyDown` 仅在 `e.code==='Space'` 时派发、`onKeyUp` 用 `if (e.code==='Space')` 包死。须改为：除保留 Space 既有逻辑外，对 `ControlLeft/Right`、`MetaLeft/Right`、`ShiftLeft/Right` 的 keydown 与 keyup 也派发原子事件给状态机；`onKeyUp` 不能再只认 Space。
- 新增 `window` 的 `blur` / `visibilitychange` 监听，触发状态机修饰键复位（对应上一节「幽灵态复位」），并在卸载时移除监听。
- L454 附近 `onClick` 里直接用 `e.metaKey/e.ctrlKey` 调 `actions.view.select` 的旁路逻辑同步改为读状态机修饰键，或保留但与状态机口径对齐（避免两处规则漂移）。

### G3 实施步骤

1. `packages/banvasgl/src/types/interaction.ts`：从 `PointerDownInput` 删 `multiSelect`、从 `PointerMoveInput` 删 `ctrlKey`。
2. `packages/banvasgl/src/engine/interaction/InteractionStateMachine.ts`：新增 `_modifiers` 状态 + `updateModifier`，在 `onKeyDown/onKeyUp` 维护（保留 Space 逻辑、新增修饰键分支、不再 default 丢弃）；`onPointerDown` 改读 `this.multiSelect`、`handleResizing`/`onPointerMove` 改读 `this.keepAspect`；新增 `resetModifiers()` 并在 `reset()` 中调用。
3. `apps/banyan/frontend/src/hooks/useInteraction.ts`：删除 onMouseDown/onMouseMove 里的 multiSelect/ctrlKey 构造；**放开 onKeyDown/onKeyUp 的 Space-only 过滤**，放行 Control/Meta/Shift 的 keydown/keyup 派发；新增 `window` blur/visibilitychange → 状态机修饰键复位（卸载时移除）；对齐 onClick 旁路 select 的修饰键口径。
4. 全仓 grep `multiSelect`/`\.ctrlKey`（限 banvasgl + banyan 交互链路）确认无残留读取 input 字段处。

### G3 验收标准

1. **类型不再含杂质**：`InteractionInput` 中 grep 不到 `multiSelect`/`ctrlKey` 字段定义。
2. **多选行为不回归**：编辑器中按住 ctrl（或 Mac 的 cmd）点击多个组件仍能多选，松开后单击恢复单选。
3. **等比缩放不回归**：拖拽缩放手柄时按住 ctrl 仍等比缩放，松开恢复自由缩放。
4. **修饰键状态正确复位（幽灵态）**：按住 ctrl 不松、切走窗口再回来后，点击不会误触发多选（`blur`/`visibilitychange` 已清空 `_modifiers`）；`reset()` 后 `_modifiers` 亦归零。
5. **构建零错误**：`pnpm build:all` 通过。

> G3 落地后，`InteractionInput` 的剩余跨平台缺口仅剩 G1（pointerType/pointerId）、G2（pointercancel）、G4（pressure/tilt），它们因依赖移动端/触控笔需求，继续留在 `docs/specs/engine/atomic-event-cross-platform.md`（「原子事件跨平台化」实施 spec）中按需求排期。

---

## 实施步骤（可执行）

**步骤 1：引擎层 gate（banvasgl）**

- `packages/banvasgl/src/types/engine/app.ts`：`IAppOptions` 增加 `flowEnabled?: boolean`
- `packages/banvasgl/src/engine/App.ts`：增加 `public readonly flowEnabled: boolean`，构造时从 options 读取，默认 `true`
- `packages/banvasgl/src/engine/scene/Scene.ts`：`triggerSchema` 顶部增加 `if (this._app?.flowEnabled === false) return`

**步骤 2：编辑态对齐（banyan/frontend）**

- `apps/banyan/frontend/src/hooks/useDesignBanvas.tsx`：调用 `useCanvasInit` 时显式传 `appOptions.flowEnabled = false`（双保险，使行为不依赖「未绑定事件」的隐式约定）

**步骤 3：新建 banvas-runtime 包骨架**

- 创建 `packages/banvas-runtime/` 目录结构（`packages/*` 已被 pnpm-workspace 通配匹配，无需改 workspace 配置）
- 写入 `package.json`（peerDep banvasgl + react）、`tsconfig.json`、`tsup.config.ts`
- 实现 `InteractionRecognizer` 基类 + `ClickRecognizer`（最小可用）+ `useRuntimeInteraction` hook（click 派发）
- 实现 `useRuntimeBanvas`（复用 banvasgl-react 的 `useCanvasInit`，注入 `flowEnabled: true` + 装配 `useRuntimeInteraction`），从 `src/index.ts` 导出

**步骤 4：scaffold 产物修复（deploy-agent）**

- `packages/deploy-agent/src/scaffold.ts`：`generateAppTsx` 改为从 `@banyuan/banvas-runtime` 导入 `useRuntimeBanvas`
- `generatePackageJson` 加入 `@banyuan/banvas-runtime: 'latest'`

**步骤 5：验证**（见验收标准）

---

## 验收标准

1. **构建零错误**：`pnpm build:all` 通过
2. **编辑态 gate 生效**：编辑器中点击带 `events.onClick` 的组件，**不触发** FlowSchema 执行；所有编辑交互（移动/缩放/旋转/框选/文本编辑）正常
3. **运行态行为正确**：通过 `@banyuan/banvas-runtime` 的 `useRuntimeBanvas` 加载同一份 appJSON，点击组件**触发** onClick FlowSchema；页面切换触发 onLoad/onShow；编辑手柄不出现
4. **gate 单测**：`flowEnabled=false` 时 `Scene.triggerSchema` 对任意非空 schema 直接 return（mock flowRunner，断言 `run` 未被调用）；`flowEnabled=true` 时正常调用 `flowRunner.run`
5. **scaffold 产物可运行**：`generateAppTsx` 产出的 `App.tsx` 能正确初始化 BanvasGL 画布，不再是空壳
6. **banvas-runtime 包可构建**：`packages/banvas-runtime` 能通过 `tsup` 构建，导出 `useRuntimeBanvas` / `InteractionRecognizer` / `useRuntimeInteraction`
7. **banvasgl 不含运行策略**：grep banvasgl 包内不存在 `useRuntimeBanvas` 与任何交互识别器（确保运行策略未泄漏进机制包）

---

## 影响范围

| 文件                                                 | 改动类型                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/banvasgl/src/types/engine/app.ts`          | 新增 `flowEnabled` 字段                                           |
| `packages/banvasgl/src/engine/App.ts`                | 新增 `flowEnabled` + 读取 options                                 |
| `packages/banvasgl/src/engine/scene/Scene.ts`        | `triggerSchema` 顶部 gate                                         |
| `apps/banyan/frontend/src/hooks/useDesignBanvas.tsx` | 显式传 `flowEnabled: false`                                       |
| `packages/banvas-runtime/`                           | 新建包（useRuntimeBanvas + 交互识别器骨架 + click 最小实现）      |
| `packages/deploy-agent/src/scaffold.ts`              | `generateAppTsx` 改用 banvas-runtime 的 useRuntimeBanvas + 加依赖 |

注意：`@banyuan/banvasgl-react` 的 hook 导出 **不再**新增 `useRuntimeBanvas`（该 hook 移至 banvas-runtime）。

---

## 决议结论（原开放问题已收敛）

以下七项原为待评审开放问题，现逐一给出定论，作为本 spec 的实施约束。

1. **`useRuntimeBanvas` 的 derived 透传范围 —— 决议：只透传 `currentPageId` 与 `actions`。** 运行态无选中概念，`selectedViewId` 等编辑态 derived 一律不透传，避免运行产物依赖编辑态语义。若后续运行态确需某个 derived，再按需单独开口，不默认全量透传。

2. **高级交互识别器实现优先级 —— 决议：本 spec 只交付 click，其余按需排期。** click 为最小可用识别（本方案已含）；doubleclick/contextmenu/drag/hover/focus 的算法实现作为后续子任务，依产品需求逐个排期。骨架已预留 `InteractionRecognizer` 基类与 `RuntimeEventKey` 全集，新增识别器不改动既有接口。

3. **预览态的部署形态——决议：前端与编辑态同源（同工程/同运行时/同 appJSON，不部署第二套前端），后端复用 deploy-agent 的 `scaffoldServer` 在本地起真实服务。** 从引擎视角，预览态 = 注入运行策略 + `flowEnabled=true` + 后端节点端点指向本地——与线上态在引擎侧完全一致。其前端交互形态（默认预览态、UIPage/PreviewPage 拆分、顶部 switch、独立预览路由、切预览前自动保存）外移到 **`docs/specs/app/preview-default-mode-switch.md`**（决策 app/P5）；前后端异源混合态的完整定义、本地后端编排（scaffoldServer 本地起服务 / 本地 Mongo / 进程管理 / 热更新 / 运行时端点注入）、覆盖边界，均外移到：决策见 **app / architecture / A5**，实施方案见 **`docs/specs/app/preview-local-backend.md`**。本引擎 spec 不再展开后端实现细节，只保证引擎层「预览态与线上态共用同一套 `useRuntimeBanvas` 运行策略」这一统一性。

4. **是否暴露 `wheel`（滚轮）原子事件 —— 决议：本 spec 不纳入，单列后续机制层契约扩展。** 当前 `InteractionInput` 只有 pointer/key 五种，`IViewEvents` 亦无 onScroll/onWheel。滚轮交互需要「机制层补 `wheel` 原子输入 + `IViewEvents` 增 `onWheel` 键」成对扩展，属机制层契约变更，与三态统一引擎主线无耦合，留待有明确滚动交互需求时单列 spec。

5. **原子事件硬件无关重构（G1~G4）的排期 —— 决议：G3 已拆为本 spec 内可独立先行的子任务（见「G3 子任务」节），G1/G2/G4 单列「原子事件跨平台化」实施 spec（`docs/specs/engine/atomic-event-cross-platform.md`，已创建）。** G3（移出 `multiSelect/ctrlKey`，改由状态机下沉维护修饰键状态推导）**不依赖移动端需求**，可作为首个落地项；但经代码核实，它并非「改动面最小」——当前键盘事件未全量接入状态机（onKeyUp 仅认 Space），G3 需补一条修饰键接入链路 + 幽灵态复位（blur/visibilitychange），方案已在本 spec 给出。G1（pointerType/pointerId）、G2（pointercancel）、G4（pressure/tiltX/tiltY）依赖移动端/触控笔需求，且会牵连 `InteractionStateMachine` 与运行态 banvas-runtime 适配器，统一归入独立的「原子事件跨平台化」spec，优先级高于命名调整。`canvasWidth/canvasHeight` 外移（属「上下文外移」而非「修饰键剥离」，改由 `InteractionDelegate` 注入画布环境上下文）**不绑进 G3**，与 G1/G2/G4 同列、一并归入 `docs/specs/engine/atomic-event-cross-platform.md` 收口，不在本 spec 内单独处理。

6. **View.events 是否改为平台中性命名（onClick→onTap）—— 决议：维持现状（路线 A），不改名。** 见正文「View.events 的命名是纯审美」节：这是命名审美问题、非跨平台议题（View.events 消费的是 banvas-runtime 已归一化的原子事件，命名不影响跨平台能力）。改名（路线 B）需迁移已存 FlowSchema 绑定数据与 AI Projection 序列化字段，改动面大、收益低。维持现有 Mouse\* 命名，本议题关闭。

7. **`flowEnabled` 的默认值取向 —— 决议：默认值不承载语义，三态均必须显式传值。** 机制层 `IAppOptions.flowEnabled` 保留默认 `true`（仅为缺省时的兜底，不代表任何状态语义）；真正的约束是**每一态都显式置值**——编辑态经 `useDesignBanvas` 显式传 `false`，运行态经 `useRuntimeBanvas` 内部固定注入 `true`。如此行为不依赖默认值，也不依赖「未绑定事件则不触发」的隐式约定，杜绝「忘传导致行为意外」。默认值取 `true` 还是 `false` 无偏好，关键是另一方显式开启/关闭即可。

---

> **本 spec 的拆分状态**：
>
> - ✅ **已拆出（app 域）**：预览态本地后端编排已外移到 `docs/specs/app/preview-local-backend.md`（决策 app/A5）；预览态前端交互形态（默认预览态、UIPage/PreviewPage 拆分、顶部 switch、独立路由、切预览前自动保存）已外移到 `docs/specs/app/preview-default-mode-switch.md`（决策 app/P5）。本 engine spec 只保留引擎机制视角（预览态注入运行策略 + `flowEnabled=true` + 后端节点端点指向本地）；后端「怎么起、连什么库、进程管理、热更新」与前端「页面如何组织与切换」均由 app spec 承载。
> - ✅ **已拆出（engine 域 · 原子事件跨平台化）**：G1（pointerType/pointerId）、G2（pointercancel）、G4（pressure/tilt）与 `canvasWidth/canvasHeight` 外移的实施步骤已外移到 `docs/specs/engine/atomic-event-cross-platform.md`（决策 engine/M10a）。本 engine spec 只保留原子事件契约的**论证与缺口表**（「banvasgl 暴露的原子事件契约」节）与**可独立先行的 G3 子任务**（「G3 子任务」节，新 spec 的前置）；G1/G2/G4 的「怎么改」全部由该新 spec 承载，二者通过 M10a 决策与本节相互路由。
> - ⏳ **建议后续再拆（engine 域 · 其余）**：本方案仍同时承载「三态统一引擎 + flowEnabled gate」「banvas-runtime 新包」「View.events 命名」等多条线，横跨 A0 / A8a / A3 / A5a 多个 ADR。如单文件继续膨胀，可再行评估拆分。
