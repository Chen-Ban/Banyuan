/**
 * IAnimation —— 动画系统公共接口与类型
 *
 * 将原本散落在 core/animation/types.ts 中的公共类型统一收录于此，
 * 消除接口层反向依赖实现层（animation/types）的问题。
 *
 * @internal 标注的类型（Keyframe、KeyframeProps）仍保留在 animation/types.ts，
 * 不属于公共 API。
 */

import type Matrix4 from '@/foundation/math/Matrix4'
import type View from '@/view/View/View'
import type Bounds from '@/graph/base/Bounds'

// ── 基础值类型 ──────────────────────────────────────────────────────────────

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

// ── 关键帧定义 ───────────────────────────────────────────────────────────────

/**
 * 关键帧属性映射（单帧的属性定义）
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

// ── 动画配置 ─────────────────────────────────────────────────────────────────

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

// ── 动画描述对象公共契约 ──────────────────────────────────────────────────────

/**
 * IAnimationDescriptor —— 动画描述对象的公共契约
 *
 * View 持有此接口，描述"要播放什么动画"以及当前播放状态。
 * 具体执行由 AnimationManager 侧的 AnimationExecutor 负责。
 */
export interface IAnimationDescriptor {
    /** 唯一标识 */
    readonly id: string
    /** 动画控制的属性列表 */
    properties: string[]
    /** 当前帧计算值（渲染时读取） */
    computedValues: Record<string, AnimatableValue>

    // 状态
    readonly state: AnimationState
    readonly isActive: boolean

    // 配置（只读）
    readonly duration: number
    readonly delay: number
    readonly iterations: number

    // 回调
    onStart: (() => void) | null
    onUpdate: ((progress: number) => void) | null
    onFinish: (() => void) | null
    onCancel: (() => void) | null
    onIteration: ((currentIteration: number) => void) | null

    /** 动画完成的 Promise */
    readonly finished: Promise<void>

    /** 播放动画 */
    play(): IAnimationDescriptor
    /** 暂停动画 */
    pause(): IAnimationDescriptor
    /** 恢复动画 */
    resume(): IAnimationDescriptor
    /** 取消动画 */
    cancel(): IAnimationDescriptor
    /** 立即完成动画（跳到终态） */
    finish(): IAnimationDescriptor
}

/**
 * AnimationManager 的公共接口
 */
export interface IAnimationManager {
    /** 注册动画并开始执行 */
    add(descriptor: IAnimationDescriptor, target: IAnimatable): void
    /** 移除动画 */
    remove(descriptor: IAnimationDescriptor): void
    /** 每帧驱动所有活跃动画 */
    tick(timestamp: number): void
    /** 当前活跃动画数量 */
    readonly count: number
}

// ── 动画系统内部契约 ─────────────────────────────────────────────────────────

/**
 * IAnimatable —— 动画系统内部契约
 *
 * AnimationAddon 实现此接口，AnimationExecutor 通过它操作动画目标，
 * 业务层无需感知这些方法的存在。
 *
 * @internal
 */
export interface IAnimatable {
    // ── 动画列表管理 ──
    /** 将动画注册到活跃列表 */
    addAnimation(anim: IAnimationDescriptor): void
    /** 将动画从活跃列表移除 */
    removeAnimation(anim: IAnimationDescriptor): void
    /** 获取当前所有活跃动画（用于冲突检测） */
    getAnimations(): IAnimationDescriptor[]
    /** 动画运行期间更新覆盖视口（不修改真实 viewport） */
    animationResize(targetWidth: number, targetHeight: number): void
    /** 将覆盖视口提交为真实 viewport（fillMode: forwards 时调用） */
    commitAnimatedViewport(): void
    /** 清空覆盖视口，恢复使用真实 viewport（fillMode: none 时调用） */
    clearAnimatedViewport(): void

    // ── AnimationExecutor 内部计算所需的属性（代理自宿主 View） ──
    matrix: Matrix4
    viewport: Bounds
    parent: unknown
    getWorldMatrix(parent?: any): Matrix4
}
