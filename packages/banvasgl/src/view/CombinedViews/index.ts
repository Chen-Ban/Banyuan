/**
 * CombinedView —— 统一容器视图
 *
 * 继承 ContainerView，拥有 addChild / removeChild / clear 等子节点管理能力。
 * 通过 style.layoutMode 切换布局模式：
 *   - 'free'（默认）：自由定位，子元素 matrix 由用户拖拽控制
 *   - 'flex'：弹性布局，子元素位置由 FlexLayoutStrategy 计算
 *   - 'list'：线性列表布局，子元素沿单方向依次排列
 *   - 'grid'：网格布局，子元素按行列数排列
 *   - 'scroll'：语法糖，等价于 free + overflow:'scroll'（自动撑开内容区）
 *
 * 布局算法通过策略模式（LayoutStrategy）注入，CombinedView 本身不包含具体算法。
 * 合并了原 FlexView 的全部布局能力，实现 ADR-031 统一容器方案。
 */

import { ViewType } from '@/foundation/constants'
import ContainerView from '@/view/ContainerView/index.js'
import type View from '@/view/View/View.js'
import type { ICombinedView, IContainerViewOptions, ISerializable, IFlexLayout } from '@/types'
import { generateId, generateName } from '@/foundation/utils'
import Matrix4 from '@/foundation/math/Matrix4.js'
import { BoundingBoxAddon } from '@/view/addon/index.js'
import Bounds from '@/graph/base/Bounds.js'
import { getLayoutStrategy } from './layout/index.js'
import type { ILayoutContext } from './layout/index.js'

// ────────────────────────────────────────────
//  CombinedView 实现
// ────────────────────────────────────────────

export default class CombinedView extends ContainerView implements ICombinedView, ISerializable {
    public type: ViewType = ViewType.COMBINEDVIEW

    constructor(options: IContainerViewOptions = {}) {
        super({ ...options })
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
    }

    // ==================== 布局模式 ====================

    /**
     * 是否为布局托管容器。
     * 编辑器通过 `child.parent` 向上查询此属性，决定是否限制子元素自由拖拽。
     * - true：子元素位置由 layout 算法控制，不允许自由移动（拖拽应转为 reorder）
     * - false：子元素可自由移动（free / scroll 模式行为）
     */
    public get isLayoutManaged(): boolean {
        const mode = this.style.layoutMode
        return mode === 'flex' || mode === 'list' || mode === 'grid'
    }

    // ==================== 布局核心 ====================

    /**
     * 布局算法入口
     *
     * - layoutMode='scroll'：语法糖拦截，强制 overflow=scroll，子元素走 free 排列
     * - layoutMode='free'（或未设置）：不干预子元素位置，直接调用基类 layout
     * - layoutMode='flex'/'list'/'grid'：委托对应 LayoutStrategy 执行
     */
    public override layout(ctx?: CanvasRenderingContext2D): Bounds {
        const layoutMode = this.style.layoutMode

        // ── scroll 语法糖拦截 ──
        // scroll 不是布局算法，而是视口溢出行为的快捷方式
        if (layoutMode === 'scroll') {
            // 强制设置 overflow=scroll，子元素仍走 free 定位
            this.style.overflow = 'scroll'
            return super.layout(ctx)
        }

        // ── free 模式（默认）：不干预子元素位置 ──
        const strategy = getLayoutStrategy(layoutMode)
        if (!strategy) {
            return super.layout(ctx)
        }

        // ── 策略模式布局 ──
        this._layoutDirty = false

        const children = this.children
        if (children.length === 0) {
            return super.layout(ctx)
        }

        // 组装布局上下文
        const context: ILayoutContext = {
            viewport: this.viewport,
        }

        // 获取对应的布局配置
        const config = this._getLayoutConfig(layoutMode)

        // 委托策略执行布局
        strategy.layout(children, context, config)

        // 调用基类 layout 完成 layoutArea 和 scrollBar 更新
        return super.layout(ctx)
    }

    // ==================== 编辑态支持 ====================

    /**
     * 重新排序子元素。
     * 编辑器在布局托管模式下拖拽子元素时，将 MOVE 操作转化为 reorder 调用。
     *
     * @param child 要移动的子 View
     * @param newIndex 目标位置索引（0-based）
     */
    public reorderChild(child: View, newIndex: number): void {
        const children = this.children
        const oldIndex = children.indexOf(child)
        if (oldIndex === -1) return
        if (oldIndex === newIndex) return

        // 从原位置移除
        children.splice(oldIndex, 1)
        // 插入新位置（clamp 到合法范围）
        const clampedIndex = Math.max(0, Math.min(newIndex, children.length))
        children.splice(clampedIndex, 0, child)

        // 标记布局脏，延迟到渲染时重排
        this.markLayoutDirty()
    }

    /**
     * 根据拖拽目标位置计算应插入的索引。
     * 编辑器显示插入指示器时使用（仅布局托管模式有意义）。
     *
     * @param mainAxisPosition 在容器本地坐标系中，拖拽点在主轴方向上的位置
     * @returns 应插入的索引位置
     */
    public getInsertIndex(mainAxisPosition: number): number {
        const layoutMode = this.style.layoutMode
        // 获取主轴方向（flex/list 有 direction，grid 始终按行优先）
        const direction = this._getMainDirection()
        const padding = this._getLayoutPadding()
        const [pt, , , pl] = this._normalizePadding(padding)
        const padStart = direction === 'row' ? pl : pt
        const gap = this._getLayoutGap()

        let cursor = padStart
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i]
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            const midpoint = cursor + childMain / 2
            if (mainAxisPosition < midpoint) return i
            cursor += childMain + gap
        }
        return this.children.length
    }

    // ==================== 复制 ====================

    public copy(): CombinedView {
        const newView = new CombinedView({
            children: this.children.map((view) => view.copy()),
        })

        // 复制基本属性（id 由构造器自动生成新的）
        newView.data = { ...this.data }
        newView.style = { ...this.style }
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }
        if (this.decoration) {
            newView.decoration = this.decoration.copy()
        }

        return newView
    }

    // ==================== 序列化 ====================

    /**
     * 从纯数据对象恢复 CombinedView 实例。
     * content / children 中的 { $type, $value } 应由 Serializer 预先解析为实例后传入。
     */
    static fromJSON(data: any): CombinedView {
        const view = new CombinedView({})
        if (data.content) view.content = data.content
        view.restoreCommonFields(data)
        view.markLayoutDirty()
        return view
    }

    // ==================== 私有方法 ====================

    /** 根据 layoutMode 获取对应的布局配置对象 */
    private _getLayoutConfig(layoutMode: string | undefined): Record<string, any> {
        switch (layoutMode) {
            case 'flex':
                return (this.style.flexLayout ?? {}) as Record<string, any>
            case 'list':
                return (this.style.listLayout ?? {}) as Record<string, any>
            case 'grid':
                return (this.style.gridLayout ?? {}) as Record<string, any>
            default:
                return {}
        }
    }

    /** 获取当前布局模式的主轴方向 */
    private _getMainDirection(): 'row' | 'column' {
        const mode = this.style.layoutMode
        if (mode === 'flex') {
            return this.style.flexLayout?.direction ?? 'column'
        }
        if (mode === 'list') {
            return this.style.listLayout?.direction ?? 'column'
        }
        // grid 按行优先，主轴为 row
        return 'row'
    }

    /** 获取当前布局模式的 gap */
    private _getLayoutGap(): number {
        const mode = this.style.layoutMode
        if (mode === 'flex') {
            return this.style.flexLayout?.gap ?? 0
        }
        if (mode === 'list') {
            return this.style.listLayout?.gap ?? 0
        }
        if (mode === 'grid') {
            return this.style.gridLayout?.columnGap ?? 0
        }
        return 0
    }

    /** 获取当前布局模式的 padding */
    private _getLayoutPadding(): number | [number, number, number, number] {
        const mode = this.style.layoutMode
        if (mode === 'flex') {
            return this.style.flexLayout?.padding ?? 0
        }
        if (mode === 'list') {
            return this.style.listLayout?.padding ?? 0
        }
        if (mode === 'grid') {
            return this.style.gridLayout?.padding ?? 0
        }
        return 0
    }

    /** 标准化 padding 为 [top, right, bottom, left] */
    private _normalizePadding(padding: number | [number, number, number, number]): [number, number, number, number] {
        if (typeof padding === 'number') {
            return [padding, padding, padding, padding]
        }
        return padding
    }
}
