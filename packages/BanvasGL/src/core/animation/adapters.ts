import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'
import { extractTranslation, extractRotationZ, lerpAngle } from './trs'
import type { AnimatableValue } from './types'

/**
 * 动画属性类别
 */
export type PropertyCategory = 'spatial' | 'size' | 'direct'

/**
 * 属性适配器接口
 *
 * 负责用户语义属性和 View 实际数据结构之间的映射：
 * - spatial（空间属性）：x/y/rotation → matrix
 * - size（尺寸属性）：width/height/scaleX/scaleY → viewport + content resize
 * - direct（直通属性）：直接读写 View 上的同名属性
 */
export interface PropertyAdapter {
    /** 属性类别 */
    category: PropertyCategory
    /**
     * 从 View 读取当前语义属性值
     * @param view 目标 View
     * @param relativeMatrix 可选，referenceFrame 模式下 View 到参考系的变换矩阵
     */
    get(view: View, relativeMatrix?: Matrix4): number
    /**
     * 插值函数（默认线性，rotation 走短弧）
     */
    interpolate(from: number, to: number, t: number): number
}

// ========== 内置适配器 ==========

const linearLerp = (from: number, to: number, t: number) => from + (to - from) * t

/**
 * 空间属性适配器（x/y/rotation → matrix）
 */
const spatialAdapters: Record<string, PropertyAdapter> = {
    x: {
        category: 'spatial',
        get(view: View, relativeMatrix?: Matrix4): number {
            const m = relativeMatrix ?? view.matrix
            return extractTranslation(m).x
        },
        interpolate: linearLerp,
    },
    y: {
        category: 'spatial',
        get(view: View, relativeMatrix?: Matrix4): number {
            const m = relativeMatrix ?? view.matrix
            return extractTranslation(m).y
        },
        interpolate: linearLerp,
    },
    rotation: {
        category: 'spatial',
        get(view: View, relativeMatrix?: Matrix4): number {
            const m = relativeMatrix ?? view.matrix
            return extractRotationZ(m)
        },
        interpolate: lerpAngle,
    },
}

/**
 * 尺寸属性适配器（width/height/scaleX/scaleY → viewport resize）
 *
 * scaleX/scaleY 的 get 返回 1（表示当前缩放基准），
 * 动画时会在 Animation 层将 scale 转为目标宽高。
 */
const sizeAdapters: Record<string, PropertyAdapter> = {
    width: {
        category: 'size',
        get(view: View): number {
            return view.viewport.width
        },
        interpolate: linearLerp,
    },
    height: {
        category: 'size',
        get(view: View): number {
            return view.viewport.height
        },
        interpolate: linearLerp,
    },
    scaleX: {
        category: 'size',
        get(): number {
            return 1
        },
        interpolate: linearLerp,
    },
    scaleY: {
        category: 'size',
        get(): number {
            return 1
        },
        interpolate: linearLerp,
    },
}

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

// ========== 冲突检测 ==========

/**
 * 互斥属性组（同组中的属性不能同时出现在一个动画中）
 */
const CONFLICT_GROUPS: string[][] = [
    ['width', 'scaleX'],
    ['height', 'scaleY'],
]

/**
 * 检测属性列表中的冲突
 *
 * @param properties 动画涉及的属性名列表
 * @returns 冲突描述字符串，无冲突返回 null
 */
export function detectConflict(properties: string[]): string | null {
    const propSet = new Set(properties)
    for (const group of CONFLICT_GROUPS) {
        const found = group.filter(p => propSet.has(p))
        if (found.length > 1) {
            return `Animation property conflict: "${found.join('" and "')}" cannot be used together. ` +
                `They both control the same dimension through resize.`
        }
    }
    return null
}

/**
 * 空间属性列表（用于判断是否需要合成矩阵）
 */
export const SPATIAL_PROPERTIES = Object.keys(spatialAdapters)

/**
 * 尺寸属性列表
 */
export const SIZE_PROPERTIES = Object.keys(sizeAdapters)
