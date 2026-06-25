/**
 * 原子事件输入类型 —— 硬件无关的事件契约
 *
 * 定义 banvasgl 向上层传递的标准化输入事件格式。
 * 上层（状态机 / 手势识别器等）消费这些类型驱动交互逻辑。
 *
 * 覆盖 W3C 常见原子事件：
 *   - Pointer: pointerdown / pointermove / pointerup / pointercancel / pointerenter / pointerleave
 *   - Keyboard: keydown / keyup
 *   - Wheel: wheel
 *   - Focus: focus / blur
 *   - Drag（引擎内拖拽语义，非 HTML5 DnD）: dragstart / dragmove / dragend
 *   - Composition（IME 输入法）: compositionstart / compositionupdate / compositionend
 */

import type { Point3 } from '@/foundation/math'

// ════════════════════════════════════════════
//  指针事件输入（W3C Pointer Events）
// ════════════════════════════════════════════

/**
 * 指针类公共基类：硬件无关，设备差异降为属性（G1/G4）
 *
 * 所有 pointer* 事件共享的字段集合。
 * pointerId / pointerType 让状态机能区分输入设备与并发指针。
 * pressure / tiltX / tiltY 为触控笔压感、倾角预留标准入口。
 */
export interface PointerInputBase {
  /** 世界坐标 */
  worldPoint: Point3
  /** 客户端坐标（用于 pan） */
  clientX: number
  clientY: number
  /** G1：多指 / 多设备区分（对应 W3C PointerEvent.pointerId） */
  pointerId: number
  /** G1：硬件无关的设备标签 */
  pointerType: 'mouse' | 'touch' | 'pen'
  /** G4：0~1 压感值，鼠标恒为 0.5 或 0，笔/触摸给真实压感 */
  pressure?: number
  /** G4：触控笔倾角（绕 Y 轴），单位 度 */
  tiltX?: number
  /** G4：触控笔倾角（绕 X 轴），单位 度 */
  tiltY?: number
}

export interface PointerDownInput extends PointerInputBase {
  type: 'pointerdown'
  /** 鼠标按钮（触摸/笔可不传，默认视为主按钮） */
  button?: number
}

export interface PointerMoveInput extends PointerInputBase {
  type: 'pointermove'
}

export interface PointerUpInput extends PointerInputBase {
  type: 'pointerup'
}

/** G2：系统取消事件（来电、手势冲突、滚动接管等） */
export interface PointerCancelInput extends PointerInputBase {
  type: 'pointercancel'
}

/**
 * 指针进入目标区域（不冒泡，对应 W3C pointerenter）
 *
 * 用于 onMouseEnter / hover 检测场景。
 */
export interface PointerEnterInput extends PointerInputBase {
  type: 'pointerenter'
}

/**
 * 指针离开目标区域（不冒泡，对应 W3C pointerleave）
 *
 * 用于 onMouseLeave / hover 退出场景。
 */
export interface PointerLeaveInput extends PointerInputBase {
  type: 'pointerleave'
}

// ════════════════════════════════════════════
//  键盘事件输入（W3C Keyboard Events）
// ════════════════════════════════════════════

export interface KeyDownInput {
  type: 'keydown'
  /** W3C KeyboardEvent.code — 物理键位（如 'KeyA', 'Space'） */
  code: string
  /** 是否为长按重复触发 */
  repeat: boolean
  /** 修饰键状态快照 */
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export interface KeyUpInput {
  type: 'keyup'
  code: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

// ════════════════════════════════════════════
//  滚轮事件输入（W3C WheelEvent）
// ════════════════════════════════════════════

/**
 * 滚轮事件 —— 用于画布缩放、滚动
 *
 * deltaX / deltaY / deltaZ 遵循 W3C WheelEvent 标准：
 *   - deltaMode 默认为 pixel 模式
 *   - 正值 = 向右/向下/远离屏幕
 */
export interface WheelInput {
  type: 'wheel'
  /** 世界坐标（缩放中心） */
  worldPoint: Point3
  /** 客户端坐标 */
  clientX: number
  clientY: number
  /** 水平滚动量（像素） */
  deltaX: number
  /** 垂直滚动量（像素） */
  deltaY: number
  /** 深度滚动量（像素），通常为 0 */
  deltaZ?: number
  /** 修饰键状态（Ctrl+wheel 常用于缩放） */
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

// ════════════════════════════════════════════
//  焦点事件输入（W3C FocusEvent）
// ════════════════════════════════════════════

/**
 * 目标获得焦点
 *
 * 对应 IViewEvents.onFocus。
 * relatedTargetId 为失去焦点的目标 View ID（可选）。
 */
export interface FocusInput {
  type: 'focus'
  /** 获得焦点的 View ID */
  targetId: string
  /** 先前拥有焦点的 View ID（可选） */
  relatedTargetId?: string
}

/**
 * 目标失去焦点
 *
 * 对应 IViewEvents.onBlur。
 * relatedTargetId 为即将获得焦点的目标 View ID（可选）。
 */
export interface BlurInput {
  type: 'blur'
  /** 失去焦点的 View ID */
  targetId: string
  /** 即将获得焦点的 View ID（可选） */
  relatedTargetId?: string
}

// ════════════════════════════════════════════
//  拖拽事件输入（引擎内拖拽语义）
// ════════════════════════════════════════════
//
// 注意：这里的 Drag 是引擎内的高级拖拽语义（由状态机或手势识别器
// 从 pointer 序列中识别出来），非 HTML5 DragEvent。
// 对应 IViewEvents 的 onDragStart / onDrag / onDragEnd。

/** 拖拽事件公共字段 */
export interface DragInputBase {
  /** 当前世界坐标 */
  worldPoint: Point3
  /** 客户端坐标 */
  clientX: number
  clientY: number
  /** 发起拖拽的指针 ID */
  pointerId: number
  pointerType: 'mouse' | 'touch' | 'pen'
}

/**
 * 拖拽开始 —— 由手势识别器在 pointer 移动超过阈值时派发
 */
export interface DragStartInput extends DragInputBase {
  type: 'dragstart'
  /** 拖拽起始世界坐标 */
  startWorldPoint: Point3
}

/**
 * 拖拽进行中（高频派发）
 */
export interface DragMoveInput extends DragInputBase {
  type: 'dragmove'
  /** 拖拽累计位移（相对起点） */
  deltaX: number
  deltaY: number
}

/**
 * 拖拽结束
 */
export interface DragEndInput extends DragInputBase {
  type: 'dragend'
  /** 是否被取消（pointercancel 导致的中断） */
  cancelled?: boolean
}

// ════════════════════════════════════════════
//  IME 组合输入事件（W3C CompositionEvent）
// ════════════════════════════════════════════
//
// 用于文本编辑中的输入法组合流程。
// 上层 TextInteraction 消费这些事件驱动文本修改。

/**
 * 输入法组合开始
 */
export interface CompositionStartInput {
  type: 'compositionstart'
  /** 目标 View ID（正在编辑的文本视图） */
  targetId: string
}

/**
 * 输入法组合更新（用户选字/拼音变化）
 */
export interface CompositionUpdateInput {
  type: 'compositionupdate'
  targetId: string
  /** 当前组合文本（预览态） */
  data: string
}

/**
 * 输入法组合结束（用户确认输入）
 */
export interface CompositionEndInput {
  type: 'compositionend'
  targetId: string
  /** 最终确认的文本 */
  data: string
}

// ════════════════════════════════════════════
//  输入事件联合
// ════════════════════════════════════════════

/** 指针类输入事件联合 */
export type PointerInput =
  | PointerDownInput
  | PointerMoveInput
  | PointerUpInput
  | PointerCancelInput
  | PointerEnterInput
  | PointerLeaveInput

/** 键盘类输入事件联合 */
export type KeyboardInput = KeyDownInput | KeyUpInput

/** 拖拽类输入事件联合 */
export type DragInput = DragStartInput | DragMoveInput | DragEndInput

/** IME 组合类输入事件联合 */
export type CompositionInput = CompositionStartInput | CompositionUpdateInput | CompositionEndInput

/**
 * 全部原子事件输入联合类型
 *
 * 上层状态机 / 手势识别器通过 `type` 字段做判别联合分派。
 */
export type InteractionInput =
  | PointerInput
  | KeyboardInput
  | WheelInput
  | FocusInput
  | BlurInput
  | DragInput
  | CompositionInput
