/**
 * Hook 返回值类型定义
 *
 * useDesignBanvas 等 hook 的返回值类型。
 * 这是 UI 层的类型，不属于 BanvasGL 引擎核心。
 */

import type { IBanvasActions } from '@banyuan/banvasgl'
import type { IContextMenuState } from './contextMenu'

/**
 * 拖拽属性 —— 绑定到可拖拽元素上的 props
 *
 * 业务方 spread 到 DOM 元素即可完成拖拽协议：
 * ```tsx
 * <div {...dragProps(material)}>...</div>
 * ```
 */
export interface IDragProps {
    draggable: true
    onDragStart: (e: any) => void
}

/**
 * useDesignBanvas Hook 的返回值类型
 *
 * 特征：
 * - 不暴露 App / Scene 实例
 * - 通过 pages 提供只读的页面 + 容器树数据
 * - 通过 actions 提供所有可用操作
 * - Banvas 仍然是 React 元素，业务方直接渲染
 */
export interface IUseBanvasResult<TElement = unknown> {
    /** Canvas 渲染元素（React.ReactElement 或其他 UI 框架元素） */
    Banvas: TElement
    /** 当前活跃页面 ID */
    currentPageId: string | null
    /** 当前选中视图 ID（空字符串表示未选中） */
    selectedViewId: string
    /** 命名空间化的操作接口 */
    actions: IBanvasActions
    /** 右键菜单上下文 */
    contextMenu: IContextMenuState
}
