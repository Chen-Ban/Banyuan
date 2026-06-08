/**
 * 交互类型 —— 光标、动作、交互结果数据
 *
 * 从 view.ts 中抽离，作为叶子文件存在，不依赖 view/addon/animation，
 * 用于打断 view.ts → animation.ts → addon.ts → view.ts 的循环依赖。
 */

import type { Point3 } from '@/foundation/math'

// ────────────────────────────────────────────
//  Cursor 枚举
// ────────────────────────────────────────────

export enum Cursor {
    // 基本值
    Auto = 'auto',
    Default = 'default',
    None = 'none',

    // 链接和状态指示
    ContextMenu = 'context-menu',
    Help = 'help',
    Pointer = 'pointer',
    Progress = 'progress',
    Wait = 'wait',

    // 选择
    Cell = 'cell',
    Crosshair = 'crosshair',
    Text = 'text',
    VerticalText = 'vertical-text',

    // 拖拽
    Alias = 'alias',
    Copy = 'copy',
    Move = 'move',
    NoDrop = 'no-drop',
    NotAllowed = 'not-allowed',
    Grab = 'grab',
    Grabbing = 'grabbing',

    // 滚动
    AllScroll = 'all-scroll',

    // 调整大小
    ColResize = 'col-resize',
    RowResize = 'row-resize',
    NResize = 'n-resize',
    EResize = 'e-resize',
    SResize = 's-resize',
    WResize = 'w-resize',
    NeResize = 'ne-resize',
    NwResize = 'nw-resize',
    SeResize = 'se-resize',
    SwResize = 'sw-resize',
    EwResize = 'ew-resize',
    NsResize = 'ns-resize',
    NeswResize = 'nesw-resize',
    NwseResize = 'nwse-resize',

    // 缩放
    ZoomIn = 'zoom-in',
    ZoomOut = 'zoom-out',
}

/** BoundingBox 8 个缩放手柄索引 → 光标样式映射 */
export const cursorMap: Record<number, Cursor> = {
    0: Cursor.NwResize, // 西北
    1: Cursor.NResize, // 北
    2: Cursor.NeResize, // 东北
    3: Cursor.EResize, // 东
    4: Cursor.SeResize, // 东南
    5: Cursor.SResize, // 南
    6: Cursor.SwResize, // 西南
    7: Cursor.WResize, // 西
}

// ────────────────────────────────────────────
//  Action 枚举
// ────────────────────────────────────────────

export enum Action {
    MOVE,
    RESIZE,
    ROTATE,
    EDIT_POINT,
    EDIT_VIEWPORT,
    SELECT,
    TEXT_SELECTION,
    CONNECT,   // 端口连线
    NONE,
}

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
