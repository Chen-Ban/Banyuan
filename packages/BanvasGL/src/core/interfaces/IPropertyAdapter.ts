/**
 * IPropertyAdapter —— 属性适配器公共接口
 *
 * 属性适配器解决的核心问题：
 * 用户语义属性（x, y, rotation, width, height）与引擎内部数据结构（matrix, viewport）
 * 之间的双向映射。
 *
 * 消费场景：
 * - 属性面板：展示/编辑 View 的语义属性
 * - 动画系统：读取当前值 → 插值 → 写回
 * - 脚本/插件：通过语义属性名操作 View
 */

import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'

/**
 * 属性类别
 *
 * - spatial: 空间属性（x/y/rotation），底层存储在 matrix 中
 * - size: 尺寸属性（width/height/scaleX/scaleY），底层存储在 viewport 中
 * - direct: 直通属性，直接读写 View 上的同名字段
 */
export type PropertyCategory = 'spatial' | 'size' | 'direct'

/**
 * 属性适配器接口
 *
 * 每个适配器负责一个语义属性与引擎数据结构之间的双向转换。
 */
export interface PropertyAdapter {
    /** 属性类别 */
    category: PropertyCategory

    /**
     * 从 View 读取当前语义属性值
     *
     * @param view 目标 View
     * @param relativeMatrix 可选，参考系模式下 View 到参考系的变换矩阵
     * @returns 属性的当前值（数值类型）
     */
    get(view: View, relativeMatrix?: Matrix4): number

    /**
     * 将语义属性值写回 View
     *
     * 写入策略：先从 matrix 分解出完整 TRS，修改目标分量，再合成回 matrix。
     * 这样保证修改单个属性不会影响其他属性。
     *
     * @param view 目标 View
     * @param value 要设置的值
     */
    set(view: View, value: number): void
}

/**
 * 属性值描述（用于面板展示）
 */
export interface PropertyDescriptor {
    /** 属性名 */
    name: string
    /** 属性类别 */
    category: PropertyCategory
    /** 显示标签 */
    label: string
    /** 单位（用于面板展示） */
    unit?: 'px' | 'deg' | 'rad' | '%' | ''
    /** 精度（小数位数） */
    precision?: number
    /** 最小值 */
    min?: number
    /** 最大值 */
    max?: number
    /** 步进值 */
    step?: number
}

/**
 * 互斥属性组定义
 * 同组中的属性不能同时被动画驱动（但面板中可以联动展示）
 */
export interface ConflictGroup {
    properties: string[]
    message: string
}
