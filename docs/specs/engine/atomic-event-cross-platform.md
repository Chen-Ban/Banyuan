# 原子事件跨平台化（InteractionInput 硬件无关重构 G1/G2/G4 + canvasWidth 外移）— 实施方案

## 关联决策

- **域 / 粒度 / 标题**：engine / mechanism / **M10a. 原子事件机制（硬件无关的 InteractionInput）**
- **上游依据**：engine / architecture / **A0. banvasgl 是跨平台图形运行时，只提供机制** —— M10a 是 A0 在「输入契约」维度的细化（`refines engine:A0`）
- **职责边界（与三态引擎 spec 的分工）**：
  - 原子事件的**目标契约草案、G1~G4 缺口表、平台适配落点、能力天花板论证**已在 `docs/specs/engine/tristate-unified-engine.md`「banvasgl 暴露的原子事件契约」节给出，本 spec **不重复论证**，只承载 G1/G2/G4 + canvasWidth 外移的**落地步骤**。
  - **G3（移出 `multiSelect`/`ctrlKey`，修饰键下沉状态机）已在 `tristate-unified-engine.md`「G3 子任务」节作为可独立先行的子任务完整承载**，本 spec **不重复 G3**，仅在前置依赖处引用它。
  - 本 spec 是 M10a 决策第 307 行「重构会牵连 `InteractionStateMachine` 与 `useInteraction` 适配层，单列后续 spec」以及 `tristate-unified-engine.md` 决议第 5 条「G1/G2/G4 单列『原子事件跨平台化』实施 spec」所指向的那份 spec。

---

## 目标

把 banvasgl 的 `InteractionInput`（`packages/banvasgl/src/types/interaction.ts`）从「字段绑死桌面鼠标」重构为「硬件无关、覆盖鼠标/触摸/触控笔三类设备」的归一化原子契约，使上层识别器与 `View.events` 在不感知设备的前提下具备多指、压感、系统取消等跨平台能力的底层入口。

具体达成（逐项对应 M10a / engine spec 的缺口编号）：

1. **G1 — 补 `pointerType` / `pointerId`**：让原子事件能区分输入设备（mouse/touch/pen）与多个并发指针，**为多指手势（pinch/多指旋转）从根上打开能力入口**。
2. **G2 — 新增 `pointercancel` 原子事件**：覆盖触摸/笔场景下系统强制取消（来电、手势冲突、滚动接管）时的状态机收尾，消除「取消后状态机卡死」。
3. **G4 — 补 `pressure` / `tiltX` / `tiltY`（可选）**：为触控笔压感、笔锋、倾角类能力预留标准入口。
4. **canvasWidth/canvasHeight 外移**：把画布环境上下文从描述「单次指针」的 `PointerMoveInput` 中移除，改由 `InteractionDelegate` 注入，使原子事件只剩纯指针字段。

并保持 M10a 的两条不变约束：banvasgl 平台无关、**不接触原生事件、不做归一化**（归一化由上层 banvas-runtime / `useInteraction` 适配器做）；修饰键派生语义（multiSelect/ctrlKey）不进原子事件（该项即 G3，已在三态 spec 落地）。

### 非目标（本方案不处理）

- **G3（multiSelect/ctrlKey 剥离 + 修饰键下沉状态机）** —— 已由 `docs/specs/engine/tristate-unified-engine.md`「G3 子任务」节承载，本 spec 不重复。G3 是本 spec 的**前置**（先清出干净的契约边界，再补 G1/G2/G4 字段）。
- **`View.events` 命名调整（onClick→onTap）** —— 已在三态 spec 决议第 6 条关闭（维持现状），与跨平台能力无关。
- **`wheel`（滚轮）原子事件扩展** —— 已在三态 spec 决议第 4 条单列，与本 spec 无耦合。
- **各高级手势识别器的算法实现（pinch/多指旋转/longpress/swipe）** —— 那是 banvas-runtime 内识别器（策略层）的活，依赖本 spec 的 G1 字段作为前置，但识别算法本身按产品需求单独排期，本 spec 只交付原子事件层的字段入口。
- **`View.events` 侧的事件键扩展（如新增 onPinch）** —— 需配套更新 `IViewEvents` 与 M17，依赖本 spec 的 G1，距离较远，不在本轮。

---

## 前置依赖

本 spec 的 G1/G2/G4 落地**建立在 G3 已完成的基础上**：

1. **G3 已落地**（见三态 spec「G3 子任务」节）：`multiSelect`/`ctrlKey` 已移出 `InteractionInput`，修饰键状态已下沉到 `InteractionStateMachine._modifiers` 维护，`useInteraction` 已放开键盘事件的 Space-only 过滤并接入 blur/visibilitychange 复位。
2. 若 G3 尚未落地，应先执行 G3——它为 G1/G2/G4 清出「只剩硬件无关字段」的干净契约边界；在杂质字段仍在的契约上叠加 G1/G2/G4 会让重构面交叉、难以独立验收。

> 排期取向：G3 不依赖移动端需求，可先行；G1/G2/G4 依赖移动端/触控笔的真实产品需求，按需排期。本 spec 描述的是「需求到来时如何落地」，不要求与 G3 同批执行。

---

## 目标契约（落地版）

在 G3 已清除 `multiSelect`/`ctrlKey` 的基础上，`packages/banvasgl/src/types/interaction.ts` 的 `InteractionInput` 重构为：

```ts
// 指针类公共基类：硬件无关，设备差异降为属性
interface PointerInputBase {
  worldPoint: Point3
  clientX: number
  clientY: number
  pointerId: number                       // G1：多指 / 多设备区分
  pointerType: 'mouse' | 'touch' | 'pen'  // G1：硬件无关的设备标签
  pressure?: number                       // G4：0~1，鼠标恒为 0.5/0，笔/触摸给真实压感
  tiltX?: number                          // G4：触控笔倾角（绕 Y 轴）
  tiltY?: number                          // G4：触控笔倾角（绕 X 轴）
}

interface PointerDownInput   extends PointerInputBase { type: 'pointerdown'; button?: number } // button 降级为可选（非缺口，G3 已说明）
interface PointerMoveInput   extends PointerInputBase { type: 'pointermove' }                  // ❌ 不再含 canvasWidth/canvasHeight（外移）
interface PointerUpInput     extends PointerInputBase { type: 'pointerup' }
interface PointerCancelInput extends PointerInputBase { type: 'pointercancel' }                // G2：新增

interface KeyDownInput { type: 'keydown'; code: string; repeat: boolean }
interface KeyUpInput   { type: 'keyup';   code: string }

type InteractionInput =
  | PointerDownInput | PointerMoveInput | PointerUpInput | PointerCancelInput
  | KeyDownInput | KeyUpInput
```

与三态 spec「目标 InteractionInput 草案」一致，差异仅在于：此处是 G3 已落地后的**最终落地形态**（草案里 PointerMoveInput 仍含 canvasWidth 是因为草案标注了「外移单独处理」，本 spec 即处理该外移）。

---

## canvasWidth/canvasHeight 外移方案

**现状**：`PointerMoveInput` 含 `canvasWidth/canvasHeight`（`interaction.ts` L164-166，注释「pan 计算需要」），同时 `InteractionDelegate.panMove(clientX, clientY, canvasWidth, canvasHeight)`（L276）也吃这两个参数——即同一份画布尺寸目前**既塞进每个 pointermove 原子事件、又作为 Delegate 方法入参**，重复且把环境上下文混进了描述单次指针的原子事件。

**外移方向**：画布尺寸是**画布环境上下文**（在一次拖拽期间基本不变），不是「单次指针」的物理属性，应由持有画布的一方（Delegate / App）提供，而非每个原子事件携带。

1. 从 `PointerMoveInput` 删除 `canvasWidth/canvasHeight`。
2. `InteractionDelegate` 增加画布尺寸的获取入口（二选一，落地时按 Delegate 现有形态定）：
   - 方案 a：Delegate 暴露 `getCanvasSize(): { width: number; height: number }`，`panMove` 内部自取，签名简化为 `panMove(clientX, clientY)`；
   - 方案 b：Delegate 在初始化/resize 时记录画布尺寸为内部字段，`panMove` 读内部字段，签名同样简化为 `panMove(clientX, clientY)`。
3. `InteractionStateMachine` 中调用 `panMove` 的位置不再从 `input` 取 `canvasWidth/canvasHeight`。
4. 上层适配器（`useInteraction`）构造 `pointermove` 时不再计算/传 `canvasWidth/canvasHeight`。

> 外移与 G1/G2/G4 同列归本 spec（三态 spec 决议第 5 条明确「canvasWidth/canvasHeight 外移不绑进 G3，与 G1/G2/G4 同列、一并归入原子事件跨平台化 spec 收口」）。

---

## 实施步骤（可执行）

**步骤 1：契约层（banvasgl types）**

- `packages/banvasgl/src/types/interaction.ts`：
  - 抽出 `PointerInputBase`，加入 `pointerId`、`pointerType`、可选 `pressure`/`tiltX`/`tiltY`（G1 + G4）。
  - `PointerDownInput`/`Move`/`Up` 改为继承基类；`button` 在 `PointerDownInput` 降级为可选 `button?`。
  - 新增 `PointerCancelInput`（G2），并入 `InteractionInput` 联合。
  - 从 `PointerMoveInput` 删除 `canvasWidth`/`canvasHeight`（外移）。

**步骤 2：状态机（banvasgl）**

- `packages/banvasgl/src/engine/interaction/InteractionStateMachine.ts`：
  - 新增 `onPointerCancel(input: PointerCancelInput)` 分支：把进行中的拖拽/缩放/旋转/框选等状态安全收尾并复位（语义同「非正常结束的 pointerup」，但不产生 click/drop 这类「正常完成」语义）。
  - `handle()` 的判别分发加入 `case 'pointercancel'`。
  - `panMove` 调用处不再从 `input` 取画布尺寸，改用 Delegate 提供的画布尺寸入口（见外移方案）。
  - 多指相关识别**不在本步实现**（属 banvas-runtime 识别器），但状态机需保证 `pointerId` 不同的并发指针不互相串扰其单指状态（最小要求：以 primary pointer 驱动现有单指逻辑，非 primary pointer 暂不影响编辑态状态）。

**步骤 3：Delegate 接口（banvasgl）**

- `packages/banvasgl/src/types/interaction.ts` 的 `InteractionDelegate`：按外移方案 a/b 之一调整 `panMove` 签名与画布尺寸入口，并同步所有 `InteractionDelegate` 实现处。

**步骤 4：编辑态适配层（banyan/frontend，PC 退化适配）**

- `apps/banyan/frontend/src/hooks/useInteraction.ts`：
  - 构造 `pointerdown/move/up` 时补 `pointerId`、`pointerType`（PC 鼠标恒为 `'mouse'`、`pointerId` 取 `e.pointerId` 或恒定值）；`pressure/tilt` 在 PC 端可不传（可选字段）。
  - 删除 `pointermove` 里的 `canvasWidth/canvasHeight` 构造。
  - 编辑态为 PC-only，**不新增 touch/pen 分支**，`pointercancel` 在 PC 端可由 `mouseleave`/`pointercancel` DOM 事件映射（按需），保持「退化为最简单 mouse/key 直译」的定位。

**步骤 5：运行态适配层（banvas-runtime，跨平台适配点）**

> banvas-runtime 包本身由 `tristate-unified-engine.md` 实施步骤 3 创建。本步是其输入适配器吃下 touch/pen 的具体化，依赖移动端真实需求，按需排期。

- banvas-runtime 的输入适配器：监听原生 `pointerdown/move/up/cancel`（或 mouse+touch 回退），统一翻译成 `InteractionInput`，填充真实 `pointerType`/`pointerId`/`pressure`/`tilt`。
- 这是「原生事件→InteractionInput」唯一的跨平台落点（M10a 约束）；banvasgl 仍不接触原生事件。

**步骤 6：验证**（见验收标准）

---

## 验收标准

1. **契约硬件无关**：`InteractionInput` 中每个 pointer 类型都含 `pointerId`/`pointerType`，含可选 `pressure`/`tiltX`/`tiltY`；存在 `pointercancel` 类型；`PointerMoveInput` 不再含 `canvasWidth`/`canvasHeight`；契约内无任何 `mouse*`/`touch*` 命名的事件类型（仍满足 M10a 反例约束）。
2. **banvasgl 仍不接触原生事件**：grep banvasgl 包内无 `addEventListener('mousedown'|'touchstart'|'pointerdown'...)` 等原生事件监听（归一化仍在上层适配器）。
3. **pointercancel 不卡死**：构造一段「pointerdown → 多次 pointermove → pointercancel」序列喂给 `InteractionStateMachine`，断言状态机回到 idle、未残留进行中拖拽/缩放状态、且**不**产生 click/drop 语义。
4. **canvasWidth 外移不回归**：编辑器内画布平移（pan）行为与外移前一致（拖拽空白处平移正确），`panMove` 不再从原子事件取画布尺寸。
5. **多指不串扰（最小要求）**：两个不同 `pointerId` 的并发 `pointermove` 不破坏单指编辑态（primary pointer 逻辑正常，非 primary 不误触发缩放/选中）。
6. **编辑态零回归**：PC 编辑器的移动/缩放/旋转/框选/文本编辑、多选（G3 修饰键路径）全部正常。
7. **构建零错误**：`pnpm build:all` 通过。

---

## 影响范围

| 文件 | 改动类型 |
|------|---------|
| `packages/banvasgl/src/types/interaction.ts` | `InteractionInput` 重构（G1/G2/G4 字段 + 删 canvasWidth）；`InteractionDelegate.panMove` 签名调整 |
| `packages/banvasgl/src/engine/interaction/InteractionStateMachine.ts` | 新增 `onPointerCancel` 分支 + 判别分发；`panMove` 调用改读 Delegate 画布尺寸；多指不串扰保护 |
| `packages/banvasgl/src/engine/...`（Delegate 实现处） | 同步 `panMove` 签名 + 画布尺寸入口 |
| `apps/banyan/frontend/src/hooks/useInteraction.ts` | 构造原子事件补 pointerId/pointerType；删 canvasWidth 构造；pointercancel 映射（PC 退化适配） |
| `packages/banvas-runtime/`（输入适配器） | touch/pen → InteractionInput 跨平台翻译（步骤 5，依赖移动端需求按需排期） |

> 注意：本 spec 不改 `IViewEvents` / `View.events` 键集合，也不实现任何高级手势识别器；它只把原子事件层的字段入口补齐到「跨平台能力可在其上构建」的状态。

---

## 与既有 spec / ADR 的引用关系

- 决策权威：engine / mechanism / **M10a**（本 spec 的「关联决策」）。
- 论证与缺口表来源：`docs/specs/engine/tristate-unified-engine.md`「banvasgl 暴露的原子事件契约」节（目标草案 + G1~G4 缺口表 + 平台适配落点 + 能力天花板三条本质关系）。
- G3 承载：`docs/specs/engine/tristate-unified-engine.md`「G3 子任务」节（本 spec 的前置）。
- banvas-runtime 建包：`docs/specs/engine/tristate-unified-engine.md` 实施步骤 3（本 spec 步骤 5 在其上具体化跨平台输入适配）。
