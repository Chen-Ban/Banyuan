import MathUtils, { type ResolvedKeyframeSegment } from '@/foundation/math/MathUtils'
import Matrix4 from '@/foundation/math/Matrix4'
import type AnimationDescriptor from './AnimationDescriptor'
import type {
    AnimatableValue,
    KeyframeProps,
    EasingFunction,
    IAnimationDescriptor,
} from '@/types'

/**
 * 属性插值策略映射（由外部传入）
 *
 * key: 属性名
 * value: 'angle' 表示走短弧插值，默认走线性插值
 */
export type InterpolationHints = Record<string, 'angle'>

/**
 * AnimationExecutor —— 纯计算动画执行器
 *
 * 每个 AnimationDescriptor 对应一个 AnimationExecutor 实例，
 * 由 AnimationManager 持有并在每帧驱动。
 *
 * 职责：
 * 1. 根据传入的 initialValues 快照构建关键帧段
 * 2. 每帧根据时间戳和 descriptor 的配置计算当前值
 * 3. 将计算结果写入 descriptor.computedValues（消费方按需读取）
 * 4. 动画结束时触发 descriptor 回调
 *
 * 设计原则：
 * - 不持有任何 View / Addon 引用（纯数据计算，无副作用）
 * - 不依赖属性注册表（属性的特殊插值策略通过 hints 传入）
 * - 属性映射和副作用由消费侧（AnimationAddon / View）负责
 */
export default class AnimationExecutor {
    public readonly descriptor: AnimationDescriptor

    // ── 执行时状态 ───────────────────────────────────────────────────────────

    /** 已解析的关键帧段（每个属性独立一组段） */
    private _segments: Map<string, ResolvedKeyframeSegment[]> = new Map()

    /** 初始值快照（由 AnimationAddon 在创建时传入） */
    private _initialValues: KeyframeProps

    /** 属性插值策略提示（外部传入） */
    private _hints: InterpolationHints

    /** onStart 回调是否已触发 */
    private _startedCallback: boolean = false

    /** 上一次触发 onIteration 时的迭代次数 */
    private _lastIteration: number = 0

    constructor(
        descriptor: AnimationDescriptor,
        initialValues: KeyframeProps,
        hints?: InterpolationHints,
    ) {
        this.descriptor = descriptor
        this._initialValues = initialValues
        this._hints = hints ?? {}
        this._buildSegments()
    }

    // ── 帧驱动 ───────────────────────────────────────────────────────────────

    /**
     * 由 AnimationManager 每帧调用
     * @returns false 表示动画已结束，Manager 应移除此 Executor
     */
    tick(timestamp: number): boolean {
        const desc = this.descriptor

        if (desc.state === 'paused') return true
        if (desc.state !== 'running') return false

        // 首次 tick：记录开始时间
        if (desc.startTime === -1) {
            desc.startTime = timestamp + desc.delay - desc.pausedElapsed
            if (desc.pausedElapsed === 0 && desc.delay > 0) {
                return true
            }
        }

        desc.lastTimestamp = timestamp

        const elapsed = timestamp - desc.startTime
        if (elapsed < 0) return true // 还在 delay 中

        // 触发 onStart（仅一次）
        if (!this._startedCallback) {
            this._startedCallback = true
            desc.onStart?.()
        }

        const totalDuration = desc.duration * desc.iterations

        // 检查是否所有迭代已完成
        if (desc.iterations !== Infinity && elapsed >= totalDuration) {
            const finalProgress = this._getFinalDirectedProgress()
            this._applyAtProgress(finalProgress)
            this._doFinish()
            return false
        }

        // 计算当前迭代和迭代内进度
        const currentIteration = Math.floor(elapsed / desc.duration)
        const iterationProgress = (elapsed % desc.duration) / desc.duration

        // 触发迭代回调
        if (currentIteration > this._lastIteration) {
            desc.onIteration?.(currentIteration)
            this._lastIteration = currentIteration
        }

        // 根据 direction 计算有效进度
        const directedProgress = this._getDirectedProgress(iterationProgress, currentIteration)

        // 应用全局 easing
        const easedProgress = desc.easing(directedProgress)

        // 计算并更新 computedValues
        this._applyAtProgress(easedProgress)

        // 触发 onUpdate
        const overallProgress = desc.iterations === Infinity
            ? iterationProgress
            : Math.min(elapsed / totalDuration, 1)
        desc.onUpdate?.(overallProgress)

        return true
    }

    /**
     * 处理 descriptor.state === 'cancelled' 的清理工作
     * 由 AnimationManager 在检测到状态变化时调用
     */
    handleCancel(): void {
        this.descriptor.computedValues = {}
        this.descriptor.onCancel?.()
    }

    /**
     * 处理 descriptor.state === 'finished'（手动 finish）的跳终态工作
     * 由 AnimationManager 在检测到状态变化时调用
     */
    handleFinish(): void {
        const finalProgress = this._getFinalDirectedProgress()
        this._applyAtProgress(finalProgress)
        this._doFinish()
    }

    // ── 内部：完成处理 ───────────────────────────────────────────────────────

    private _doFinish(): void {
        const desc = this.descriptor
        desc.onUpdate?.(1)
        desc.state = 'finished'
        desc.onFinish?.()
        desc._finishResolve?.()
    }

    // ── 内部：关键帧段构建 ───────────────────────────────────────────────────

    /**
     * 根据 initialValues 和 keyframes 构建插值分段
     *
     * 冲突处理在此层不做——由 AnimationAddon 在挂载前处理冲突
     * （新动画打断旧动画的属性，从旧动画的当前 computedValue 作为 initialValue）
     */
    private _buildSegments(): void {
        this._segments.clear()

        for (const prop of this.descriptor.properties) {
            const fromValue = this._initialValues[prop]

            // 收集该属性在各关键帧中的值
            const keyframeValues: { offset: number; value: AnimatableValue; easing?: EasingFunction }[] = []

            for (const kf of this.descriptor.keyframes) {
                const val = kf[prop] as AnimatableValue | undefined
                if (val !== undefined) {
                    keyframeValues.push({
                        offset: kf.offset ?? -1,
                        value: val,
                        easing: kf.easing as EasingFunction | undefined,
                    })
                } else if (kf.offset === 0 || (keyframeValues.length === 0 && kf === this.descriptor.keyframes[0])) {
                    if (fromValue !== undefined) {
                        keyframeValues.push({
                            offset: kf.offset ?? 0,
                            value: fromValue,
                            easing: kf.easing as EasingFunction | undefined,
                        })
                    }
                }
            }

            // 如果第一帧缺值，补充初始值
            if (keyframeValues.length > 0 && keyframeValues[0].offset !== 0) {
                if (fromValue !== undefined) {
                    keyframeValues.unshift({ offset: 0, value: fromValue })
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

    // ── 内部：进度计算 ───────────────────────────────────────────────────────

    private _getDirectedProgress(iterationProgress: number, currentIteration: number): number {
        switch (this.descriptor.direction) {
            case 'normal':            return iterationProgress
            case 'reverse':           return 1 - iterationProgress
            case 'alternate':         return currentIteration % 2 === 0 ? iterationProgress : 1 - iterationProgress
            case 'alternate-reverse': return currentIteration % 2 === 0 ? 1 - iterationProgress : iterationProgress
            default:                  return iterationProgress
        }
    }

    private _getFinalDirectedProgress(): number {
        const finalIteration = this.descriptor.iterations === Infinity
            ? 0
            : Math.ceil(this.descriptor.iterations) - 1
        return this._getDirectedProgress(1, finalIteration)
    }

    // ── 内部：属性计算（纯数值插值，无副作用） ───────────────────────────────

    private _applyAtProgress(progress: number): void {
        const desc = this.descriptor

        for (const prop of desc.properties) {
            const segments = this._segments.get(prop)
            if (segments) {
                // 根据 hints 判断是否使用角度插值
                if (this._hints[prop] === 'angle') {
                    desc.computedValues[prop] = this._interpolateAngleSegments(segments, progress)
                } else {
                    desc.computedValues[prop] = MathUtils.interpolateKeyframes(segments, progress)
                }
            }
        }
    }

    private _interpolateAngleSegments(segments: ResolvedKeyframeSegment[], progress: number): number {
        for (const seg of segments) {
            if (progress >= seg.startOffset && progress <= seg.endOffset) {
                const segDuration = seg.endOffset - seg.startOffset
                const segProgress = segDuration > 0 ? (progress - seg.startOffset) / segDuration : 1
                const easedSeg = seg.easing ? seg.easing(segProgress) : segProgress
                return MathUtils.lerpAngle(seg.startValue as number, seg.endValue as number, easedSeg)
            }
        }
        if (segments.length > 0) {
            return progress <= segments[0].startOffset
                ? segments[0].startValue as number
                : segments[segments.length - 1].endValue as number
        }
        return 0
    }
}
