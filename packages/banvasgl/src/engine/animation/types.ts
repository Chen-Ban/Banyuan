/**
 * animation 模块内部类型
 *
 * 公共类型（EasingFunction、FillMode、PlaybackDirection、AnimationState、
 * AnimatableValue、KeyframeProps、KeyframeDefinition、AnimationOptions、
 * Interpolator）已迁移至 @/types/IAnimation，请从那里导入。
 *
 * 本文件只保留模块内部使用的 @internal 类型，以及从 interfaces 的重新导出
 * （供模块内部文件统一从 './types' 导入，无需改动内部 import 路径）。
 */

// 从 interfaces 重新导出，供 animation 模块内部文件继续使用 './types' 路径
export type {
    EasingFunction,
    FillMode,
    PlaybackDirection,
    AnimationState,
    AnimatableValue,
    KeyframeProps,
    KeyframeDefinition,
    AnimationOptions,
    Interpolator,
} from '@/types'

import type { AnimatableValue, EasingFunction } from '@/types'

/**
 * 单个关键帧（内部表示，由 KeyframeDefinition 解析后生成）
 * @internal
 */
export interface Keyframe {
    /** 关键帧偏移量 0-1 */
    offset?: number
    /** 从此关键帧到下一帧使用的缓动函数 */
    easing?: EasingFunction
    /** 动画属性键值对 */
    [property: string]: AnimatableValue | number | EasingFunction | undefined
}

