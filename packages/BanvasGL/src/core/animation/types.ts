import type Matrix4 from '@/core/math/Matrix4'
import type View from '@/core/views/View/View'

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

/**
 * 关键帧属性映射（单帧的属性定义）
 * @internal
 */
export interface KeyframeProps {
    [property: string]: AnimatableValue
}

/**
 * 动画关键帧定义（用户唯一的关键帧输入格式）
 *
 * 设计原则：
 * - 动画起始值永远取 View 当前状态快照，不允许用户指定
 * - to 必填，表示动画终态
 * - 数字键表示百分比中间帧（0-100），映射到 offset 0-1
 *
 * @example
 * // 最简：直接到终态
 * { to: { x: 200, opacity: 1 } }
 *
 * // 带中间帧
 * {
 *   '25': { x: 80 },
 *   '75': { x: 180 },
 *   to: { x: 200 }
 * }
 *
 * // 每段可指定独立 easing
 * {
 *   '50': { x: 100, easing: Easings.easeInOut },
 *   to: { x: 200 }
 * }
 */
export interface KeyframeDefinition {
    /** 动画终态（必填） */
    to: KeyframeProps
    /** 百分比中间帧，键为数字字符串 0-100 */
    [percentage: string]: KeyframeProps | undefined
}

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

    /**
     * 参考系视图（仅对空间属性 x/y/rotation 生效）
     *
     * - 不传：相对变换，to 中的值是增量（在当前基础上偏移多少）
     * - 传祖先 View：绝对变换，to 中的值是在该祖先坐标系下的目标位置
     *
     * 内部通过 view.getWorldMatrix(referenceFrame) 获取当前 View
     * 到参考系 View 之间的变换矩阵，以确定坐标换算关系。
     *
     * @example
     * // 相对偏移：x 方向移动 100
     * view.animate({ to: { x: 100 } }, { duration: 1000 })
     *
     * // 绝对定位：在父 View 坐标系下移到 x=200
     * view.animate({ to: { x: 200 } }, { duration: 1000, referenceFrame: parentView })
     */
    referenceFrame?: View

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
