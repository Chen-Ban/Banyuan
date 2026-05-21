/**
 * FlexView —— 弹性布局容器
 *
 * 继承 ContainerView（与 CombinedView 平级），实现 Flex 布局策略。
 * 对标 Flutter 的 Row（水平）/ Column（垂直），不是完整 CSS Flexbox。
 *
 * 核心行为：
 * - override layout() 按 direction 方向排列子元素
 * - 子元素位置由布局算法通过 matrix 平移控制
 * - 子元素的 layoutParams.flex 权重决定弹性空间分配
 * - 与 BoxDecorationAddon 正交（装饰不影响布局语义）
 *
 * 与 CombinedView 的差异：
 * - CombinedView = 自由定位（子元素 matrix 由用户拖拽控制）
 * - FlexView = 自动排列（子元素 matrix 由 layout 算法计算）
 */

import { VIEWTYPE } from '@/foundation/constants.js'
import type { ViewType } from '@/foundation/constants.js'
import ContainerView from '@/view/ContainerView/index.js'
import type { ContainerViewOptions } from '@/view/ContainerView/index.js'
import type View from '@/view/View/View.js'
import { type IFlexView, type IFlexStyle, type ISerializable } from '@/types/index.js'
import { generateId, generateName } from '@/foundation/utils.js'
import Matrix4 from '@/foundation/math/Matrix4.js'
import { BoundingBoxAddon } from '@/view/addon/index.js'

// ────────────────────────────────────────────
//  FlexView Options
// ────────────────────────────────────────────

export interface FlexViewOptions extends ContainerViewOptions {
    flexStyle?: Partial<IFlexStyle>
}

// ────────────────────────────────────────────
//  默认值
// ────────────────────────────────────────────

const DEFAULT_FLEX_STYLE: IFlexStyle = {
    direction: 'column',
    gap: 0,
    mainAxisAlignment: 'start',
    crossAxisAlignment: 'start',
    padding: 0,
}

// ────────────────────────────────────────────
//  FlexView 实现
// ────────────────────────────────────────────

export default class FlexView extends ContainerView implements IFlexView, ISerializable {
    public type: ViewType = VIEWTYPE.FLEXVIEW

    public flexStyle: IFlexStyle

    constructor(options: FlexViewOptions = {}) {
        super(options)
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
        this.flexStyle = { ...DEFAULT_FLEX_STYLE, ...(options.flexStyle || {}) }
    }

    // ==================== 布局核心 ====================

    /**
     * Flex 布局算法
     *
     * 流程：
     * 1. 计算 padding 后的可用空间
     * 2. 第一遍：统计固定尺寸占用 + flex 权重总和
     * 3. 分配弹性空间给 flex 子元素
     * 4. 根据 mainAxisAlignment 计算起始偏移和额外间距
     * 5. 遍历 children 设置 matrix 位置（主轴累积 + 交叉轴对齐）
     * 6. 调用基类更新 layoutArea 和 scrollBar
     */
    public override layout(): void {
        const { direction, gap, mainAxisAlignment, crossAxisAlignment, padding } = this.flexStyle
        const viewport = this.viewport

        // 1. 计算 padding
        const [pt, pr, pb, pl] = this._normalizePadding(padding)

        // 可用空间
        const availableMain = direction === 'row'
            ? viewport.width - pl - pr
            : viewport.height - pt - pb
        const availableCross = direction === 'row'
            ? viewport.height - pt - pb
            : viewport.width - pl - pr

        const children = this.children
        if (children.length === 0) {
            // 无子元素时直接走基类逻辑
            super.layout()
            return
        }

        // 2. 第一遍：统计固定尺寸总占用 + flex 权重总和
        let fixedMainTotal = 0
        let flexTotal = 0
        const gapTotal = gap * (children.length - 1)

        for (const child of children) {
            const flex = child.layoutParams?.flex ?? 0
            if (flex > 0) {
                flexTotal += flex
            } else {
                const childMain = direction === 'row'
                    ? child.viewport.width
                    : child.viewport.height
                fixedMainTotal += childMain
            }
        }

        // 3. 计算弹性空间
        const remainingSpace = Math.max(0, availableMain - fixedMainTotal - gapTotal)
        const flexUnit = flexTotal > 0 ? remainingSpace / flexTotal : 0

        // 对 flex 子元素分配尺寸（修改其 viewport 主轴维度）
        for (const child of children) {
            const flex = child.layoutParams?.flex ?? 0
            if (flex > 0) {
                const allocatedSize = flexUnit * flex
                if (direction === 'row') {
                    child.viewport.width = allocatedSize
                } else {
                    child.viewport.height = allocatedSize
                }
                // 重建 boundingBox 以匹配新 viewport
                if (child.boundingBox) {
                    child.boundingBox = new BoundingBoxAddon(child.viewport)
                }
            }
        }

        // 4. 计算实际主轴总长
        let actualMainTotal = 0
        for (const child of children) {
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            actualMainTotal += childMain
        }
        actualMainTotal += gapTotal

        // 根据 mainAxisAlignment 计算起始偏移和额外间距
        let mainOffset = direction === 'row' ? pl : pt
        let extraGap = 0

        const totalFreeSpace = Math.max(0, availableMain - actualMainTotal)

        switch (mainAxisAlignment) {
            case 'start':
                // 默认，mainOffset 已设置为 padding 起点
                break
            case 'center':
                mainOffset += totalFreeSpace / 2
                break
            case 'end':
                mainOffset += totalFreeSpace
                break
            case 'spaceBetween':
                if (children.length > 1) {
                    extraGap = totalFreeSpace / (children.length - 1)
                }
                break
            case 'spaceAround':
                if (children.length > 0) {
                    const aroundGap = totalFreeSpace / children.length
                    mainOffset += aroundGap / 2
                    extraGap = aroundGap
                }
                break
        }

        // 5. 遍历 children 设置位置
        let cursor = mainOffset
        const crossStart = direction === 'row' ? pt : pl

        for (const child of children) {
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            const childCross = direction === 'row'
                ? child.viewport.height
                : child.viewport.width

            // 交叉轴位置
            const alignSelf = child.layoutParams?.alignSelf ?? crossAxisAlignment
            let crossOffset = crossStart

            switch (alignSelf) {
                case 'start':
                    // crossOffset 已是起始位置
                    break
                case 'center':
                    crossOffset += (availableCross - childCross) / 2
                    break
                case 'end':
                    crossOffset += availableCross - childCross
                    break
                case 'stretch':
                    // stretch 时修改子元素交叉轴尺寸
                    if (direction === 'row') {
                        child.viewport.height = availableCross
                    } else {
                        child.viewport.width = availableCross
                    }
                    if (child.boundingBox) {
                        child.boundingBox = new BoundingBoxAddon(child.viewport)
                    }
                    break
            }

            // 设置子元素 matrix（平移到计算位置）
            const tx = direction === 'row' ? cursor : crossOffset
            const ty = direction === 'row' ? crossOffset : cursor
            child.matrix = Matrix4.translation(
                tx + viewport.x,
                ty + viewport.y,
                0,
            )

            // 主轴游标前进
            cursor += childMain + gap + extraGap
        }

        // 6. 调用基类 layout 完成 layoutArea 和 scrollBar 更新
        super.layout()
    }

    // ==================== 编辑态支持 ====================

    /**
     * 是否为布局托管容器。
     * 编辑器通过 `child.parent` 向上查询此属性，决定是否限制子元素自由拖拽。
     * - true：子元素位置由 layout 算法控制，不允许自由移动（拖拽应转为 reorder）
     * - false：子元素可自由移动（CombinedView 的行为）
     */
    public readonly isLayoutManaged: boolean = true

    /**
     * 重新排序子元素。
     * 编辑器在 FlexView 内拖拽子元素时，将 MOVE 操作转化为 reorder 调用。
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

        // 触发重新布局
        this.layout()
    }

    /**
     * 根据拖拽目标位置计算应插入的索引。
     * 编辑器显示插入指示器时使用。
     *
     * @param mainAxisPosition 在 FlexView 本地坐标系中，拖拽点在主轴方向上的位置
     * @returns 应插入的索引位置
     */
    public getInsertIndex(mainAxisPosition: number): number {
        const { direction, padding } = this.flexStyle
        const [pt, , , pl] = this._normalizePadding(padding)
        const padStart = direction === 'row' ? pl : pt

        let cursor = padStart
        for (let i = 0; i < this.children.length; i++) {
            const child = this.children[i]
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            const midpoint = cursor + childMain / 2
            if (mainAxisPosition < midpoint) return i
            cursor += childMain + this.flexStyle.gap
        }
        return this.children.length
    }

    // ==================== 复制 ====================

    public copy(): FlexView {
        const newView = new FlexView({
            children: this.children.map((view) => view.copy()),
            flexStyle: { ...this.flexStyle },
        })

        // 复制基本属性
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
        if (this.layoutParams) {
            newView.layoutParams = { ...this.layoutParams }
        }

        return newView
    }

    // ==================== 序列化 ====================

    public override toJSON(): any {
        return {
            ...super.toJSON(),
            flexStyle: this.flexStyle,
        }
    }

    /**
     * 从纯数据对象恢复 FlexView 实例。
     * content / children 中的 { $type, $value } 应由 Serializer 预先解析为实例后传入。
     */
    static fromJSON(data: any): FlexView {
        const view = new FlexView({
            flexStyle: data.flexStyle,
        })
        if (data.content) view.content = data.content
        view.restoreFromJSON(data)
        return view
    }

    // ==================== 私有方法 ====================

    /** 标准化 padding 为 [top, right, bottom, left] */
    private _normalizePadding(padding: number | [number, number, number, number]): [number, number, number, number] {
        if (typeof padding === 'number') {
            return [padding, padding, padding, padding]
        }
        return padding
    }
}
