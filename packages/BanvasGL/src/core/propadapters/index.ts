/**
 * 属性适配器模块（Property Adapters）
 *
 * 提供用户语义属性（x/y/rotation/width/height 等）与引擎内部数据结构
 * （matrix / viewport）之间的双向映射。
 *
 * 消费方：
 * - 动画系统（animation）：使用 get + interpolate 策略
 * - 属性面板（ComponentPanel）：使用 get + set
 */

import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'
import type { PropertyAdapter, PropertyCategory } from './types'
import { spatialAdapters } from './spatialAdapters'
import { sizeAdapters } from './sizeAdapters'

export type { PropertyAdapter, PropertyCategory } from './types'
export type { PropertyDescriptor, ConflictGroup } from './types'

// ========== 注册表类 ==========

/**
 * 属性适配器注册表
 *
 * 统一管理语义属性（x/y/rotation/width/height 等）与引擎内部数据结构之间的
 * 双向映射适配器，提供注册、查询、读写、冲突检测等能力。
 */
export class PropertyAdapterRegistry {
    private _adapters: Record<string, PropertyAdapter> = {}

    constructor(initial?: Record<string, PropertyAdapter>) {
        if (initial) {
            Object.assign(this._adapters, initial)
        }
    }

    /**
     * 注册一个属性适配器
     */
    register(prop: string, adapter: PropertyAdapter): this {
        this._adapters[prop] = adapter
        return this
    }

    /**
     * 获取属性对应的适配器
     * 如果未注册则返回 undefined（调用方应作为 direct 属性处理）
     */
    getAdapter(prop: string): PropertyAdapter | undefined {
        return this._adapters[prop]
    }

    /**
     * 判断属性类别
     */
    getCategory(prop: string): PropertyCategory {
        return this._adapters[prop]?.category ?? 'direct'
    }

    /**
     * 从 View 读取语义属性值
     *
     * @param view 目标 View
     * @param prop 属性名
     * @param relativeMatrix 可选，参考系变换矩阵
     * @returns 属性值，如果属性无适配器则尝试直接读取 View 上的同名属性
     */
    get(view: View, prop: string, relativeMatrix?: Matrix4): number {
        const adapter = this._adapters[prop]
        if (adapter) {
            return adapter.get(view, relativeMatrix)
        }
        return (view as unknown as Record<string, number>)[prop] ?? 0
    }

    /**
     * 向 View 写入语义属性值
     *
     * @param view 目标 View
     * @param prop 属性名
     * @param value 目标值
     */
    set(view: View, prop: string, value: number): void {
        const adapter = this._adapters[prop]
        if (adapter) {
            adapter.set(view, value)
            return
        }
        ;(view as unknown as Record<string, number>)[prop] = value
    }

    /**
     * 批量读取多个属性
     */
    getMany(view: View, propNames: string[], relativeMatrix?: Matrix4): Record<string, number> {
        const result: Record<string, number> = {}
        for (const prop of propNames) {
            result[prop] = this.get(view, prop, relativeMatrix)
        }
        return result
    }

    /**
     * 批量写入多个属性
     */
    setMany(view: View, props: Record<string, number>): void {
        for (const [prop, value] of Object.entries(props)) {
            this.set(view, prop, value)
        }
    }

    /**
     * 检测属性列表中的互斥冲突
     *
     * @param properties 属性名列表
     * @returns 冲突描述字符串，无冲突返回 null
     */
    detectConflict(properties: string[]): string | null {
        const propSet = new Set(properties)
        for (const group of this._conflictGroups) {
            const found = group.filter(p => propSet.has(p))
            if (found.length > 1) {
                return `Property conflict: "${found.join('" and "')}" cannot be used together. ` +
                    `They both control the same dimension.`
            }
        }
        return null
    }

    /**
     * 获取所有已注册属性名（按类别过滤）
     */
    getProperties(category?: PropertyCategory): string[] {
        if (!category) return Object.keys(this._adapters)
        return Object.keys(this._adapters).filter(
            p => this._adapters[p].category === category
        )
    }

    // ── 互斥组 ──────────────────────────────────────────────────────────────

    private _conflictGroups: string[][] = []

    /**
     * 注册互斥属性组（同组属性不能同时被动画驱动）
     */
    addConflictGroup(group: string[]): this {
        this._conflictGroups.push(group)
        return this
    }
}

// ========== 全局默认注册表 ==========

export const adapterRegistry = new PropertyAdapterRegistry({
    ...spatialAdapters,
    ...sizeAdapters,
})
    .addConflictGroup(['width', 'scaleX'])
    .addConflictGroup(['height', 'scaleY'])

// ========== 便捷函数（向后兼容） ==========

/** @deprecated 请直接使用 adapterRegistry */
export const getAdapter = (prop: string) => adapterRegistry.getAdapter(prop)
/** @deprecated 请直接使用 adapterRegistry */
export const getPropertyCategory = (prop: string) => adapterRegistry.getCategory(prop)
/** @deprecated 请直接使用 adapterRegistry */
export const getProperty = (view: View, prop: string, relativeMatrix?: Matrix4) =>
    adapterRegistry.get(view, prop, relativeMatrix)
/** @deprecated 请直接使用 adapterRegistry */
export const setProperty = (view: View, prop: string, value: number) =>
    adapterRegistry.set(view, prop, value)
/** @deprecated 请直接使用 adapterRegistry */
export const setProperties = (view: View, props: Record<string, number>) =>
    adapterRegistry.setMany(view, props)
/** @deprecated 请直接使用 adapterRegistry */
export const getProperties = (view: View, propNames: string[], relativeMatrix?: Matrix4) =>
    adapterRegistry.getMany(view, propNames, relativeMatrix)
/** @deprecated 请直接使用 adapterRegistry */
export const detectConflict = (properties: string[]) =>
    adapterRegistry.detectConflict(properties)

// ========== 属性列表常量 ==========

/** 空间属性列表（x/y/rotation → matrix） */
export const SPATIAL_PROPERTIES = adapterRegistry.getProperties('spatial')

/** 尺寸属性列表（width/height/scaleX/scaleY → viewport） */
export const SIZE_PROPERTIES = adapterRegistry.getProperties('size')

// ========== 角度转换工具 ==========

/** 弧度转角度 */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI)
}

/** 角度转弧度 */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180)
}
