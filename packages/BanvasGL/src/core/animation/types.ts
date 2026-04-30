import type Matrix4 from '@/core/math/Matrix4'

/**
 * 缓动函数类型
 */
export type EasingFunction = (t: number) => number

/**
 * 动画填充模式（与 Web Animation API 一致）
 * - none: 动画不播放时不应用任何样式
 * - forwards: 动画结束后保持最后一帧的状态
 * - backwards: 动画 delay 期间应用第一帧的状态
 * - both: 同时具备 forwards 和 backwards 的行为
 */
export type FillMode = 'none' | 'forwards' | 'backwards' | 'both'

/**
 * 动画播放方向（与 Web Animation API 一致）
 * - normal: 正向播放
 * - reverse: 反向播放
 * - alternate: 奇数次正向，偶数次反向
 * - alternate-reverse: 奇数次反向，偶数次正向
 */
export type PlaybackDirection = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'

/**
 * 动画状态
 */
export type AnimationState = 'idle' | 'running' | 'paused' | 'finished' | 'cancelled'

/**
 * 可动画属性值类型
 */
export type AnimatableValue = number | Matrix4

/**
 * 单个关键帧
 * 除了动画属性外，可包含 offset 和 easing
 */
export interface Keyframe {
    /** 关键帧偏移量 0-1，不指定则均匀分布 */
    offset?: number
    /** 从此关键帧到下一帧使用的缓动函数 */
    easing?: EasingFunction
    /** 动画属性键值对 */
    [property: string]: AnimatableValue | number | EasingFunction | undefined
}

/**
 * 简写关键帧属性映射（用于双帧简写 API）
 */
export interface KeyframeProps {
    [property: string]: AnimatableValue
}

/**
 * 关键帧对象简写形式（类似 CSS @keyframes）
 * 支持 from/to + 百分比关键帧混合定义
 *
 * @example
 * {
 *   from: { x: 0 },
 *   '10': { x: 50 },
 *   '50': { x: 100 },
 *   '90': { x: 150 },
 *   to: { x: 200 }
 * }
 *
 * from 等价于 offset: 0，to 等价于 offset: 1
 * 数字键表示百分比（0-100），映射到 offset 0-1
 */
export interface KeyframeShorthand {
    from?: KeyframeProps
    to?: KeyframeProps
    [percentage: string]: KeyframeProps | undefined
}

/**
 * Animation 构造函数的关键帧输入类型（统一入口）
 * - Keyframe[]: 标准多关键帧数组
 * - KeyframeProps: 仅目标值简写（从当前值过渡到目标）
 * - KeyframeShorthand: 类 CSS @keyframes 对象形式（from/to + 百分比）
 */
export type KeyframeInput = Keyframe[] | KeyframeProps | KeyframeShorthand

/**
 * 动画配置选项（与 Web Animation API 的 KeyframeEffectOptions 对齐）
 */
export interface AnimationOptions {
    /** 动画时长 (ms) */
    duration: number
    /** 全局缓动函数，默认 linear（作用于整个动画进度） */
    easing?: EasingFunction
    /** 延迟启动 (ms)，默认 0 */
    delay?: number
    /** 填充模式，默认 'none' */
    fillMode?: FillMode
    /** 播放方向，默认 'normal' */
    direction?: PlaybackDirection
    /** 迭代次数，默认 1，支持 Infinity */
    iterations?: number
    /** 动画开始回调 */
    onStart?: () => void
    /** 每帧更新回调 */
    onUpdate?: (progress: number) => void
    /** 动画完成回调（所有迭代完毕或手动 finish） */
    onFinish?: () => void
    /** 动画取消回调 */
    onCancel?: () => void
    /** 单次迭代完成回调 */
    onIteration?: (currentIteration: number) => void
}

/**
 * 插值器函数类型
 */
export type Interpolator<T = any> = (from: T, to: T, progress: number) => T

/**
 * 动画目标接口——View 需要满足的约束
 */
export interface AnimationTarget {
    [key: string]: any
}
