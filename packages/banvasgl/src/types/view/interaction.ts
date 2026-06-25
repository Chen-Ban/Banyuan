/**
 * 交互类型 —— 光标、动作、交互结果数据
 *
 * 从 view.ts 中抽离，作为叶子文件存在，不依赖 view/addon/animation，
 * 用于打断 view.ts → animation.ts → addon.ts → view.ts 的循环依赖。
 */

import type { Point3 } from '@/foundation/math'
// Cursor / Action 枚举值定义已迁移至 foundation/constants（打破 barrel 循环依赖），
// 此处仅作为类型引用使用判别联合。
import type { Cursor, Action } from '@/foundation/constants'

// ────────────────────────────────────────────
//  ExtraData 判别联合
// ────────────────────────────────────────────

interface ExtraDataBase {
  cursorStyle: Cursor
}

export interface MoveData extends ExtraDataBase {
  action: Action.MOVE
}

export interface ResizeData extends ExtraDataBase {
  action: Action.RESIZE
  resizeFixedIndex: number
  resizeDynamicIndex: number
}

export interface RotateData extends ExtraDataBase {
  action: Action.ROTATE
}

export interface EditPointData extends ExtraDataBase {
  action: Action.EDIT_POINT
  editPoint: Point3
}

export interface EditViewportData extends ExtraDataBase {
  action: Action.EDIT_VIEWPORT
  viewPortPoint: Point3
}

export interface SelectData extends ExtraDataBase {
  action: Action.SELECT
}

export interface TextSelectionData extends ExtraDataBase {
  action: Action.TEXT_SELECTION
}

export interface NoneData extends ExtraDataBase {
  action: Action.NONE
}

export interface ConnectData extends ExtraDataBase {
  action: Action.CONNECT
  /** 触发连线的源端口 View id */
  portViewId: string
}

/** 交互结果数据 —— 判别联合，通过 action 字段收窄类型 */
export type ExtraData =
  | MoveData
  | ResizeData
  | RotateData
  | EditPointData
  | EditViewportData
  | SelectData
  | TextSelectionData
  | ConnectData
  | NoneData
