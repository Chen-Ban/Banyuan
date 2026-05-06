/**
 * 空间属性适配器（x / y / rotation）
 *
 * 底层存储：View.matrix（4×4 仿射矩阵，行主序）
 *
 * 读取（get）：从 matrix 中分解出对应分量
 * 写入（set）：分解当前 matrix 为 TRS → 修改目标分量 → 重新合成 matrix
 *
 * 合成顺序：T * R（先旋转后平移），与引擎渲染管线一致。
 */

import type View from '@/core/views/View/View'
import type Matrix4 from '@/core/math/Matrix4'
import { Matrix4 as Matrix4Class } from '@/core/math'
import type { PropertyAdapter } from './types'

/**
 * 从 matrix 分解出完整的 2D TRS 参数
 */
function decomposeTRS(matrix: Matrix4): { x: number; y: number; rotation: number } {
    const { x, y } = matrix.extractTranslation2D()
    const rotation = matrix.extractRotationZ()
    return { x, y, rotation }
}

/**
 * 从 TRS 参数合成 matrix
 * 合成顺序：Translation * RotationZ
 */
function composeTRS(x: number, y: number, rotation: number): Matrix4 {
    return Matrix4Class.identity().translate(x, y, 0).rotateZ(rotation)
}

export const xAdapter: PropertyAdapter = {
    category: 'spatial',

    get(view: View, relativeMatrix?: Matrix4): number {
        const m = relativeMatrix ?? view.matrix
        return m.extractTranslation2D().x
    },

    set(view: View, value: number): void {
        const { y, rotation } = decomposeTRS(view.matrix)
        view.matrix = composeTRS(value, y, rotation)
    },
}

export const yAdapter: PropertyAdapter = {
    category: 'spatial',

    get(view: View, relativeMatrix?: Matrix4): number {
        const m = relativeMatrix ?? view.matrix
        return m.extractTranslation2D().y
    },

    set(view: View, value: number): void {
        const { x, rotation } = decomposeTRS(view.matrix)
        view.matrix = composeTRS(x, value, rotation)
    },
}

export const rotationAdapter: PropertyAdapter = {
    category: 'spatial',

    /**
     * 读取旋转角度（弧度）
     * 面板层可自行转换为角度展示
     */
    get(view: View, relativeMatrix?: Matrix4): number {
        const m = relativeMatrix ?? view.matrix
        return m.extractRotationZ()
    },

    set(view: View, value: number): void {
        const { x, y } = decomposeTRS(view.matrix)
        view.matrix = composeTRS(x, y, value)
    },
}

/**
 * 所有空间属性适配器
 */
export const spatialAdapters: Record<string, PropertyAdapter> = {
    x: xAdapter,
    y: yAdapter,
    rotation: rotationAdapter,
}
