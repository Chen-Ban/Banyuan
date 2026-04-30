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
export {
    getAdapter,
    getPropertyCategory,
    detectConflict,
    SPATIAL_PROPERTIES,
    SIZE_PROPERTIES,
} from './adapters'
export type { PropertyAdapter, PropertyCategory } from './adapters'
export { extractTranslation, extractRotationZ, lerpAngle } from './trs'
export type {
    EasingFunction,
    FillMode,
    PlaybackDirection,
    AnimationState,
    AnimatableValue,
    KeyframeDefinition,
    AnimationOptions,
    Interpolator,
    AnimationTarget,
} from './types'
