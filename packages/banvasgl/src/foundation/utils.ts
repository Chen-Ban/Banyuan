import { v4 as uuidv4 } from 'uuid'
import type { GRAPHTYPE, SCENETYPE, ViewType } from './constants'

/**
 * 统一的 ID 生成器
 *
 * 传入 type 时格式为 `{type}_{uuid}`，例如 `GRAPHVIEW_a1b2c3d4-...`
 * 不传 type 时返回裸 uuid（用于抽象基类构造器中 type 尚未就绪的场景）
 *
 * @param type 实体的类型枚举值（GRAPHTYPE / VIEWTYPE / SCENETYPE）
 */
export function generateId(type?: GRAPHTYPE | ViewType | SCENETYPE): string {
  return type ? `${type}_${uuidv4()}` : uuidv4()
}

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
