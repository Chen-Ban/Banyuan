import Matrix4 from '@/foundation/math/Matrix4'
import type { Interpolator, AnimatableValue, EasingFunction } from './types'

/**
 * 数值插值器
 */
export const numberInterpolator: Interpolator<number> = (from, to, progress) => {
    return from + (to - from) * progress
}

/**
 * Matrix4 插值器
 * 对 16 个元素逐一线性插值（适用于仿射变换的平滑过渡）
 * 注意：对于包含旋转的矩阵，简单线性插值在大角度时可能不理想，
 * 但对于编辑器场景中常见的小角度变换足够使用
 */
export const matrix4Interpolator: Interpolator<Matrix4> = (from, to, progress) => {
    const fromData = from.transform
    const toData = to.transform
    const result = new Float32Array(16)
    for (let i = 0; i < 16; i++) {
        result[i] = fromData[i] + (toData[i] - fromData[i]) * progress
    }
    return new Matrix4(result)
}

/**
 * 根据值类型自动选择插值器
 */
export function getInterpolator(value: AnimatableValue): Interpolator<any> {
    if (typeof value === 'number') {
        return numberInterpolator
    }
    if (value instanceof Matrix4) {
        return matrix4Interpolator
    }
    // 默认回退到数值插值
    return numberInterpolator
}

/**
 * 通用插值函数（双值）
 */
export function interpolate(from: AnimatableValue, to: AnimatableValue, progress: number): AnimatableValue {
    const interpolator = getInterpolator(from)
    return interpolator(from, to, progress)
}

/**
 * 已解析的关键帧段信息
 */
export interface ResolvedKeyframeSegment {
    startOffset: number
    endOffset: number
    startValue: AnimatableValue
    endValue: AnimatableValue
    easing?: EasingFunction
}

/**
 * 多关键帧分段插值
 * 根据 progress (0-1) 找到所在的关键帧段，进行局部插值
 */
export function interpolateKeyframes(
    segments: ResolvedKeyframeSegment[],
    progress: number
): AnimatableValue {
    // 边界情况
    if (segments.length === 0) {
        throw new Error('No keyframe segments provided')
    }

    // progress <= 第一段起点，返回第一段起始值
    if (progress <= segments[0].startOffset) {
        return segments[0].startValue
    }

    // progress >= 最后一段终点，返回最后一段终止值
    const lastSeg = segments[segments.length - 1]
    if (progress >= lastSeg.endOffset) {
        return lastSeg.endValue
    }

    // 找到 progress 所在的段
    for (const seg of segments) {
        if (progress >= seg.startOffset && progress <= seg.endOffset) {
            const segDuration = seg.endOffset - seg.startOffset
            if (segDuration === 0) return seg.endValue

            let localProgress = (progress - seg.startOffset) / segDuration
            // 应用该段的 easing
            if (seg.easing) {
                localProgress = seg.easing(localProgress)
            }
            return interpolate(seg.startValue, seg.endValue, localProgress)
        }
    }

    // 不应该到达这里，但防御性返回最后一段终值
    return lastSeg.endValue
}
