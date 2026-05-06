/**
 * 动画属性适配器
 *
 * 基于公共 propadapters 模块，扩展动画特有的 interpolate 策略。
 * 本模块是 propadapters 的消费方之一。
 */

import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'
import { lerpAngle } from './trs'
import {
    getAdapter as getBaseAdapter,
    getPropertyCategory as getBasePropCategory,
    SPATIAL_PROPERTIES,
    SIZE_PROPERTIES,
    detectConflict,
    type PropertyCategory,
} from '@/core/propadapters'

/**
 * 动画属性适配器接口（扩展了 interpolate）
 */
export interface AnimationPropertyAdapter {
    /** 属性类别 */
    category: PropertyCategory
    /**
     * 从 View 读取当前语义属性值
     */
    get(view: View, relativeMatrix?: Matrix4): number
    /**
     * 插值函数（默认线性，rotation 走短弧）
     */
    interpolate(from: number, to: number, t: number): number
}

export type { PropertyCategory }

// ========== 插值策略 ==========

const linearLerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * 属性 → 插值策略映射
 * 默认线性插值，rotation 使用短弧插值
 */
const interpolateStrategies: Record<string, (from: number, to: number, t: number) => number> = {
    rotation: lerpAngle,
}

// ========== 动画适配器注册表 ==========

/**
 * 将 base adapter 包装为 AnimationPropertyAdapter（添加 interpolate）
 */
function wrapWithInterpolate(prop: string): AnimationPropertyAdapter | undefined {
    const base = getBaseAdapter(prop)
    if (!base) return undefined
    return {
        category: base.category,
        get: base.get,
        interpolate: interpolateStrategies[prop] ?? linearLerp,
    }
}

// 预构建注册表
const animationAdapterRegistry: Record<string, AnimationPropertyAdapter> = {}

for (const prop of [...SPATIAL_PROPERTIES, ...SIZE_PROPERTIES]) {
    const wrapped = wrapWithInterpolate(prop)
    if (wrapped) {
        animationAdapterRegistry[prop] = wrapped
    }
}

/**
 * 获取动画属性对应的适配器
 * 如果未注册则返回 undefined（调用方应作为 direct 属性处理）
 */
export function getAdapter(prop: string): AnimationPropertyAdapter | undefined {
    return animationAdapterRegistry[prop]
}

/**
 * 判断属性类别
 */
export function getPropertyCategory(prop: string): PropertyCategory {
    return getBasePropCategory(prop)
}

// ========== 冲突检测（直接复用） ==========

export { detectConflict }

// ========== 属性列表常量 ==========

export { SPATIAL_PROPERTIES, SIZE_PROPERTIES }
