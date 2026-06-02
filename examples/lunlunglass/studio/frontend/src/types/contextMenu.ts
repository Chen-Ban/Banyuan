/**
 * 右键菜单类型定义
 */

/** 单个菜单项 */
export interface IContextMenuItem {
    /** 唯一标识 */
    key: string
    /** 显示文本 */
    label: string
    /** 执行操作 */
    handler: () => void
    /** 是否禁用 */
    disabled?: boolean
    /** 该项前显示分割线 */
    divider?: boolean
}

/** 右键菜单上下文状态 */
export interface IContextMenuState {
    /** 是否可见 */
    visible: boolean
    /** 右键位置（相对于画布容器） */
    position: { x: number; y: number }
    /** 命中目标类型 */
    target: 'canvas' | 'view'
    /** 命中的 View ID（target 为 'view' 时有值） */
    viewId: string | null
    /** 预生成的菜单项列表 */
    items: IContextMenuItem[]
    /** 关闭菜单 */
    dismiss: () => void
}
