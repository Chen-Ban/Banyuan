/**
 * Hook 公共接口层 —— useBanvas 对外暴露的数据结构与操作接口
 *
 * 设计原则：
 * 1. 只暴露只读的描述性数据，不暴露内部 class 实例
 * 2. 所有写操作通过 Actions 命名空间化对象执行
 * 3. 零循环依赖：只引用 constants 枚举和其他接口类型
 */

import type { VIEWTYPE, GRAPHTYPE } from '@/core/constants'

// ────────────────────────────────────────────
//  组件模板数据（Component Template）
// ────────────────────────────────────────────

/** 组件模板分类 */
export type ComponentCategory = 'basic' | 'text' | 'media' | 'container' | 'custom'

/**
 * 组件模板描述
 *
 * 代表组件物料面板中的一项，用户拖拽模板到画布即可创建对应 View 实例。
 * 画布库不持有模板列表，由业务层注册和管理。
 */
export interface IComponentTemplate {
    /** 模板唯一标识 */
    id: string
    /** 对应创建的视图类型 */
    viewType: VIEWTYPE
    /** 对应的图形类型（仅 GRAPHVIEW 需要） */
    graphType?: GRAPHTYPE
    /** 面板中显示的名称 */
    name: string
    /** 面板中显示的图标（URL 或 icon name） */
    icon?: string
    /** 分类 */
    category: ComponentCategory
    /** 创建实例时的默认构造参数 */
    defaultProps?: Record<string, any>
}

// ────────────────────────────────────────────
//  页面 & 容器树（Layers Panel 数据）
// ────────────────────────────────────────────

/**
 * 视图节点（树形结构）
 *
 * 用于 Layers 面板渲染，支持双向联动：
 * - 点击树节点 → actions.view.select(id)
 * - 画布选中元素 → selected/actived 更新 → React 重渲染面板
 */
export interface IViewNode {
    /** 视图唯一标识 */
    id: string
    /** 视图类型 */
    type: VIEWTYPE
    /** 图形类型（仅 GraphView） */
    graphType?: GRAPHTYPE
    /** 显示名称 */
    name: string
    /** 是否可见 */
    visible: boolean
    /** 是否锁定（锁定后不可选中/编辑） */
    locked: boolean
    /** 是否处于选中状态 */
    selected: boolean
    /** 是否处于激活状态（双击进入编辑） */
    actived: boolean
    /** 嵌套深度（从 0 开始，根容器 = 0） */
    depth: number
    /** 子节点列表 */
    children: IViewNode[]
}

/**
 * 页面节点
 *
 * 对应 App 下的一个 Scene，包含其容器树。
 */
export interface IPageNode {
    /** 场景唯一标识 */
    id: string
    /** 页面名称 */
    name: string
    /** 是否为当前活跃页面 */
    isCurrent: boolean
    /** 在页面栈中的索引 */
    index: number
    /** 该页面下的视图容器树 */
    children: IViewNode[]
}

// ────────────────────────────────────────────
//  Actions 操作接口（替代直接暴露 App）
// ────────────────────────────────────────────

/** 视图操作 */
export interface IViewActions {
    /** 选中指定视图 */
    select(viewId: string): void
    /** 取消所有选中 */
    deselect(): void
    /** 滚动画布使指定视图进入视口 */
    scrollTo(viewId: string): void
    /** 删除指定视图 */
    delete(viewId: string): void
    /** 调整视图在父容器中的层级顺序 */
    reorder(viewId: string, newIndex: number): void
    /** 根据模板创建新视图 */
    create(template: IComponentTemplate, position: { x: number; y: number }): string | null
    /** 设置视图可见性 */
    setVisible(viewId: string, visible: boolean): void
    /** 设置视图锁定状态 */
    setLocked(viewId: string, locked: boolean): void
    /** 重命名视图 */
    rename(viewId: string, name: string): void
}

/** 页面操作 */
export interface IPageActions {
    /** 导航到指定页面 */
    navigateTo(pageId: string): void
    /** 新增页面 */
    add(name?: string): string | null
    /** 删除页面 */
    remove(pageId: string): void
    /** 重命名页面 */
    rename(pageId: string, name: string): void
    /** 调整页面顺序 */
    reorder(pageId: string, newIndex: number): void
    /** 复制页面 */
    duplicate(pageId: string): string | null
}

/** 历史操作（撤销/重做） */
export interface IHistoryActions {
    /** 撤销 */
    undo(): boolean
    /** 重做 */
    redo(): boolean
    /** 是否可以撤销 */
    canUndo: boolean
    /** 是否可以重做 */
    canRedo: boolean
}

/**
 * 命名空间化的操作对象
 *
 * 替代直接暴露 App 实例，提供安全的、白名单式的命令式 API。
 * 业务层通过 `actions.view.select(id)` 形式调用。
 */
export interface IBanvasActions {
    view: IViewActions
    page: IPageActions
    history: IHistoryActions
}

// ────────────────────────────────────────────
//  Hook 返回值
// ────────────────────────────────────────────

/**
 * useBanvas Hook 的新版返回值类型
 *
 * 特征：
 * - 不暴露 App / Scene 实例
 * - 通过 pages 提供只读的页面 + 容器树数据
 * - 通过 actions 提供所有可用操作
 * - Banvas 仍然是 React 元素，业务方直接渲染
 */
export interface IUseBanvasResult {
    /** Canvas 渲染元素 */
    Banvas: React.ReactElement
    /** 页面列表（含容器树），响应式更新 */
    pages: IPageNode[]
    /** 当前活跃页面 ID */
    currentPageId: string | null
    /** 当前选中视图 ID */
    selectedViewId: string | null
    /** 命名空间化的操作接口 */
    actions: IBanvasActions
}
