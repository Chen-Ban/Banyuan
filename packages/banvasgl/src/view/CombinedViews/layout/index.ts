/**
 * Layout 策略模块 —— barrel 导出
 *
 * 提供布局策略接口和三个内置策略实现（全局单例）。
 * CombinedView 通过 getLayoutStrategy() 获取对应策略。
 */

export type { ILayoutStrategy, ILayoutContext } from './ILayoutStrategy.js'
export { flexLayoutStrategy } from './FlexLayoutStrategy.js'
export { listLayoutStrategy } from './ListLayoutStrategy.js'
export { gridLayoutStrategy } from './GridLayoutStrategy.js'

import type { LayoutMode } from '@/types/view/view'
import type { ILayoutStrategy } from './ILayoutStrategy.js'
import { flexLayoutStrategy } from './FlexLayoutStrategy.js'
import { listLayoutStrategy } from './ListLayoutStrategy.js'
import { gridLayoutStrategy } from './GridLayoutStrategy.js'

/**
 * 根据 layoutMode 获取对应的布局策略。
 *
 * - 'free' / 'scroll'：返回 null（不需要策略，由 CombinedView 自行处理）
 * - 'flex'：返回 FlexLayoutStrategy 单例
 * - 'list'：返回 ListLayoutStrategy 单例
 * - 'grid'：返回 GridLayoutStrategy 单例
 */
export function getLayoutStrategy(mode: LayoutMode | undefined): ILayoutStrategy | null {
    switch (mode) {
        case 'flex':
            return flexLayoutStrategy
        case 'list':
            return listLayoutStrategy
        case 'grid':
            return gridLayoutStrategy
        case 'free':
        case 'scroll':
        default:
            return null
    }
}
