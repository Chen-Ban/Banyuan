import { MathUtils } from '@/foundation/math'

export { default as AnimationDescriptor } from './AnimationDescriptor'
export type { PropertyClassification } from './AnimationDescriptor'
export { default as AnimationManager } from './AnimationManager'
export type { InterpolationHints } from './AnimationExecutor'

/** 缓动函数集合（MathUtils.Easings 的便捷重导出） */
export const Easings = MathUtils.Easings

export type {
    EasingFunction,
    FillMode,
    PlaybackDirection,
    AnimationState,
    AnimatableValue,
    KeyframeDefinition,
    AnimationOptions,
    Interpolator,
} from '@/types/engine/animation'
