/**
 * Hook 公共接口层 —— useDesignBanvas 对外暴露的数据结构与操作接口
 *
 * 设计原则：
 * 1. 只暴露只读的描述性数据，不暴露内部 class 实例
 * 2. 所有写操作通过 Actions 命名空间化对象执行
 * 3. 零循环依赖：只引用 constants 枚举和其他接口类型
 */

import type View from '@/view/View/View'
import type { Point3 } from '@/foundation'
import type { Cursor } from '@/foundation/constants'
import type { IFieldSchema, IFieldSchemaMap, EventHandler, IViewEvents, IViewLifetimes, IInteractResult, ViewTypeMap } from '../view/view'
import type { ISceneLifetimes, IScene } from '../engine/scene'
import type { IAppLifetimes } from '../engine/app'
import type { IMaterialActions } from '../material/material.js'

import type { IDrawingContext } from '../platform/drawing.js'

// Re-export IMaterialActions 供外部类型引用
export type { IMaterialActions }


// ────────────────────────────────────────────
//  Actions 操作接口（替代直接暴露 App）
// ────────────────────────────────────────────

/** 视图操作 */
export interface IViewActions {
/** 选中指定视图 */
select(viewId: string, multiple?: boolean): void
    /** 取消所有选中 */
    deselect(): void
    /** 批量激活：一次性设置多个视图为 actived（最后一个为 selected） */
    batchActivate(viewIds: Set<string>): void
    /** 全选当前页面所有视图 */
    selectAll(): void
    /** 滚动画布使指定视图进入视口 */
    scrollTo(viewId: string): void
    /** 删除指定视图 */
    delete(viewId: string): void
    /** 调整视图在父容器中的层级顺序 */
    reorder(viewId: string, newIndex: number): void
    /** 设置视图可见性 */
    setVisible(viewId: string, visible: boolean): void
    /** 设置视图锁定状态 */
    setLocked(viewId: string, locked: boolean): void
    /** 重命名视图 */
    rename(viewId: string, name: string): void
    /** 复制视图到内部剪贴板 */
    copy(viewId: string): void
    /** 粘贴视图（替换指定视图，或粘贴到指定位置） */
    paste(target: { viewId: string } | { position: { x: number; y: number } }): string | null
    /** 将视图置于顶层 */
    bringToFront(viewId: string): void
    /** 将视图置于底层 */
    sendToBack(viewId: string): void
    /** 将多个视图组合为一个 CombinedView */
    group(viewIds: string[]): string | null
    /** 取消组合（解散 CombinedView，子视图回到场景中） */
    ungroup(viewId: string): string[] | null

    // ── 属性面板支持 ──

    /** 获取 View 实例（供 PropertyPanel 读取属性） */
    getViewInstance(viewId: string): View | null
    /** 获取 View 的 data 字段定义表 */
    getViewData(viewId: string): IFieldSchemaMap
    /** 设置 View 的单个 data 字段（新增或更新） */
    setViewData(viewId: string, key: string, schema: IFieldSchema): void
    /** 删除 View 的单个 data 字段 */
    deleteViewData(viewId: string, key: string): void
    // ── 事件与生命周期 ──

    /** 获取 View 的事件绑定表 */
    getViewEvents(viewId: string): IViewEvents
    /** 设置 View 的单个事件处理器 */
    setViewEvent(viewId: string, eventName: keyof IViewEvents, handler: EventHandler): void
    /** 删除（清空）View 的单个事件处理器 */
    deleteViewEvent(viewId: string, eventName: keyof IViewEvents): void
    /** 获取 View 的生命周期钩子表 */
    getViewLifetimes(viewId: string): IViewLifetimes
    /** 设置 View 的单个生命周期钩子 */
    setViewLifetime(viewId: string, lifetimeName: keyof IViewLifetimes, handler: EventHandler): void
    /** 删除（清空）View 的单个生命周期钩子 */
    deleteViewLifetime(viewId: string, lifetimeName: keyof IViewLifetimes): void

    /**
     * 读取 View 的属性值（通过 propadapters 正确分解）
     *
     * 对于 spatial 属性（x/y/rotation），会从矩阵中正确分解出逻辑值，
     * 而非直接读取矩阵的原始分量。
     */
    getProperty(viewId: string, prop: string): number | undefined
    /** 获取所有 actived 的 View ID 列表（多选时用于偏移应用） */
    getActivedViewIds(): string[]
    /**
     * 修改属性（含偏移应用到其他 actived View + 事务）
     *
     * 对 selected View 设置绝对值，对其他 actived View 应用偏移：
     * - spatial/direct 属性：加法偏移（delta = newValue - oldValue）
     * - size 属性：乘法缩放（ratio = newValue / oldValue）
     */
    setProperty(prop: string, value: number): void
    /** 批量修改属性 */
    setProperties(props: Record<string, number>): void
    /**
     * 修改 View.content 上的属性（如 RoundedRect 的 radii）
     *
     * @param method - content 上的方法名（如 'setAllRadii', 'setRadius'）
     * @param args - 传给方法的参数
     */
    setContentMethod(method: string, args: any[]): void
    /**
     * 修改 View.style 上的属性（如 overflow, layoutMode 等）
     * 直接设置值并触发 notify，确保 React 状态同步更新。
     */
    setViewStyle(viewId: string, prop: string, value: unknown): void
    /** 开始属性编辑事务（输入框聚焦时调用） */
    beginPropertyEdit(): void
    /** 提交属性编辑事务（输入框失焦/回车时调用） */
    commitPropertyEdit(): void
    /** 回滚属性编辑事务（按 Esc 时调用） */
    rollbackPropertyEdit(): void

    // ── 事件触发（运行态使用） ──

    /**
     * 触发 View 上绑定的事件 FlowSchema
     *
     * 运行态识别器识别出高级交互后，通过此方法派发到对应 View 的 events。
     * 内部调用 Scene.triggerSchema，受 flowEnabled gate 控制。
     *
     * @param viewId    目标视图 ID
     * @param eventKey  IViewEvents 中的事件键（如 'onClick'）
     * @param eventArgs 事件参数列表
     */
    triggerEvent(viewId: string, eventKey: keyof IViewEvents, eventArgs?: unknown[]): void

    // ── 命中检测 ──

    /**
     * 对当前页面做命中检测，返回最上层命中的交互结果
     *
     * 内部遍历所有顶层视图并调用 view.interact()，
     * 业务层无需关心 bufferCtx 等引擎内部细节。
     *
     * @param point 世界坐标点
     * @returns 命中结果（view/content/extraData），未命中时各字段为 null
     */
    hitTest(point: Point3): IInteractResult
    /**
     * 对当前页面做命中检测，返回所有命中的交互结果（按遍历顺序）
     *
     * @param point 世界坐标点
     * @returns 所有命中结果数组，未命中时返回空数组
     */
    hitTestAll(point: Point3): IInteractResult[]

    // ── 交互层底层支持 ──

    /**
     * 增强版命中检测，返回完整的交互信息（含 cursor 和 action）
     *
     * 与 hitTest 的区别：hitTestDetailed 额外返回 cursor 样式，
     * 供交互层确定鼠标光标和交互动作类型。
     *
     * @param point 世界坐标点
     */
    hitTestDetailed(point: Point3): IInteractResult & { cursor: Cursor }
    /**
     * 获取离屏 Canvas 上下文（命中检测底层用）
     *
     * 仅供交互层内部需要逐 view 调用 view.interact() 的场景使用，
     * 一般业务层应优先使用 hitTest / hitTestAll / hitTestDetailed。
     */
    getBufferContext(): IDrawingContext | null
    /**
     * 添加临时视图到当前页面（不记录事务）
     *
     * 用于交互过程中的瞬态辅助视图（如框选矩形、临时连线），
     * 这些视图不应进入 undo 栈。
     */
    addTempChild(view: View): void
    /**
     * 从当前页面移除临时视图（不记录事务）
     */
    removeTempChild(view: View): void
    /**
     * 获取所有 actived 的 View 实例列表
     *
     * 与 getActivedViewIds() 的区别：返回 View 实例而非 ID，
     * 供交互层直接操作视图（translate/resize/rotate）。
     */
    getAllActivedViews(): View[]
    /**
     * 获取当前 selected 的 View 实例
     *
     * selected 是 actived 中被标记为主选中的那个视图（属性面板显示其属性）。
     *
     * @param viewType 可选，指定视图类型过滤。传入后仅当选中视图匹配该类型时返回，否则返回 null。
     *
     * @example
     * // 获取任意选中视图
     * const view = actions.view.getSelectedView()
     * // 仅当选中的是 TextView 时返回
     * const textView = actions.view.getSelectedView(ViewType.TEXTVIEW)
     */
    getSelectedView(): View | null
    getSelectedView<T extends keyof ViewTypeMap>(viewType: T): ViewTypeMap[T] | null
    /**
     * 扁平化当前页面视图树
     *
     * 递归展开所有容器视图的子节点，返回扁平列表。
     * 用于 Tab 切换、全局搜索等需要遍历所有视图的场景。
     */
    flattenViewTree(): View[]
    /**
     * 批量平移所有 actived 视图
     */
    translateActived(dx: number, dy: number): void
    /**
     * 开始对齐辅助线
     *
     * 内部自动将所有 actived views 作为排除对象（即被拖动的视图不参与吸附计算）。
     */
    snapAlignBegin(): void
    /**
     * 执行一次吸附计算
     *
     * @param viewId 参考视图 ID（通常是被拖动的视图）
     * @returns 吸附偏移量
     */
    snapAlignSnap(viewId: string): { offsetX: number; offsetY: number }
    /**
     * 结束对齐辅助线
     */
    snapAlignEnd(): void

    // ── 物料操作（从 IMaterialActions 合并） ──

    /**
     * 将视图子树序列化为物料模板
     *
     * @param viewId - 要序列化的根视图 ID
     * @param config - 序列化配置
     * @returns 物料模板，失败返回 null
     */
    serializeMaterial: IMaterialActions['serialize']
    /**
     * 将物料模板实例化为视图并添加到当前场景
     *
     * @param material - 物料定义（含 meta + template）或仅 template
     * @param position - 放置位置
     * @param params - 参数填充值（key 为 paramId）
     * @returns 新创建的根视图 ID，失败返回 null
     */
    instantiateMaterial: IMaterialActions['instantiate']
}

/** 页面操作（含历史/事务） */
export interface IPageActions {
    /** 获取所有页面 ID 列表（按顺序） */
    getPageIds(): string[]
    /** 获取指定页面的所有顶层子 View ID 列表 */
    getPageViewIds(pageId: string): string[]
    /**
     * 获取当前页面的顶层子视图列表
     *
     * 用于业务层需要遍历当前页面顶层节点的场景（如框选、自定义渲染等），
     * 替代直接访问 scene.children。
     */
    getTopLevelViews(): View[]
    /** 获取页面数量 */
    getPageCount(): number
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
    /** 获取页面级 data 字段定义表 */
    getPageData(pageId: string): IFieldSchemaMap
    /** 设置页面级单个 data 字段（新增或更新） */
    setPageData(pageId: string, key: string, schema: IFieldSchema): void
    /** 删除页面级单个 data 字段 */
    deletePageData(pageId: string, key: string): void

    // ── 页面生命周期 ──

    /** 获取页面的生命周期钩子表 */
    getPageLifetimes(pageId: string): ISceneLifetimes
    /** 设置页面的单个生命周期钩子 */
    setPageLifetime(pageId: string, lifetimeName: keyof ISceneLifetimes, handler: EventHandler): void
    /** 删除（清空）页面的单个生命周期钩子 */
    deletePageLifetime(pageId: string, lifetimeName: keyof ISceneLifetimes): void

    // ── 历史/事务操作（从 IHistoryActions 合并） ──

    /** 撤销 */
    undo(): boolean
    /** 重做 */
    redo(): boolean
    /** 是否可以撤销 */
    canUndo: boolean
    /** 是否可以重做 */
    canRedo: boolean
    /**
     * 对指定 viewIds 开启事务
     *
     * 与 view.beginPropertyEdit() 的区别：
     * - beginPropertyEdit 对所有 actived views 开启事务（属性面板场景）
     * - beginTransaction 对指定 viewIds 开启事务（交互层精确控制）
     */
    beginTransaction(viewIds: string[]): void
    /** 提交当前事务 */
    commitTransaction(): void
    /** 回滚当前事务 */
    rollbackTransaction(): void

    // ── 视口平移（Pan） ──

    /** 当前是否处于平移模式 */
    readonly isPanning: boolean
    /**
     * 开始平移
     *
     * 当 Space 键按住或中键按下时由交互层调用。
     * 内部记录起始坐标，后续 panMove 根据 delta 计算世界坐标偏移。
     *
     * @param clientX 鼠标 clientX
     * @param clientY 鼠标 clientY
     * @returns true 表示进入 pan 模式（事件应被消费）
     */
    panStart(clientX: number, clientY: number): boolean
    /**
     * 平移中
     *
     * 根据鼠标移动 delta 计算世界坐标偏移并驱动 camera.pan()。
     * 画布尺寸由内部持有（通过 canvas 引用获取），不再从外部传入。
     *
     * @param clientX 当前 clientX
     * @param clientY 当前 clientY
     * @returns true 表示消费了该事件
     */
    panMove(clientX: number, clientY: number): boolean
    /**
     * 结束平移
     *
     * @returns true 表示之前确实在 pan 中（事件被消费）
     */
    panEnd(): boolean
    /**
     * 通知 Space 键按下/释放状态
     *
     * 交互层在 keydown/keyup 时调用。panStart 会检查此标志位（或中键）来决定是否进入 pan。
     */
    setSpaceHeld(held: boolean): void
    /** 当前 Space 键是否按住 */
    readonly isSpaceHeld: boolean
}

/** App 级操作 */
export interface IAppActions {
    /** 获取 App 生命周期钩子表 */
    getAppLifetimes(): IAppLifetimes
    /** 设置 App 的单个生命周期钩子 */
    setAppLifetime(lifetimeName: keyof IAppLifetimes, handler: EventHandler): void
    /** 删除（清空）App 的单个生命周期钩子 */
    deleteAppLifetime(lifetimeName: keyof IAppLifetimes): void
    /** 序列化完整 App 为 JSON 字符串（包含 lifetimes + scenes） */
    getSerializedApp(): string
    /**
     * 将当前画布内容导出为图片 DataURL
     *
     * @param type    图片 MIME 类型，默认 'image/png'
     * @param quality 图片质量（仅 jpeg/webp 有效，0~1），默认 0.92
     * @returns DataURL 字符串，若引擎未初始化则返回 null
     */
    exportImage(type?: string, quality?: number): string | null
    /**
     * 设置后端端点地址
     *
     * 设置后 callFlow 节点会将请求发到 `${endpoint}/api/functions/${flowId}`。
     * 传 undefined 则清除（callFlow 节点静默跳过）。
     *
     * - 预览态：设为本地 Preview Server 地址
     * - 退出预览态：设为 undefined
     */
    setBackendEndpoint(endpoint: string | undefined): void
    /** 获取当前后端端点地址 */
    getBackendEndpoint(): string | undefined
    /**
     * 获取应用设计尺寸（目标设备逻辑分辨率）
     */
    getDesignSize(): { width: number; height: number }
    /**
     * 设置应用设计尺寸，并同步更新 canvas 物理像素 + camera bounds。
     *
     * @param width  目标设备逻辑宽度（px）
     * @param height 目标设备逻辑高度（px）
     */
    setDesignSize(width: number, height: number): void
    /**
     * 通知 React 外部同步订阅者（useSyncExternalStore）状态已变更。
     * 当业务层在 actions 体系之外直接修改了 App/Scene 状态后调用此方法触发 re-render。
     */
    notify(): void
    /**
     * 获取当前活跃的 Scene 实例
     *
     * 供坐标转换等需要直接访问 Scene 的操作使用。
     *
     * @returns 当前 Scene，若 App 未初始化则返回 null
     */
    getCurrentScene(): IScene | null
    /**
     * 订阅引擎状态变更通知。返回取消订阅函数。
     *
     * 对应 App.subscribe，供业务层在 useSyncExternalStore 之外订阅引擎变更。
     * 典型用法：actions.app.subscribe(() => store.getState().markUIDirty())
     *
     * @param listener 状态变更时调用的回调
     * @returns 取消订阅函数
     */
    subscribe(listener: () => void): () => void
    /**
     * 从 JSON 字符串恢复完整应用状态，并通知所有订阅者。
     *
     * 等效于 app.initFromSerialized(json) + notify()。
     * 用于 uiJSON 外部变化（AI done / store 同步）后命令式注入引擎。
     *
     * @param json App.serialize() 产出的 JSON 字符串
     */
    loadAppJSON(json: string): void
}

/**
 * 命名空间化的操作对象
 *
 * 替代直接暴露 App 实例，提供安全的、白名单式的命令式 API。
 * 三维度模型：
 * - app：全局生命周期、序列化、导出
 * - page：页面导航、数据、事务、历史（undo/redo）
 * - view：视图 CRUD、属性、命中检测、物料序列化/实例化
 *
 * 业务层通过 `actions.view.select(id)` 形式调用。
 */
export interface IBanvasActions {
    view: IViewActions
    page: IPageActions
    app: IAppActions
}

