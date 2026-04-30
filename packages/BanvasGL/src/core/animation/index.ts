export { default as Animation } from './Animation'
export { default as AnimationManager } from './AnimationManager'
export { Easings, cubicBezier } from './easings'
export {
    numberInterpolator,
    matrix4Interpolator,
    getInterpolator,
    interpolate,
    interpolateKeyframes,
} from './interpolators'
export type { ResolvedKeyframeSegment } from './interpolators'
export type {
    EasingFunction,
    FillMode,
    PlaybackDirection,
    AnimationState,
    AnimatableValue,
    Keyframe,
    KeyframeProps,
    AnimationOptions,
    Interpolator,
    AnimationTarget,
} from './types'
