# 三态统一引擎，hook 层区分行为 — 实施方案

## 关联决策

- **域 / 粒度 / 标题**：engine / architecture / **A8a. 三态统一引擎，hook 层区分行为**
- **上位定位**：**A0. banvasgl 定位为「面向声明式 UI 的 2D 图形运行时（含流程控制）」** —— 本方案是 A0「机制/策略分离契约」在三态场景下的直接落地。
- **决策链回顾**：产品需要"设计 → 预览 → 发布"完整链路 → 曾尝试独立 runtime 包但从未落地 → 核心洞察：三态差异仅在「交互策略」与「FlowSchema 是否执行」，二者都不是引擎机制本身 → banvasgl 作为运行时只提供机制（原子事件 / 命中检测 / 几何变换 / FlowSchema 执行 / `flowEnabled` gate），三态差异由上层注入不同策略表达。
- **上游依赖**：A0（根定位 / 机制策略契约）、A8（宿主集成层 / hook）、A3（InteractionStateMachine + Delegate）、A5a（前后端执行器隔离，提供 `createClientFlowRunner`）

---

## 机制 / 策略分离视角（方案纲领）

本方案的每一个分层归属判断都从 A0 契约「banvasgl 提供机制，上层提供策略」机械推导，不再各自零散论证。三态的本质差异不在引擎，而在**上层注入了何种策略**：

| 能力 | 性质 | 归属 | 理由（来自 A0） |
|------|------|------|----------------|
| 原子事件（pointerdown/move/up、keydown/up）、命中检测、几何变换 | 机制 | `@banyuan/banvasgl` | 「如何感知输入、如何命中、如何变换图形」的底层能力，与场景无关 |
| FlowSchema 执行（FlowRunner） | 机制 | `@banyuan/banvasgl` | 「如何执行一段声明式流程」的底层能力 |
| `flowEnabled` gate | 机制 | `@banyuan/banvasgl` | 「是否放行流程执行」的统一开关原语，由上层按三态语义置值 |
| InteractionStateMachine（10 态编辑状态机） | **编辑策略** | `banyan/frontend` | 「把原子事件解释成设计稿编辑操作」的规则，只服务编辑态 |
| 运行态高级交互识别（把原子事件序列解释成 click/dblclick/drag/focus 等 View.events 语义）+ 事件→FlowSchema 派发 | **运行策略** | `@banyuan/banvas-runtime` | 「把原子事件解释成终端用户交互并触发对应 View.events」的规则，服务预览/线上态 |

**一句话推论**：三态共享同一套机制（banvasgl），差异仅是「注入哪种策略 + `flowEnabled` 取何值」。编辑态注入编辑策略且 `flowEnabled=false`；预览/线上态注入运行策略且 `flowEnabled=true`，预览与线上再以注入配置（数据来源 / callFlow 端点）区分。

> **关键澄清（本次修订重点）**：运行态「把原子事件解释成高级交互并派发到 View.events」是**运行策略**，与编辑态的 InteractionStateMachine 完全对称——一个把原子事件解释成「设计稿编辑动作」，一个把原子事件解释成「终端用户交互语义」。两者都不属于 banvasgl 机制层。因此承载它的 hook **不能**放在 banvasgl，而必须随运行策略包 `@banyuan/banvas-runtime` 一起进入用户产物。banvasgl 的 hook 层只提供纯机制的 `useCanvasInit`（初始化画布、暴露 actions 与原子事件回调）。

---

## banvasgl 暴露的原子事件契约（机制层边界，必须明确）

A0 反复提到「原子事件」，但此前未列清单。这里依据 `packages/banvasgl/src/types/interaction.ts` 的真实定义固化机制层契约：banvasgl 通过 `InteractionInput` 判别联合对上层暴露**五种原子输入**，这是机制层与策略层之间唯一的事件接口。

| 原子输入 type | 关键字段 | 语义 |
|---------------|---------|------|
| `pointerdown` | worldPoint, clientX, clientY, button, multiSelect | 指针按下 |
| `pointermove` | worldPoint, clientX, clientY, canvasWidth, canvasHeight, ctrlKey | 指针移动 |
| `pointerup` | worldPoint, clientX, clientY | 指针抬起 |
| `keydown` | code, repeat | 键按下 |
| `keyup` | code | 键抬起 |

机制层只负责：(1) 把原生 DOM 事件归一化为上述 `InteractionInput`；(2) 提供命中检测 `actions.view.hitTest(point) → IInteractResult`、`hitTestAll`、`hitTestDetailed`；(3) 提供几何变换原语（translate/resize/rotate 等，经 `InteractionDelegate` 27 个方法暴露）；(4) 提供 FlowSchema 执行入口 `Scene.triggerSchema` 与 `flowEnabled` gate。

banvasgl **不**定义 click、双击、长按、拖拽排序等高级语义——这些都是「把原子事件序列按某种规则解释」的策略，归上层。

---

## View.events 契约（高级交互的落点，必须与代码对齐）

运行策略层识别出的高级交互最终要派发到 `View.events`。依据 `packages/banvasgl/src/types/view/view.ts` 的 `IViewEvents` 真实定义，View 暴露 **13 个桌面端交互事件**（注意：当前是桌面鼠标/键盘事件模型，不是触摸手势模型）：

| 分类 | 事件键 | 触发语义 |
|------|--------|---------|
| 点击类 | `onClick` | mousedown + mouseup 在同一 View 上抬起 |
| | `onDoubleClick` | 短时间内连续点击两次 |
| | `onContextMenu` | 右键点击（或长按触发上下文菜单） |
| 鼠标移动类 | `onMouseEnter` | 指针首次进入 View 命中区（不冒泡） |
| | `onMouseLeave` | 指针离开 View 命中区（不冒泡） |
| | `onMouseMove` | 指针在命中区内移动（高频，慎用复杂逻辑） |
| | `onMouseDown` | 按键在 View 上按下 |
| | `onMouseUp` | 按键在 View 上抬起 |
| 拖拽类 | `onDragStart` | mousedown 后移动超阈值触发 |
| | `onDrag` | 拖拽进行中（高频） |
| | `onDragEnd` | mouseup 时触发 |
| 焦点类 | `onFocus` | View 获得焦点（仅可聚焦 View 如 Input） |
| | `onBlur` | View 失去焦点 |

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
pointerdown(button=right)     →  解释为 contextmenu            →  view.events.onContextMenu → triggerSchema
pointerdown→move(超阈值)→up    →  解释为 dragstart/drag/dragend →  view.events.onDrag*      → triggerSchema
pointermove 跨命中边界         →  解释为 enter/leave           →  view.events.onMouseEnter/Leave → triggerSchema
（可聚焦 View 命中 + 焦点切换）→  解释为 focus/blur            →  view.events.onFocus/onBlur → triggerSchema
```

每一步「解释」都是策略：阈值、时序、命中边界判定规则都由 banvas-runtime 决定，banvasgl 只提供原子输入与 hitTest。识别出目标 View 与事件键后，统一走 `scene.triggerSchema(view, view.events[eventKey], [interactionPayload])`，再由 `flowEnabled` gate 决定是否执行。

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
- 沙箱数据库连接的后端实现
- 移动端触摸手势事件（需先扩 `IViewEvents`）

---

## 三态行为矩阵（方案核心）

| 维度 | 编辑态（design） | 预览态（preview） | 线上态（production） |
|------|----------------|-----------------|--------------------|
| 入口 hook | `useDesignBanvas`（banyan 应用层） | `useRuntimeBanvas`（banvas-runtime） | `useRuntimeBanvas`（banvas-runtime） |
| 底层机制 hook | `useCanvasInit`（banvasgl） | `useCanvasInit`（banvasgl） | `useCanvasInit`（banvasgl） |
| 数据来源 | 最近非 discard 对话引用的 AppContent | 编辑态实时快照 | 已发布版本快照（`/app.json`） |
| 注入的策略 | InteractionStateMachine 全集（编辑策略） | 运行态高级交互识别（运行策略） | 运行态高级交互识别（运行策略） |
| FlowSchema 执行 | **禁用**（`flowEnabled: false`） | **启用**（`flowEnabled: true`） | **启用**（`flowEnabled: true`） |
| callFlow 目标 | — | banyan 后端 + 沙箱 DB | 用户 ECS 产物 + 真实业务 DB |
| 宿主形态 | 编辑器画布 | 画布内工具栏切换，**不使用 iframe** | deploy-agent 全量构建 → ECS |

**核心观察**：编辑态 ↔ 运行态的本质区别是「注入编辑策略 + `flowEnabled=false`」对「注入运行策略 + `flowEnabled=true`」；预览态 ↔ 线上态的区别仅在数据来源与 callFlow 端点（属注入配置，非引擎行为）。三态共用 banvasgl 的 `useCanvasInit` 机制底座。

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
@banyuan/banvasgl       运行时机制：原子事件(pointer/key) / 命中检测 / 几何变换 / FlowSchema 执行 / flowEnabled gate / useCanvasInit
@banyuan/banvas-runtime 运行策略：高级交互识别(click/dblclick/drag/focus…) + useRuntimeBanvas + 事件→triggerSchema 派发（进用户产物）
banyan/frontend         编辑策略：InteractionStateMachine 装配 + useDesignBanvas + useInteraction（不进用户产物）
```

`banvas-runtime` 与 `banyan/frontend` 都依赖 banvasgl 暴露的同一套机制原语（`useCanvasInit` + 原子事件 + hitTest + triggerSchema），二者互不依赖，可独立演进。

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
  flowEnabled?: boolean
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

## hook 分层：useCanvasInit（机制，banvasgl）vs useRuntimeBanvas（策略，banvas-runtime）

### banvasgl 侧：保持 useCanvasInit 不变

`packages/banvasgl/src/hook/useCanvasInit.tsx` 已是纯机制底座，入参 `UseCanvasOptions { width?, height?, appOptions?, rendererOptions?, textInput? }`，返回 `{ actions, elements, derived }`。本方案**不在 banvasgl 新增 useRuntimeBanvas**。banvasgl hook 层维持现状（`useCanvasInit` + `useCanvasCamera`）。

### banvas-runtime 侧：新增 useRuntimeBanvas

`useRuntimeBanvas` 位于 `@banyuan/banvas-runtime`，因为它要装配运行策略（高级交互识别 + 事件派发），属策略层：

```ts
// packages/banvas-runtime/src/hook/useRuntimeBanvas.tsx
import { useCanvasInit } from '@banyuan/banvasgl/react'
import type { UseCanvasOptions } from '@banyuan/banvasgl'

export interface UseRuntimeOptions extends UseCanvasOptions {
  /** callFlow 等后端节点的目标配置（预览 vs 线上注入不同值） */
  appId?: string
  /** 启用的高级交互类型，默认 ['click'] */
  interactions?: Array<'click' | 'doubleclick' | 'contextmenu' | 'drag' | 'hover' | 'focus'>
}

export function useRuntimeBanvas(appJSON: string, options: UseRuntimeOptions) {
  // 1. 复用 banvasgl 机制底座 useCanvasInit，flowEnabled = true，textInput = false
  const { actions, elements, derived } = useCanvasInit(appJSON, {
    ...options,
    appOptions: { ...options.appOptions, flowEnabled: true },
    textInput: false,
  })

  // 2. 装配运行策略：根据 options.interactions 组合高级交互识别器，
  //    监听 banvasgl 暴露的原子事件，识别 → hitTest 找目标 View →
  //    读取 view.events[eventKey] → scene.triggerSchema 派发
  useRuntimeInteraction({ canvas: derived.canvas, actions, interactions: options.interactions ?? ['click'] })

  return { Banvas: elements.container, actions, currentPageId: derived.currentPageId }
}
```

### 与 useDesignBanvas 的对称关系

| | useDesignBanvas | useRuntimeBanvas |
|---|---|---|
| 底座 | `useCanvasInit`（banvasgl） | `useCanvasInit`（banvasgl，同一个） |
| flowEnabled | false | true |
| 注入策略 | InteractionStateMachine（编辑策略，经 useInteraction 装配） | 高级交互识别（运行策略，经 useRuntimeInteraction 装配） |
| textInput | true | false |
| 归属 | banyan/frontend（编辑策略层） | @banyuan/banvas-runtime（运行策略层） |

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
import type { Point3 } from '@banyuan/banvasgl'

/** 识别结果指向 IViewEvents 的某个键 */
export type RuntimeEventKey =
  | 'onClick' | 'onDoubleClick' | 'onContextMenu'
  | 'onMouseEnter' | 'onMouseLeave' | 'onMouseMove' | 'onMouseDown' | 'onMouseUp'
  | 'onDragStart' | 'onDrag' | 'onDragEnd'
  | 'onFocus' | 'onBlur'

export interface RecognizedInteraction {
  eventKey: RuntimeEventKey
  worldPoint: Point3
  payload?: unknown
}

/**
 * 识别器只消费 banvasgl 的原子事件（pointerdown/move/up、keydown/up），
 * 识别成高级交互后回调 emit。命中 View 与 triggerSchema 派发由 useRuntimeInteraction 统一处理。
 */
export abstract class InteractionRecognizer {
  constructor(protected emit: (r: RecognizedInteraction) => void) {}
  abstract onPointerDown(worldPoint: Point3, clientX: number, clientY: number, button: number): void
  abstract onPointerMove(worldPoint: Point3, clientX: number, clientY: number): void
  abstract onPointerUp(worldPoint: Point3, clientX: number, clientY: number): void
  abstract reset(): void
}
```

### useRuntimeInteraction hook（骨架）

```ts
// hook/useRuntimeInteraction.ts
import type { IBanvasActions } from '@banyuan/banvasgl'

export interface UseRuntimeInteractionOptions {
  canvas: HTMLCanvasElement | null
  actions: IBanvasActions | null
  /** 启用的高级交互类型，默认 ['click'] */
  interactions?: Array<'click' | 'doubleclick' | 'contextmenu' | 'drag' | 'hover' | 'focus'>
}

export function useRuntimeInteraction(options: UseRuntimeInteractionOptions): void {
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
    width: ${appJSON.width ?? 'undefined'},
    height: ${appJSON.height ?? 'undefined'},
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

注意：`useRuntimeBanvas` 现从 `@banyuan/banvas-runtime` 导入（不再是 `@banyuan/banvasgl/react`），且 `flowEnabled: true` 已由 `useRuntimeBanvas` 内部固定注入，无需在 scaffold 重复传。

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
- 实现 `useRuntimeBanvas`（复用 banvasgl 的 `useCanvasInit`，注入 `flowEnabled: true` + 装配 `useRuntimeInteraction`），从 `src/index.ts` 导出

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

| 文件 | 改动类型 |
|------|---------|
| `packages/banvasgl/src/types/engine/app.ts` | 新增 `flowEnabled` 字段 |
| `packages/banvasgl/src/engine/App.ts` | 新增 `flowEnabled` + 读取 options |
| `packages/banvasgl/src/engine/scene/Scene.ts` | `triggerSchema` 顶部 gate |
| `apps/banyan/frontend/src/hooks/useDesignBanvas.tsx` | 显式传 `flowEnabled: false` |
| `packages/banvas-runtime/` | 新建包（useRuntimeBanvas + 交互识别器骨架 + click 最小实现） |
| `packages/deploy-agent/src/scaffold.ts` | `generateAppTsx` 改用 banvas-runtime 的 useRuntimeBanvas + 加依赖 |

注意：banvasgl 的 `hook/index.ts` 与包根 `index.ts` **不再**新增 `useRuntimeBanvas` 导出（该 hook 移至 banvas-runtime）。

---

## 开放问题（待评审决策）

1. **`useRuntimeBanvas` 是否需要把 `useCanvasInit` 的全部 derived（如 selectedViewId）透传？** 运行态无选中概念，建议只透传 `currentPageId` 与 `actions`，其余隐藏，避免运行产物依赖编辑态语义。

2. **高级交互识别器实现优先级？** 建议：先实现 click（本方案已含），其余（doubleclick/contextmenu/drag/hover/focus）按产品需求排期，骨架已预留接口与 `RuntimeEventKey` 全集。

3. **预览态是否与线上态共用 banvas-runtime？** 预览态在 banyan 编辑器内运行但仍需运行策略（识别 click 并触发 FlowSchema 以验证逻辑），建议预览态也引入 banvas-runtime 的 `useRuntimeBanvas`，仅以注入配置（数据来源 / callFlow 端点）区别于线上态——这与「三态共用机制、策略一致、仅配置不同」的纲领一致。

4. **是否需要在 banvasgl 暴露 `wheel`（滚轮）原子事件？** 当前 `InteractionInput` 只有 pointer/key 五种，`IViewEvents` 亦无 onScroll/onWheel。若运行态需要滚动交互，需先在机制层补 `wheel` 原子输入并在 `IViewEvents` 增 `onWheel` 键——属机制层契约扩展，单列后续 spec。
