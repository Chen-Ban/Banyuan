/**
 * GridLayoutStrategy —— 网格布局策略
 *
 * 按固定列数将子元素排列为网格：
 *   - columns: 列数
 *   - rowGap / columnGap: 行列间距
 *   - padding: 内边距
 *
 * 每个单元格宽度 = (可用宽度 - (columns-1)*columnGap) / columns
 * 子元素高度保持原始值，行高取该行最大子元素高度。
 */

import type { IGridLayout } from '@/types'
import type { ILayoutStrategy, ILayoutContext } from './ILayoutStrategy.js'
import type View from '@/view/View/View.js'
import Matrix4 from '@/foundation/math/Matrix4.js'

// ────────────────────────────────────────────
//  默认值
// ────────────────────────────────────────────

const DEFAULT_GRID_LAYOUT: IGridLayout = {
    columns: 2,
    rowGap: 0,
    columnGap: 0,
    padding: 0,
}

// ────────────────────────────────────────────
//  GridLayoutStrategy 实现
// ────────────────────────────────────────────

class GridLayoutStrategy implements ILayoutStrategy {

    public layout(children: View[], context: ILayoutContext, config: Record<string, any>): void {
        if (children.length === 0) return

        const gridConfig: IGridLayout = { ...DEFAULT_GRID_LAYOUT, ...(config as Partial<IGridLayout>) }
        const { columns, rowGap, columnGap, padding } = gridConfig
        const viewport = context.viewport

        // 计算 padding
        const [pt, pr, _pb, pl] = normalizePadding(padding)

        // 可用宽度和单元格宽度
        const availableWidth = viewport.width - pl - pr
        const cellWidth = (availableWidth - (columns - 1) * columnGap) / columns

        // 将子元素分行
        const rows: View[][] = []
        for (let i = 0; i < children.length; i += columns) {
            rows.push(children.slice(i, i + columns))
        }

        // 逐行布局
        let rowCursor = pt

        for (const row of rows) {
            // 计算行高（该行最大子元素高度）
            let rowHeight = 0
            for (const child of row) {
                rowHeight = Math.max(rowHeight, child.viewport.height)
            }

            // 设置每个子元素的宽度和位置
            for (let col = 0; col < row.length; col++) {
                const child = row[col]

                // 将子元素宽度设为单元格宽度
                child.viewport.width = cellWidth
                child.boundingBox?.updateSize()

                const tx = pl + col * (cellWidth + columnGap)
                const ty = rowCursor
                child.matrix = Matrix4.translation(
                    tx + viewport.x,
                    ty + viewport.y,
                    0,
                )
            }

            rowCursor += rowHeight + rowGap
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

export const gridLayoutStrategy = new GridLayoutStrategy()
export default GridLayoutStrategy
