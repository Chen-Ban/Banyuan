import { generateId } from '@/core/utils'
import { interpolateKeyframes, type ResolvedKeyframeSegment } from './interpolators'
import { Easings } from './easings'
import AnimationManager from './AnimationManager'
import type {
    AnimationOptions,
    AnimationState,
    AnimatableValue,
    Keyframe,
    KeyframeProps,
    KeyframeShorthand,
    KeyframeInput,
    FillMode,
    PlaybackDirection,
    EasingFunction,
} from './types'
import type View from '@/core/views/View/View'

/**
 * Animation 类
 *
 * 核心设计原则：
 * 1. 动画运行期间不修改 View 的基础属性
 * 2. 每帧计算结果存入 computedValues，渲染时优先读取
 * 3. 动画结束时根据 fillMode 一次性提交终态到 View
 * 4. 同属性冲突时，后者打断前者，从当前计算值无缝衔接
 *
 * 使用方式：
 * 1. 独立创建后挂载：
 *    const anim = new Animation([...keyframes], options)
 *    view.animate(anim)
 *
 * 2. 带 target 创建并手动 play：
 *    const anim = new Animation(view, [...keyframes], options)
 *    anim.play()
 *
 * 3. View 快捷 API（内部创建 Animation）：
 *    view.animate([...keyframes], options)
 *    view.animate({ x: 100 }, options)
 */
export default class Animation {
    public readonly id: string
    public target: View | null = null
    /** 动画控制的属性列表（外部只读，内部可被冲突解决修改） */
    public properties: string[]

    // 已解析的关键帧段（每个属性独立一组段）
    private _segments: Map<string, ResolvedKeyframeSegment[]> = new Map()

    // 原始关键帧
    private _keyframes: Keyframe[]

    // 配置
    public readonly duration: number
    public readonly delay: number
    public readonly fillMode: FillMode
    public readonly direction: PlaybackDirection
    public readonly iterations: number
    public readonly easing: EasingFunction

    // 回调
    public onStart: (() => void) | null = null
    public onUpdate: ((progress: number) => void) | null = null
    public onFinish: (() => void) | null = null
    public onCancel: (() => void) | null = null
    public onIteration: ((currentIteration: number) => void) | null = null

    // 状态
    private _state: AnimationState = 'idle'
    private _startTime: number = -1
    private _pausedElapsed: number = 0
    private _lastTimestamp: number = -1
    private _startedCallback: boolean = false
    private _lastIteration: number = 0

    // 计算结果——渲染时读取此对象
    public computedValues: Record<string, AnimatableValue> = {}

    // 快照——play() 时从 View 读取的原始值
    private _snapshotValues: KeyframeProps = {}

    // Promise 支持
    private _finishResolve: (() => void) | null = null
    private _finishReject: ((reason?: any) => void) | null = null
    public readonly finished: Promise<void>

    // ========== 构造函数重载 ==========

    /**
     * 不绑定 target 创建（后续通过 view.animate(anim) 挂载）
     */
    constructor(keyframes: Keyframe[], options: AnimationOptions)
    constructor(to: KeyframeProps, options: AnimationOptions)
    constructor(keyframes: KeyframeShorthand, options: AnimationOptions)

    /**
     * 绑定 target 创建（后续手动调用 play()）
     */
    constructor(target: View, keyframes: Keyframe[], options: AnimationOptions)
    constructor(target: View, to: KeyframeProps, options: AnimationOptions)
    constructor(target: View, keyframes: KeyframeShorthand, options: AnimationOptions)

    constructor(...args: any[]) {
        this.id = generateId()

        // 解析参数：判断第一个参数是否是 View（有 _addAnimation 方法）
        let target: View | null = null
        let keyframesOrTo: KeyframeInput
        let options: AnimationOptions

        if (args.length === 3 && args[0] && typeof args[0] === 'object' && '_addAnimation' in args[0]) {
            // (target, keyframes, options) 形式
            target = args[0] as View
            keyframesOrTo = args[1]
            options = args[2]
        } else if (args.length === 2) {
            // (keyframes, options) 形式
            keyframesOrTo = args[0]
            options = args[1]
        } else if (args.length === 3) {
            // 兜底：尝试判断第一个参数
            if (args[0] && typeof args[0] === 'object' && '_addAnimation' in args[0]) {
                target = args[0] as View
                keyframesOrTo = args[1]
                options = args[2]
            } else {
                // 不可能的情况，但防御处理
                keyframesOrTo = args[0]
                options = args[1]
            }
        } else {
            throw new Error('Animation: invalid constructor arguments')
        }

        this.target = target
        this.duration = options.duration
        this.delay = options.delay ?? 0
        this.fillMode = options.fillMode ?? 'none'
        this.direction = options.direction ?? 'normal'
        this.iterations = options.iterations ?? 1
        this.easing = options.easing ?? Easings.linear

        this.onStart = options.onStart ?? null
        this.onUpdate = options.onUpdate ?? null
        this.onFinish = options.onFinish ?? null
        this.onCancel = options.onCancel ?? null
        this.onIteration = options.onIteration ?? null

        // 统一转换为关键帧数组
        this._keyframes = this._normalizeKeyframes(keyframesOrTo)

        // 收集所有涉及的属性名
        const propSet = new Set<string>()
        for (const kf of this._keyframes) {
            for (const key of Object.keys(kf)) {
                if (key !== 'offset' && key !== 'easing') {
                    propSet.add(key)
                }
            }
        }
        this.properties = Array.from(propSet)

        // 创建 finished Promise
        this.finished = new Promise<void>((resolve, reject) => {
            this._finishResolve = resolve
            this._finishReject = reject
        })
        // 防止 cancel() 时产生 unhandled promise rejection
        this.finished.catch(() => {})
    }

    // ========== 状态访问 ==========

    get state(): AnimationState {
        return this._state
    }

    get isActive(): boolean {
        return this._state === 'running' || this._state === 'paused'
    }

    // ========== 绑定 target ==========

    /**
     * 绑定动画目标（由 view.animate(anim) 内部调用）
     * @internal
     */
    _bindTarget(view: View): void {
        if (this.target && this.target !== view) {
            throw new Error('Animation already bindTarget to another View. Create a new Animation instance.')
        }
        this.target = view
    }

    // ========== 控制方法 ==========

    /**
     * 播放动画
     * 要求 target 已绑定
     */
    play(): Animation {
        if (this._state === 'running') return this
        if (!this.target) {
            throw new Error('Animation has no target. Use view.animate(animation) to bindTarget and play.')
        }

        const target = this.target

        // 快照 View 当前基础属性
        for (const prop of this.properties) {
            this._snapshotValues[prop] = target[prop]
        }

        // 处理同属性冲突 + 构建关键帧段
        this._resolveConflictsAndBuildSegments()

        this._state = 'running'
        this._startTime = -1
        this._startedCallback = false
        this._lastIteration = 0

        // 注册到 View 的动画列表
        target._addAnimation(this)
        // 注册到全局 AnimationManager 以接受帧驱动
        AnimationManager.getInstance().add(this)

        // fillMode backwards/both: 立即应用第一帧状态
        if (this.fillMode === 'backwards' || this.fillMode === 'both') {
            this._applyAtProgress(0)
        }

        return this
    }

    /**
     * 暂停动画
     */
    pause(): Animation {
        if (this._state !== 'running') return this
        // 记录暂停时已经过的时间
        if (this._startTime !== -1 && this._lastTimestamp !== -1) {
            this._pausedElapsed = this._lastTimestamp - this._startTime
        }
        this._state = 'paused'
        return this
    }

    /**
     * 恢复动画
     */
    resume(): Animation {
        if (this._state !== 'paused') return this
        this._state = 'running'
        // 重置 startTime，下一次 tick 时会根据 _pausedElapsed 重新计算
        this._startTime = -1
        return this
    }

    /**
     * 取消动画
     */
    cancel(): Animation {
        if (this._state === 'finished' || this._state === 'cancelled') return this

        this._state = 'cancelled'
        this.computedValues = {}
        this.target?._removeAnimation(this)
        AnimationManager.getInstance().remove(this)
        this.onCancel?.()
        this._finishReject?.(new Error('Animation cancelled'))

        return this
    }

    /**
     * 立即完成动画（跳到终态）
     */
    finish(): Animation {
        if (this._state === 'finished' || this._state === 'cancelled') return this
        if (!this.target) return this

        const finalProgress = this._getFinalDirectedProgress()
        this._applyAtProgress(finalProgress)
        this._doFinish()

        return this
    }

    /**
     * 统一的动画完成处理（tick 自然结束和手动 finish 共用）
     * @internal
     */
    private _doFinish(): void {
        this._commit()
        this._state = 'finished'
        this.target?._removeAnimation(this)
        AnimationManager.getInstance().remove(this)
        this.onUpdate?.(1)
        this.onFinish?.()
        this._finishResolve?.()
    }

    // ========== 帧驱动 ==========

    /**
     * 由 AnimationManager 每帧调用
     * @returns false 表示动画已结束，应从管理器中移除
     */
    tick(timestamp: number): boolean {
        if (this._state !== 'running') return this._state === 'paused'

        // 首次 tick：记录开始时间
        if (this._startTime === -1) {
            this._startTime = timestamp + this.delay - this._pausedElapsed
            if (this._pausedElapsed === 0 && this.delay > 0) {
                return true
            }
        }

        // 记录最后一次 tick 的时间戳（供 pause 时计算已过时间）
        this._lastTimestamp = timestamp

        const elapsed = timestamp - this._startTime
        if (elapsed < 0) return true // 还在 delay 中

        // 触发 onStart（仅一次）
        if (!this._startedCallback) {
            this._startedCallback = true
            this.onStart?.()
        }

        // 计算总动画时长（考虑迭代次数）
        const totalDuration = this.duration * this.iterations

        // 检查是否所有迭代已完成
        if (this.iterations !== Infinity && elapsed >= totalDuration) {
            const finalProgress = this._getFinalDirectedProgress()
            this._applyAtProgress(finalProgress)
            this._doFinish()
            return false
        }

        // 计算当前迭代和迭代内进度
        const currentIteration = Math.floor(elapsed / this.duration)
        const iterationProgress = (elapsed % this.duration) / this.duration

        // 触发迭代回调
        if (currentIteration > this._lastIteration) {
            this.onIteration?.(currentIteration)
            this._lastIteration = currentIteration
        }

        // 根据 direction 计算有效进度
        const directedProgress = this._getDirectedProgress(iterationProgress, currentIteration)

        // 应用全局 easing
        const easedProgress = this.easing(directedProgress)

        // 计算并更新 computedValues
        this._applyAtProgress(easedProgress)

        // 触发 onUpdate
        const overallProgress = this.iterations === Infinity
            ? iterationProgress
            : Math.min(elapsed / totalDuration, 1)
        this.onUpdate?.(overallProgress)

        return true
    }

    // ========== 内部方法 ==========

    /**
     * 将输入统一转换为 Keyframe[]
     *
     * 支持三种输入形式：
     * 1. Keyframe[] — 直接使用
     * 2. KeyframeProps — 仅目标值，from 帧在 play() 时从快照补全
     * 3. KeyframeShorthand — 类 CSS @keyframes 对象，支持 from/to + 百分比混用
     *
     * @example KeyframeShorthand 形式
     * {
     *   from: { x: 0 },
     *   '10': { x: 50 },
     *   '50': { x: 100, easing: Easings.easeInOut },
     *   '90': { x: 150 },
     *   to: { x: 200 }
     * }
     */
    private _normalizeKeyframes(input: KeyframeInput): Keyframe[] {
        // 形式1：Keyframe 数组，直接返回
        if (Array.isArray(input)) {
            return input
        }

        // 判断是否为 KeyframeShorthand（含 from/to 键，或含数字百分比键）
        if (this._isKeyframeShorthand(input)) {
            return this._parseKeyframeShorthand(input as KeyframeShorthand)
        }

        // 形式2：KeyframeProps — 仅目标值简写
        // from 帧为空，play() 时从快照填充
        return [
            { offset: 0 },
            { offset: 1, ...(input as KeyframeProps) },
        ]
    }

    /**
     * 判断输入是否为 KeyframeShorthand 形式
     *
     * 区分规则：
     * - KeyframeShorthand 的值是对象（KeyframeProps），如 { from: { x: 0 }, to: { x: 100 } }
     * - KeyframeProps 的值是原始值（number/Matrix4），如 { x: 100, y: 200 }
     *
     * 仅当 from/to/数字键对应的值是非 null 对象时才判定为 shorthand，
     * 避免把 { to: 100 }（动画 to 属性到 100）误判为 shorthand
     */
    private _isKeyframeShorthand(input: object): boolean {
        const obj = input as Record<string, any>
        // 含有 from 或 to 键，且值为对象类型
        if ('from' in obj && obj.from !== null && typeof obj.from === 'object') return true
        if ('to' in obj && obj.to !== null && typeof obj.to === 'object') return true
        // 含有数字键（百分比）且值为对象类型
        return Object.keys(obj).some(
            k => /^\d+(\.\d+)?$/.test(k) && obj[k] !== null && typeof obj[k] === 'object'
        )
    }

    /**
     * 解析 KeyframeShorthand 为标准 Keyframe[]
     *
     * 规则：
     * - 'from' 键 → offset: 0
     * - 'to' 键 → offset: 1
     * - 数字键（如 '10', '50', '90'）→ offset: 数字/100
     * - 结果按 offset 升序排列
     * - 如果没有 from 帧（offset:0），自动补空帧（play 时从快照填充）
     * - 如果没有 to 帧（offset:1），自动补空帧（取最后关键帧值）
     */
    private _parseKeyframeShorthand(input: KeyframeShorthand): Keyframe[] {
        const keyframes: Keyframe[] = []

        for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue

            let offset: number
            if (key === 'from') {
                offset = 0
            } else if (key === 'to') {
                offset = 1
            } else if (/^\d+(\.\d+)?$/.test(key)) {
                offset = parseFloat(key) / 100
                // 限制在 0-1 范围内
                offset = Math.max(0, Math.min(1, offset))
            } else {
                // 非法键名，跳过
                continue
            }

            keyframes.push({ offset, ...value })
        }

        // 按 offset 升序排列
        keyframes.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0))

        // 如果没有 offset:0 的帧，补空帧（play 时从快照填充）
        if (keyframes.length === 0 || (keyframes[0].offset ?? 0) !== 0) {
            keyframes.unshift({ offset: 0 })
        }

        // 如果没有 offset:1 的帧，补空帧
        if (keyframes.length === 0 || (keyframes[keyframes.length - 1].offset ?? 0) !== 1) {
            keyframes.push({ offset: 1 })
        }

        return keyframes
    }

    /**
     * 处理冲突并构建关键帧分段
     */
    private _resolveConflictsAndBuildSegments(): void {
        if (!this.target) return
        this._segments.clear()

        for (const prop of this.properties) {
            // 检查冲突
            const existingAnim = this._findConflictingAnimation(prop)
            let overrideFromValue: AnimatableValue | undefined

            if (existingAnim && existingAnim.computedValues[prop] !== undefined) {
                overrideFromValue = existingAnim.computedValues[prop]
                existingAnim._removeProperty(prop)
            }

            // 收集该属性在各关键帧中的值
            const keyframeValues: { offset: number; value: AnimatableValue; easing?: EasingFunction }[] = []

            for (const kf of this._keyframes) {
                const val = kf[prop] as AnimatableValue | undefined
                if (val !== undefined) {
                    keyframeValues.push({
                        offset: kf.offset ?? -1,
                        value: val,
                        easing: kf.easing as EasingFunction | undefined,
                    })
                } else if (kf.offset === 0 || (keyframeValues.length === 0 && kf === this._keyframes[0])) {
                    const fromVal = overrideFromValue ?? this._snapshotValues[prop]
                    if (fromVal !== undefined) {
                        keyframeValues.push({
                            offset: kf.offset ?? 0,
                            value: fromVal,
                            easing: kf.easing as EasingFunction | undefined,
                        })
                    }
                }
            }

            // 如果第一帧缺值，补充快照值
            if (keyframeValues.length > 0 && keyframeValues[0].offset !== 0) {
                const fromVal = overrideFromValue ?? this._snapshotValues[prop]
                if (fromVal !== undefined) {
                    keyframeValues.unshift({ offset: 0, value: fromVal })
                }
            } else if (keyframeValues.length > 0 && keyframeValues[0].offset === -1) {
                keyframeValues[0].offset = 0
            }

            // 自动分配未指定的 offset（均匀分布）
            this._distributeOffsets(keyframeValues)

            // 构建分段
            const segments: ResolvedKeyframeSegment[] = []
            for (let i = 0; i < keyframeValues.length - 1; i++) {
                segments.push({
                    startOffset: keyframeValues[i].offset,
                    endOffset: keyframeValues[i + 1].offset,
                    startValue: keyframeValues[i].value,
                    endValue: keyframeValues[i + 1].value,
                    easing: keyframeValues[i].easing,
                })
            }

            if (segments.length > 0) {
                this._segments.set(prop, segments)
            }
        }
    }

    /**
     * 自动分配未指定 offset 的关键帧
     */
    private _distributeOffsets(
        frames: { offset: number; value: AnimatableValue; easing?: EasingFunction }[]
    ): void {
        if (frames.length === 0) return

        if (frames[0].offset === -1) frames[0].offset = 0
        if (frames[frames.length - 1].offset === -1) frames[frames.length - 1].offset = 1

        let lastKnownIdx = 0
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].offset !== -1) {
                const gap = i - lastKnownIdx
                const startOffset = frames[lastKnownIdx].offset
                const endOffset = frames[i].offset
                for (let j = lastKnownIdx + 1; j < i; j++) {
                    frames[j].offset = startOffset + (endOffset - startOffset) * ((j - lastKnownIdx) / gap)
                }
                lastKnownIdx = i
            }
        }
    }

    /**
     * 根据 direction 和当前迭代次数计算有效进度
     */
    private _getDirectedProgress(iterationProgress: number, currentIteration: number): number {
        switch (this.direction) {
            case 'normal':
                return iterationProgress
            case 'reverse':
                return 1 - iterationProgress
            case 'alternate':
                return currentIteration % 2 === 0 ? iterationProgress : 1 - iterationProgress
            case 'alternate-reverse':
                return currentIteration % 2 === 0 ? 1 - iterationProgress : iterationProgress
            default:
                return iterationProgress
        }
    }

    /**
     * 获取动画结束时的最终有效进度
     */
    private _getFinalDirectedProgress(): number {
        const finalIteration = this.iterations === Infinity ? 0 : Math.ceil(this.iterations) - 1
        const finalIterationProgress = 1
        return this._getDirectedProgress(finalIterationProgress, finalIteration)
    }

    /**
     * 根据进度计算所有属性的值并写入 computedValues
     */
    private _applyAtProgress(progress: number): void {
        for (const [prop, segments] of this._segments) {
            this.computedValues[prop] = interpolateKeyframes(segments, progress)
        }
    }

    /**
     * 终态提交
     */
    private _commit(): void {
        if (!this.target) return
        if (this.fillMode === 'forwards' || this.fillMode === 'both') {
            for (const prop of this.properties) {
                const endValue = this.computedValues[prop]
                if (endValue !== undefined) {
                    this.target[prop] = endValue
                }
            }
        }
        this.computedValues = {}
    }

    /**
     * 查找正在控制指定属性的其他活跃动画
     */
    private _findConflictingAnimation(prop: string): Animation | null {
        if (!this.target) return null
        const animations = this.target._getAnimations()
        for (const anim of animations) {
            if (anim !== this && anim.isActive && anim.properties.includes(prop)) {
                return anim
            }
        }
        return null
    }

    /**
     * 移除对某属性的控制（被新动画打断时调用）
     */
    _removeProperty(prop: string): void {
        const index = this.properties.indexOf(prop)
        if (index !== -1) {
            this.properties.splice(index, 1)
            delete this.computedValues[prop]
            this._segments.delete(prop)
        }
        if (this.properties.length === 0) {
            this.cancel()
        }
    }

    /**
     * 获取某属性的当前动画计算值
     */
    getComputedValue(prop: string): AnimatableValue | undefined {
        return this.computedValues[prop]
    }
}
