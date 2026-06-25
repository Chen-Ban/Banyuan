/**
 * 动画系统公共接口与类型
 *
 * 所有动画相关的公共类型定义于此文件。
 * 模块内部使用的 @internal 类型（Keyframe）保留在
 * foundation/animation/types.ts，不属于公共 API。
 */

import type Matrix4 from '@/foundation/math/Matrix4'
import type Bounds from '@/graph/base/Bounds'
import type { IView } from '../view/view'
import { AddonType } from '@/foundation/constants'
import type { IAddonBase } from '../view/addon'

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
 * - 动画起始值由 AnimationAddon 自动从 View 当前状态采集
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
   * @example
   * // 相对偏移：x 方向移动 100
   * view.animate({ to: { x: 100 } }, { duration: 1000 })
   *
   * // 绝对定位：在父 View 坐标系下移到 x=200
   * view.animate({ to: { x: 200 } }, { duration: 1000, referenceFrame: parentView })
   */
  referenceFrame?: IView

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
 * 描述"要播放什么动画"以及当前播放状态。
 * 计算由 AnimationExecutor 负责，结果写入 computedValues。
 * 消费方通过 AnimationAddon.getAnimatedValue() 按需读取。
 */
export interface IAnimationDescriptor {
  /** 唯一标识 */
  readonly id: string
  /** 动画控制的属性列表 */
  properties: string[]
  /** 当前帧计算值（Executor 每帧写入，消费方按需读取） */
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

// ── 动画插件公共接口 ──────────────────────────────────────────────────────────

/**
 * IAnimationAddon —— 动画插件公共接口
 *
 * AnimationAddon 为 View 提供关键帧动画驱动能力，对标 Web Animation API。
 * 作为 addon 体系的一员，继承 IAddonBase，但 capabilities 为空数组
 * （不参与 renderPlugins / interactPlugins 管线），由 AnimationManager 每帧 tick 驱动。
 *
 * 拉模型设计：
 * - animate() 采集初始值 → 挂载 descriptor → 注册到 Manager
 * - Executor 每帧计算 → 写入 descriptor.computedValues
 * - 消费侧通过 getAnimatedValue() 按需读取
 * - 结束时通过回调在消费侧提交终态
 */
export interface IAnimationAddon extends IAddonBase {
  readonly type: AddonType.ANIMATION
  /** 创建并播放动画 */
  animate(definition: KeyframeDefinition, options: AnimationOptions): IAnimationDescriptor
  /** 获取渲染时应使用的属性值（动画计算值优先） */
  getAnimatedValue(prop: string): AnimatableValue | undefined
  /** 取消该 View 上的所有动画 */
  cancelAll(): void
  /** 立即完成该 View 上的所有动画 */
  finishAll(): void
  /** 动画覆盖视口（消费侧管理，渲染时优先读取） */
  animatedViewport: Bounds | null
  /** 解析动画覆盖视口（检查 width/height 动画值） */
  resolveAnimatedViewport(): Bounds | null
  /** 解析动画矩阵（检查 x/y/rotation 动画值） */
  resolveAnimatedMatrix(): Matrix4 | undefined
  /** 将动画从活跃列表移除 */
  removeAnimation(anim: IAnimationDescriptor): void
  /** 获取当前所有活跃动画 */
  getAnimations(): IAnimationDescriptor[]
}

// ── 内部类型（供 animation 模块内部使用） ──────────────────────────────────────

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

// ── 动画模块内部跨文件共享类型（从实现文件收拢至此） ──────────────────────────

/**
 * 属性分类信息（由 AnimationAddon 传入 AnimationDescriptor）
 */
export interface PropertyClassification {
  /** 动画涉及的所有属性名 */
  properties: string[]
  /** 空间属性（x/y/rotation → matrix） */
  spatialProps: string[]
  /** 尺寸属性（width/height/scaleX/scaleY → viewport） */
  sizeProps: string[]
  /** 直通属性（直接读写 View 同名属性） */
  directProps: string[]
}

/**
 * 属性插值策略映射（由 AnimationAddon 传入 AnimationExecutor）
 *
 * key: 属性名
 * value: 'angle' 表示走短弧插值，默认走线性插值
 */
export type InterpolationHints = Record<string, 'angle'>

/**
 * 已解析的关键帧段信息（由 MathUtils 计算关键帧过渡用）
 */
export interface ResolvedKeyframeSegment {
  startOffset: number
  endOffset: number
  startValue: AnimatableValue
  endValue: AnimatableValue
  easing?: EasingFunction
}
