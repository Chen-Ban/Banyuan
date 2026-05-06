/**
 * 属性适配器模块（Property Adapters）
 *
 * 提供用户语义属性（x/y/rotation/width/height 等）与引擎内部数据结构
 * （matrix / viewport）之间的双向映射。
 *
 * 消费方：
 * - 动画系统（animation）：使用 get + interpolate 策略
 * - 属性面板（ComponentPanel）：使用 get + set
 *
 * 本模块只提供 get/set，interpolate 策略由各消费方自行扩展。
 */

import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'
import type { PropertyAdapter, PropertyCategory } from './types'
import { spatialAdapters } from './spatialAdapters'
import { sizeAdapters } from './sizeAdapters'

export type { PropertyAdapter, PropertyCategory } from './types'
export type { PropertyDescriptor, ConflictGroup } from './types'

// ========== 适配器注册表 ==========

const adapterRegistry: Record<string, PropertyAdapter> = {
    ...spatialAdapters,
    ...sizeAdapters,
}

/**
 * 获取属性对应的适配器
 * 如果未注册则返回 undefined（调用方应作为 direct 属性处理）
 */
export function getAdapter(prop: string): PropertyAdapter | undefined {
    return adapterRegistry[prop]
}

/**
 * 判断属性类别
 */
export function getPropertyCategory(prop: string): PropertyCategory {
    const adapter = adapterRegistry[prop]
    return adapter?.category ?? 'direct'
}

/**
 * 从 View 读取语义属性值
 *
 * @param view 目标 View
 * @param prop 属性名
 * @param relativeMatrix 可选，参考系变换矩阵
 * @returns 属性值，如果属性无适配器则尝试直接读取 View 上的同名属性
 */
export function getProperty(view: View, prop: string, relativeMatrix?: Matrix4): number {
    const adapter = adapterRegistry[prop]
    if (adapter) {
        return adapter.get(view, relativeMatrix)
    }
    // direct 属性：直接从 View 上读取
    return (view as unknown as Record<string, number>)[prop] ?? 0
}

/**
 * 向 View 写入语义属性值
 *
 * @param view 目标 View
 * @param prop 属性名
 * @param value 目标值
 */
export function setProperty(view: View, prop: string, value: number): void {
    const adapter = adapterRegistry[prop]
    if (adapter) {
        adapter.set(view, value)
        return
    }
    // direct 属性：直接写入 View 上的同名属性
    ;(view as unknown as Record<string, number>)[prop] = value
}

/**
 * 批量设置多个属性
 */
export function setProperties(view: View, props: Record<string, number>): void {
    for (const [prop, value] of Object.entries(props)) {
        setProperty(view, prop, value)
    }
}

/**
 * 批量读取多个属性
 */
export function getProperties(view: View, propNames: string[], relativeMatrix?: Matrix4): Record<string, number> {
    const result: Record<string, number> = {}
    for (const prop of propNames) {
        result[prop] = getProperty(view, prop, relativeMatrix)
    }
    return result
}

// ========== 冲突检测 ==========

/**
 * 互斥属性组（同组中的属性不能同时修改）
 */
const CONFLICT_GROUPS: string[][] = [
    ['width', 'scaleX'],
    ['height', 'scaleY'],
]

/**
 * 检测属性列表中的冲突
 *
 * @param properties 属性名列表
 * @returns 冲突描述字符串，无冲突返回 null
 */
export function detectConflict(properties: string[]): string | null {
    const propSet = new Set(properties)
    for (const group of CONFLICT_GROUPS) {
        const found = group.filter(p => propSet.has(p))
        if (found.length > 1) {
            return `Property conflict: "${found.join('" and "')}" cannot be used together. ` +
                `They both control the same dimension.`
        }
    }
    return null
}

// ========== 属性列表常量 ==========

/** 空间属性列表（x/y/rotation → matrix） */
export const SPATIAL_PROPERTIES = Object.keys(spatialAdapters)

/** 尺寸属性列表（width/height/scaleX/scaleY → viewport） */
export const SIZE_PROPERTIES = Object.keys(sizeAdapters)

// ========== 角度转换工具 ==========

/**
 * 弧度转角度
 */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI)
}

/**
 * 角度转弧度
 */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}
