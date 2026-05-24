/**
 * 动画属性适配器注册表
 *
 * 基于公共 property 模块，扩展动画特有的 interpolate 策略。
 * 本模块是 property 的消费方之一。
 */

import type View from '@/view/View/View'
import type Matrix4 from '@/foundation/math/Matrix4'
import { lerpAngle } from './trs'
import type { PropertyCategory } from '@/types'
import {
    adapterRegistry as baseRegistry,
    SpatialProperties,
    SizeProperties,
} from '@/engine/property'

export type { PropertyCategory }

// ========== 动画适配器接口 ==========

/**
 * 动画属性适配器（在基础适配器上扩展了 interpolate 策略）
 */
export interface AnimationPropertyAdapter {
    /** 属性类别 */
    category: PropertyCategory
    /** 从 View 读取当前语义属性值 */
    get(view: View, relativeMatrix?: Matrix4): number
    /** 插值函数（默认线性，rotation 走短弧） */
    interpolate(from: number, to: number, t: number): number
}

// ========== 注册表类 ==========

const linearLerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * 动画属性适配器注册表
 *
 * 在 PropertyAdapterRegistry 的基础上，为每个属性附加 interpolate 策略，
 * 供 Animation 在每帧插值时使用。
 */
export class AnimationAdapterRegistry {
    private _adapters: Record<string, AnimationPropertyAdapter> = {}

    /**
     * 从基础注册表中包装并注册一个属性
     *
     * @param prop 属性名
     * @param interpolate 可选，自定义插值函数；不传则使用线性插值
     */
    register(prop: string, interpolate?: (from: number, to: number, t: number) => number): this {
        const base = baseRegistry.getAdapter(prop)
        if (!base) return this
        this._adapters[prop] = {
            category: base.category,
            get: base.get,
            interpolate: interpolate ?? linearLerp,
        }
        return this
    }

    /**
     * 获取属性对应的动画适配器
     * 未注册时返回 undefined（调用方应作为 direct 属性处理）
     */
    getAdapter(prop: string): AnimationPropertyAdapter | undefined {
        return this._adapters[prop]
    }

    /**
     * 判断属性类别（委托给基础注册表）
     */
    getCategory(prop: string): PropertyCategory {
        return baseRegistry.getCategory(prop)
    }

    /**
     * 检测属性列表中的互斥冲突（委托给基础注册表）
     */
    detectConflict(properties: string[]): string | null {
        return baseRegistry.detectConflict(properties)
    }
}

// ========== 全局动画适配器注册表 ==========

export const animationAdapterRegistry = new AnimationAdapterRegistry()

// 注册所有空间属性（rotation 使用短弧插值，其余线性）
for (const prop of SpatialProperties) {
    animationAdapterRegistry.register(prop, prop === 'rotation' ? lerpAngle : undefined)
}

// 注册所有尺寸属性（均使用线性插值）
for (const prop of SizeProperties) {
    animationAdapterRegistry.register(prop)
}

export { SpatialProperties, SizeProperties }
