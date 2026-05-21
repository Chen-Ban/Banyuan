/**
 * 空间属性适配器（x / y / rotation）
 *
 * 底层存储：View.matrix（4×4 仿射矩阵，行主序）
 *
 * 读取（get）：从 matrix 中分解出对应分量
 * 写入（set）：分解当前 matrix 为 TRS → 修改目标分量 → 重新合成 matrix
 *
 * 合成顺序：T(x,y) * T(cx,cy) * R(θ) * T(-cx,-cy)
 * 即绕 transformOrigin 旋转，再平移到目标位置。
 */

import type View from '@/view/View/View'
import type Matrix4 from '@/foundation/math/Matrix4'
import { Matrix4 as Matrix4Class } from '@/foundation/math'
import type { TransformOrigin } from '@/types'
import type { PropertyAdapter } from '@/types'

/**
 * 根据 style.transformOrigin 和 viewport 解析出实际的变换中心坐标
 *
 * - 未设置或 'center'：viewport 中心（默认行为）
 * - 关键字：相对于 viewport 的预设位置
 * - Point3：直接使用坐标值
 */
function getOrigin(view: View): { cx: number; cy: number } {
    const vp = view.viewport
    const origin: TransformOrigin = view.style.transformOrigin ?? 'center'

    // Point3 对象（有 x/y 属性）
    if (typeof origin === 'object' && 'x' in origin && 'y' in origin) {
        return { cx: origin.x, cy: origin.y }
    }

    // 关键字
    switch (origin) {
        case 'topLeft':
            return { cx: vp.x, cy: vp.y }
        case 'top':
            return { cx: vp.midX, cy: vp.y }
        case 'topRight':
            return { cx: vp.x + vp.width, cy: vp.y }
        case 'left':
            return { cx: vp.x, cy: vp.midY }
        case 'right':
            return { cx: vp.x + vp.width, cy: vp.midY }
        case 'bottomLeft':
            return { cx: vp.x, cy: vp.y + vp.height }
        case 'bottom':
            return { cx: vp.midX, cy: vp.y + vp.height }
        case 'bottomRight':
            return { cx: vp.x + vp.width, cy: vp.y + vp.height }
        case 'center':
        default:
            return { cx: vp.midX, cy: vp.midY }
    }
}

/**
 * 从 matrix 分解出完整的 2D TRS 参数
 * 矩阵结构：T(x,y) * T(cx,cy) * R(θ) * T(-cx,-cy)
 *
 * 分解步骤：
 * 1. rotation 直接从矩阵的旋转分量提取
 * 2. position 从 translation 分量反推（去除 origin 引入的偏移）
 */
function decomposeTRS(matrix: Matrix4, cx: number, cy: number): { x: number; y: number; rotation: number } {
    const rotation = matrix.extractRotationZ()
    const { x: tx, y: ty } = matrix.extractTranslation2D()

    // 反推位置：tx = x + cx - cx*cos(θ) + cy*sin(θ)
    //           ty = y + cy - cx*sin(θ) - cy*cos(θ)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const x = tx - cx + cx * cos - cy * sin
    const y = ty - cy + cx * sin + cy * cos

    return { x, y, rotation }
}

/**
 * 从 TRS 参数合成 matrix
 * 合成顺序：T(x,y) * T(cx,cy) * R(θ) * T(-cx,-cy)
 *
 * 由于 translate/rotateZ 都是左乘，代码从右往左调用：
 * identity → translate(-cx,-cy) → rotateZ(θ) → translate(cx,cy) → translate(x,y)
 */
function composeTRS(x: number, y: number, rotation: number, cx: number, cy: number): Matrix4 {
    return Matrix4Class.identity()
        .translate(-cx, -cy, 0)
        .rotateZ(rotation)
        .translate(cx, cy, 0)
        .translate(x, y, 0)
}

export const xAdapter: PropertyAdapter = {
    category: 'spatial',

    get(view: View, relativeMatrix?: Matrix4): number {
        const m = relativeMatrix ?? view.matrix
        const { cx, cy } = getOrigin(view)
        return decomposeTRS(m, cx, cy).x
    },

    set(view: View, value: number): void {
        const { cx, cy } = getOrigin(view)
        const { y, rotation } = decomposeTRS(view.matrix, cx, cy)
        view.matrix = composeTRS(value, y, rotation, cx, cy)
    },
}

export const yAdapter: PropertyAdapter = {
    category: 'spatial',

    get(view: View, relativeMatrix?: Matrix4): number {
        const m = relativeMatrix ?? view.matrix
        const { cx, cy } = getOrigin(view)
        return decomposeTRS(m, cx, cy).y
    },

    set(view: View, value: number): void {
        const { cx, cy } = getOrigin(view)
        const { x, rotation } = decomposeTRS(view.matrix, cx, cy)
        view.matrix = composeTRS(x, value, rotation, cx, cy)
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
        const { cx, cy } = getOrigin(view)
        const { x, y } = decomposeTRS(view.matrix, cx, cy)
        view.matrix = composeTRS(x, y, value, cx, cy)
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
