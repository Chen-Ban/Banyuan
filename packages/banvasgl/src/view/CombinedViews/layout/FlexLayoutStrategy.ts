/**
 * FlexLayoutStrategy —— 弹性布局策略
 *
 * 实现 CSS Flexbox 子集：
 *   - direction: row | column
 *   - gap / mainAxisAlignment / crossAxisAlignment
 *   - flex 权重分配
 *   - wrap 流式换行
 *   - padding
 *
 * 从 CombinedView 中抽取的布局算法，策略模式无状态单例。
 */

import type { IFlexLayout } from '@/types'
import type { ILayoutStrategy, ILayoutContext } from './ILayoutStrategy.js'
import type View from '@/view/View/View.js'
import Matrix4 from '@/foundation/math/Matrix4.js'

// ────────────────────────────────────────────
//  默认值
// ────────────────────────────────────────────

const DEFAULT_FLEX_LAYOUT: IFlexLayout = {
    direction: 'column',
    gap: 0,
    mainAxisAlignment: 'start',
    crossAxisAlignment: 'start',
    padding: 0,
}

// ────────────────────────────────────────────
//  FlexLayoutStrategy 实现
// ────────────────────────────────────────────

class FlexLayoutStrategy implements ILayoutStrategy {

    public layout(children: View[], context: ILayoutContext, config: Record<string, any>): void {
        if (children.length === 0) return

        const flexConfig: IFlexLayout = { ...DEFAULT_FLEX_LAYOUT, ...(config as Partial<IFlexLayout>) }
        const { direction, gap, mainAxisAlignment, crossAxisAlignment, padding, wrap, lineGap } = flexConfig
        const viewport = context.viewport

        // 1. 计算 padding
        const [pt, pr, pb, pl] = normalizePadding(padding)

        // 可用空间
        const availableMain = direction === 'row'
            ? viewport.width - pl - pr
            : viewport.height - pt - pb
        const availableCross = direction === 'row'
            ? viewport.height - pt - pb
            : viewport.width - pl - pr

        // 2. wrap 模式：流式换行布局
        if (wrap) {
            this._layoutWrap(children, viewport, direction, gap, lineGap ?? gap, mainAxisAlignment, crossAxisAlignment, availableMain, availableCross, pt, pr, pb, pl)
            return
        }

        // 3. 单行 Flex 布局
        // 3a. 统计固定尺寸总占用 + flex 权重总和
        let fixedMainTotal = 0
        let flexTotal = 0
        const gapTotal = gap * (children.length - 1)

        for (const child of children) {
            const flex = child.style.flexLayout?.flex ?? 0
            if (flex > 0) {
                flexTotal += flex
            } else {
                const childMain = direction === 'row'
                    ? child.viewport.width
                    : child.viewport.height
                fixedMainTotal += childMain
            }
        }

        // 3b. 计算弹性空间
        const remainingSpace = Math.max(0, availableMain - fixedMainTotal - gapTotal)
        const flexUnit = flexTotal > 0 ? remainingSpace / flexTotal : 0

        for (const child of children) {
            const flex = child.style.flexLayout?.flex ?? 0
            if (flex > 0) {
                const allocatedSize = flexUnit * flex
                if (direction === 'row') {
                    child.viewport.width = allocatedSize
                } else {
                    child.viewport.height = allocatedSize
                }
                child.boundingBox?.updateSize()
            }
        }

        // 3c. 计算实际主轴总长
        let actualMainTotal = 0
        for (const child of children) {
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            actualMainTotal += childMain
        }
        actualMainTotal += gapTotal

        let mainOffset = direction === 'row' ? pl : pt
        let extraGap = 0
        const totalFreeSpace = Math.max(0, availableMain - actualMainTotal)

        switch (mainAxisAlignment) {
            case 'start':
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

        // 3d. 遍历 children 设置位置
        let cursor = mainOffset
        const crossStart = direction === 'row' ? pt : pl

        for (const child of children) {
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height
            const childCross = direction === 'row'
                ? child.viewport.height
                : child.viewport.width

            const alignSelf = child.style.flexLayout?.alignSelf ?? crossAxisAlignment
            let crossOffset = crossStart

            switch (alignSelf) {
                case 'start':
                    break
                case 'center':
                    crossOffset += (availableCross - childCross) / 2
                    break
                case 'end':
                    crossOffset += availableCross - childCross
                    break
                case 'stretch':
                    if (direction === 'row') {
                        child.viewport.height = availableCross
                    } else {
                        child.viewport.width = availableCross
                    }
                    child.boundingBox?.updateSize()
                    break
            }

            const tx = direction === 'row' ? cursor : crossOffset
            const ty = direction === 'row' ? crossOffset : cursor
            child.matrix = Matrix4.translation(
                tx + viewport.x,
                ty + viewport.y,
                0,
            )

            cursor += childMain + gap + extraGap
        }
    }

    // ==================== Wrap 布局算法 ====================

    private _layoutWrap(
        children: View[],
        viewport: { x: number; y: number },
        direction: 'row' | 'column',
        gap: number,
        lineGap: number,
        mainAxisAlignment: IFlexLayout['mainAxisAlignment'],
        crossAxisAlignment: IFlexLayout['crossAxisAlignment'],
        availableMain: number,
        _availableCross: number,
        pt: number, _pr: number, _pb: number, pl: number,
    ): void {
        // 将子元素分行
        type LineInfo = { items: View[]; mainSizes: number[]; maxCross: number }
        const lines: LineInfo[] = []
        let currentLine: LineInfo = { items: [], mainSizes: [], maxCross: 0 }
        let currentMainUsed = 0

        for (const child of children) {
            const childMain = direction === 'row' ? child.viewport.width : child.viewport.height
            const childCross = direction === 'row' ? child.viewport.height : child.viewport.width

            // 判断是否需要换行（第一个元素不换行）
            if (currentLine.items.length > 0 && currentMainUsed + gap + childMain > availableMain) {
                lines.push(currentLine)
                currentLine = { items: [], mainSizes: [], maxCross: 0 }
                currentMainUsed = 0
            }

            currentLine.items.push(child)
            currentLine.mainSizes.push(childMain)
            currentLine.maxCross = Math.max(currentLine.maxCross, childCross)
            currentMainUsed += (currentLine.items.length > 1 ? gap : 0) + childMain
        }
        if (currentLine.items.length > 0) {
            lines.push(currentLine)
        }

        // 逐行布局
        let crossCursor = direction === 'row' ? pt : pl

        for (const line of lines) {
            const lineMainTotal = line.mainSizes.reduce((sum, s) => sum + s, 0)
            const lineGapTotal = gap * (line.items.length - 1)
            const lineFreeSpace = Math.max(0, availableMain - lineMainTotal - lineGapTotal)

            // 计算主轴起始偏移和额外间距
            let mainCursor = direction === 'row' ? pl : pt
            let extraGap = 0

            switch (mainAxisAlignment) {
                case 'start':
                    break
                case 'center':
                    mainCursor += lineFreeSpace / 2
                    break
                case 'end':
                    mainCursor += lineFreeSpace
                    break
                case 'spaceBetween':
                    if (line.items.length > 1) {
                        extraGap = lineFreeSpace / (line.items.length - 1)
                    }
                    break
                case 'spaceAround':
                    if (line.items.length > 0) {
                        const aroundGap = lineFreeSpace / line.items.length
                        mainCursor += aroundGap / 2
                        extraGap = aroundGap
                    }
                    break
            }

            // 放置每个子元素
            for (let i = 0; i < line.items.length; i++) {
                const child = line.items[i]
                const childCross = direction === 'row' ? child.viewport.height : child.viewport.width

                // 交叉轴对齐（在行高内）
                const alignSelf = child.style.flexLayout?.alignSelf ?? crossAxisAlignment
                let crossOffset = crossCursor

                switch (alignSelf) {
                    case 'start':
                        break
                    case 'center':
                        crossOffset += (line.maxCross - childCross) / 2
                        break
                    case 'end':
                        crossOffset += line.maxCross - childCross
                        break
                    case 'stretch':
                        if (direction === 'row') {
                            child.viewport.height = line.maxCross
                        } else {
                            child.viewport.width = line.maxCross
                        }
                        child.boundingBox?.updateSize()
                        break
                }

                const tx = direction === 'row' ? mainCursor : crossOffset
                const ty = direction === 'row' ? crossOffset : mainCursor
                child.matrix = Matrix4.translation(
                    tx + viewport.x,
                    ty + viewport.y,
                    0,
                )

                mainCursor += line.mainSizes[i] + gap + extraGap
            }

            // 交叉轴游标前进到下一行
            crossCursor += line.maxCross + lineGap
        }
    }
}

// ────────────────────────────────────────────
//  工具函数
// ────────────────────────────────────────────

function normalizePadding(padding: number | [number, number, number, number]): [number, number, number, number] {
    if (typeof padding === 'number') {
        return [padding, padding, padding, padding]
    }
    return padding
}

// ────────────────────────────────────────────
//  导出全局单例
// ────────────────────────────────────────────

export const flexLayoutStrategy = new FlexLayoutStrategy()
export default FlexLayoutStrategy
