/**
 * ListLayoutStrategy —— 线性列表布局策略
 *
 * Flex 的简化版：
 *   - 无 flex 权重分配（所有子元素保持原始尺寸）
 *   - 无主轴/交叉轴对齐（始终 start 对齐）
 *   - 只有 direction + gap + padding
 *
 * 适用场景：简单的垂直/水平列表排列。
 */

import type { IListLayout } from '@/types/view/view'
import type { ILayoutStrategy, ILayoutContext } from './ILayoutStrategy.js'
import type View from '@/view/View/View.js'
import Matrix4 from '@/foundation/math/Matrix4.js'

// ────────────────────────────────────────────
//  默认值
// ────────────────────────────────────────────

const DEFAULT_LIST_LAYOUT: IListLayout = {
    direction: 'column',
    gap: 0,
    padding: 0,
}

// ────────────────────────────────────────────
//  ListLayoutStrategy 实现
// ────────────────────────────────────────────

class ListLayoutStrategy implements ILayoutStrategy {

    public layout(children: View[], context: ILayoutContext, config: Record<string, any>): void {
        if (children.length === 0) return

        const listConfig: IListLayout = { ...DEFAULT_LIST_LAYOUT, ...(config as Partial<IListLayout>) }
        const { direction, gap, padding } = listConfig
        const viewport = context.viewport

        // 计算 padding
        const [pt, _pr, _pb, pl] = normalizePadding(padding)

        // 沿主轴方向依次排列
        let cursor = direction === 'row' ? pl : pt
        const crossStart = direction === 'row' ? pt : pl

        for (const child of children) {
            const childMain = direction === 'row'
                ? child.viewport.width
                : child.viewport.height

            const tx = direction === 'row' ? cursor : crossStart
            const ty = direction === 'row' ? crossStart : cursor
            child.matrix = Matrix4.translation(
                tx + viewport.x,
                ty + viewport.y,
                0,
            )

            cursor += childMain + gap
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

export const listLayoutStrategy = new ListLayoutStrategy()
export default ListLayoutStrategy
