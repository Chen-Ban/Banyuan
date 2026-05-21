import type { ViewType } from '@/foundation/constants'
import type { SCENETYPE } from '@/foundation/constants'

/**
 * 全局名称计数器
 *
 * 按 type 分组计数，生成 `{type}#{count}` 格式的可读名称。
 * 例如：GRAPHVIEW#1, TEXTVIEW#2, SCENE#1
 */
const nameCounters: Record<string, number> = {}

export function generateName(type: ViewType | SCENETYPE): string {
    if (!nameCounters[type]) {
        nameCounters[type] = 0
    }
    nameCounters[type]++
    return `${type}#${nameCounters[type]}`
}
