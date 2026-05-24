import { interpolateKeyframes, type ResolvedKeyframeSegment } from './interpolators'
import { animationAdapterRegistry } from './adapters'
import { extractTranslation, extractRotationZ, lerpAngle } from './trs'
import Matrix4 from '@/foundation/math/Matrix4'
import type AnimationDescriptor from './AnimationDescriptor'
import type {
    AnimatableValue,
    KeyframeProps,
    EasingFunction,
    IAnimatable,
} from '@/types'

/**
 * AnimationExecutor —— 动画执行引擎
 *
 * 每个 AnimationDescriptor 对应一个 AnimationExecutor 实例，
 * 由 AnimationManager 持有并在每帧驱动。
 *
 * 职责：
 * 1. 在 bindAndPlay() 时从 View 快照初始状态
 * 2. 每帧根据时间戳和 descriptor 的配置计算当前值
 * 3. 将计算结果写入 descriptor.computedValues（渲染时读取）
 * 4. 动画结束时根据 fillMode 提交或清除终态
 * 5. 处理同属性冲突（打断先到的动画）
 *
 * 不持有 View 引用以外的任何 UI 状态，所有配置从 descriptor 读取。
 */
export default class AnimationExecutor {
    public readonly descriptor: AnimationDescriptor

    // ── 执行时状态 ───────────────────────────────────────────────────────────

    private _target: IAnimatable | null = null

    /** 已解析的关键帧段（每个属性独立一组段） */
    private _segments: Map<string, ResolvedKeyframeSegment[]> = new Map()

    /** 直通属性快照（bindAndPlay 时从 View 读取） */
    private _snapshotValues: KeyframeProps = {}

    /** 空间属性快照（从 matrix 分解出的起始 TRS 值） */
    private _spatialSnapshot: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }

    /** 空间属性的 matrix 快照（相对模式时作为基矩阵） */
    private _matrixSnapshot: Matrix4 = Matrix4.identity()

    /** 尺寸属性快照 */
    private _sizeSnapshot: { width: number; height: number } = { width: 0, height: 0 }

    /** onStart 回调是否已触发 */
    private _startedCallback: boolean = false

    /** 上一次触发 onIteration 时的迭代次数 */
    private _lastIteration: number = 0

    constructor(descriptor: AnimationDescriptor) {
        this.descriptor = descriptor
    }

    // ── 绑定目标 ─────────────────────────────────────────────────────────────

    /**
     * 绑定动画目标并执行 play 初始化
     * 由 AnimationManager 在接收到 descriptor 时调用
     */
    bindAndPlay(target: IAnimatable): void {
        this._target = target

        // ---- 快照空间属性 ----
        if (this.descriptor.spatialProps.length > 0) {
            if (this.descriptor.referenceFrame) {
                const relativeMatrix = target.getWorldMatrix(this.descriptor.referenceFrame)
                this._spatialSnapshot = {
                    x: extractTranslation(relativeMatrix).x,
                    y: extractTranslation(relativeMatrix).y,
                    rotation: extractRotationZ(relativeMatrix),
                }
            } else {
                this._spatialSnapshot = { x: 0, y: 0, rotation: 0 }
            }
            this._matrixSnapshot = target.matrix.copy()
        }

        // ---- 快照尺寸属性 ----
        if (this.descriptor.sizeProps.length > 0) {
            const viewport = target.viewport
            this._sizeSnapshot = {
                width: viewport.width,
                height: viewport.height,
            }
        }

        // ---- 快照直通属性 ----
        for (const prop of this.descriptor.directProps) {
            this._snapshotValues[prop] = (target as any)[prop]
        }

        // ---- 处理同属性冲突 + 构建关键帧段 ----
        this._resolveConflictsAndBuildSegments()

        // ---- 注册到 View 的动画列表 ----
        target.addAnimation(this.descriptor)

        // ---- fillMode backwards/both：立即应用第一帧状态 ----
        const fm = this.descriptor.fillMode
        if (fm === 'backwards' || fm === 'both') {
            this._applyAtProgress(0)
        }
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
        if (!this._target) return

        // 清空覆盖层，View 自动恢复真实 viewport
        if (this.descriptor.sizeProps.length > 0) {
            this._target.clearAnimatedViewport()
        }

        this.descriptor.computedValues = {}
        this._target.removeAnimation(this.descriptor)
        this.descriptor.onCancel?.()
    }

    /**
     * 处理 descriptor.state === 'finished'（手动 finish）的跳终态工作
     * 由 AnimationManager 在检测到状态变化时调用
     */
    handleFinish(): void {
        if (!this._target) return
        const finalProgress = this._getFinalDirectedProgress()
        this._applyAtProgress(finalProgress)
        this._doFinish()
    }

    // ── 内部：完成处理 ───────────────────────────────────────────────────────

    private _doFinish(): void {
        const desc = this.descriptor
        desc.onUpdate?.(1)
        this._commit()
        desc.state = 'finished'
        this._target?.removeAnimation(desc)
        desc.onFinish?.()
        desc._finishResolve?.()
    }

    // ── 内部：冲突解决 + 关键帧段构建 ───────────────────────────────────────

    private _resolveConflictsAndBuildSegments(): void {
        if (!this._target) return
        this._segments.clear()

        for (const prop of this.descriptor.properties) {
            // 检查冲突（后到的动画打断先到的）
            const existingDesc = this._findConflictingDescriptor(prop)
            let overrideFromValue: AnimatableValue | undefined

            if (existingDesc && existingDesc.computedValues[prop] !== undefined) {
                overrideFromValue = existingDesc.computedValues[prop]
                existingDesc._removeProperty(prop)
            }

            // 确定起始值
            const fromValue = overrideFromValue ?? this._getSnapshotValue(prop)

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

            // 如果第一帧缺值，补充快照值
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

    private _getSnapshotValue(prop: string): AnimatableValue | undefined {
        const category = animationAdapterRegistry.getCategory(prop)
        if (category === 'spatial') {
            return this._spatialSnapshot[prop as keyof typeof this._spatialSnapshot]
        } else if (category === 'size') {
            if (prop === 'width') return this._sizeSnapshot.width
            if (prop === 'height') return this._sizeSnapshot.height
            if (prop === 'scaleX' || prop === 'scaleY') return 1
        }
        return this._snapshotValues[prop]
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

    // ── 内部：属性应用 ───────────────────────────────────────────────────────

    private _applyAtProgress(progress: number): void {
        if (!this._target) return
        const desc = this.descriptor

        // ---- 空间属性：分量插值 → 合成矩阵 ----
        if (desc.spatialProps.length > 0) {
            const currentX        = this._interpolateSpatialProp('x', progress)
            const currentY        = this._interpolateSpatialProp('y', progress)
            const currentRotation = this._interpolateSpatialProp('rotation', progress)

            if (desc.referenceFrame) {
                // 绝对模式：在参考系坐标空间中构造目标矩阵，再反算本地 matrix
                const targetInRef = Matrix4.identity()
                    .translate(currentX, currentY, 0)
                    .rotateZ(currentRotation)

                const parent = this._target.parent
                let parentToRef = Matrix4.identity()
                if (parent && typeof parent === 'object' && 'getWorldMatrix' in parent) {
                    parentToRef = (parent as any).getWorldMatrix(desc.referenceFrame)
                }
                desc.computedValues['matrix'] = parentToRef.inverse().multiplyMatrix(targetInRef)
            } else {
                // 相对模式：构造增量矩阵，左乘到快照 matrix 上
                const deltaMatrix = Matrix4.identity()
                    .translate(currentX, currentY, 0)
                    .rotateZ(currentRotation)
                desc.computedValues['matrix'] = deltaMatrix.multiplyMatrix(this._matrixSnapshot)
            }
        }

        // ---- 尺寸属性：插值 → 写入覆盖层 ----
        if (desc.sizeProps.length > 0) {
            const currentWidth  = this._interpolateSizeProp('width', progress)
            const currentHeight = this._interpolateSizeProp('height', progress)
            this._target.animationResize(currentWidth, currentHeight)
        }

        // ---- 直通属性：线性插值 → computedValues ----
        for (const prop of desc.directProps) {
            const segments = this._segments.get(prop)
            if (segments) {
                desc.computedValues[prop] = interpolateKeyframes(segments, progress)
            }
        }
    }

    private _interpolateSpatialProp(prop: 'x' | 'y' | 'rotation', progress: number): number {
        const segments = this._segments.get(prop)
        if (!segments) return this._spatialSnapshot[prop]
        if (prop === 'rotation') return this._interpolateRotationSegments(segments, progress)
        return interpolateKeyframes(segments, progress) as number
    }

    private _interpolateRotationSegments(segments: ResolvedKeyframeSegment[], progress: number): number {
        for (const seg of segments) {
            if (progress >= seg.startOffset && progress <= seg.endOffset) {
                const segDuration = seg.endOffset - seg.startOffset
                const segProgress = segDuration > 0 ? (progress - seg.startOffset) / segDuration : 1
                const easedSeg = seg.easing ? seg.easing(segProgress) : segProgress
                return lerpAngle(seg.startValue as number, seg.endValue as number, easedSeg)
            }
        }
        if (segments.length > 0) {
            return progress <= segments[0].startOffset
                ? segments[0].startValue as number
                : segments[segments.length - 1].endValue as number
        }
        return 0
    }

    private _interpolateSizeProp(prop: 'width' | 'height', progress: number): number {
        const segments = this._segments.get(prop)
        if (segments) return interpolateKeyframes(segments, progress) as number

        if (prop === 'width') {
            const scaleSegs = this._segments.get('scaleX')
            if (scaleSegs) return this._sizeSnapshot.width * (interpolateKeyframes(scaleSegs, progress) as number)
            return this._sizeSnapshot.width
        }
        if (prop === 'height') {
            const scaleSegs = this._segments.get('scaleY')
            if (scaleSegs) return this._sizeSnapshot.height * (interpolateKeyframes(scaleSegs, progress) as number)
            return this._sizeSnapshot.height
        }
        return 0
    }

    // ── 内部：提交终态 ───────────────────────────────────────────────────────

    private _commit(): void {
        if (!this._target) return
        const desc = this.descriptor
        const shouldPersist = desc.fillMode === 'forwards' || desc.fillMode === 'both'

        if (shouldPersist) {
            if (desc.spatialProps.length > 0 && desc.computedValues['matrix']) {
                this._target.matrix = desc.computedValues['matrix'] as Matrix4
            }
            for (const prop of desc.directProps) {
                if (desc.computedValues[prop] !== undefined) {
                    ;(this._target as any)[prop] = desc.computedValues[prop]
                }
            }
            // 将覆盖视口提交为真实 viewport
            if (desc.sizeProps.length > 0) {
                this._target.commitAnimatedViewport()
            }
        } else {
            if (desc.spatialProps.length > 0) {
                this._target.matrix = this._matrixSnapshot.copy()
            }
            // 清空覆盖层，View 恢复真实 viewport
            if (desc.sizeProps.length > 0) {
                this._target.clearAnimatedViewport()
            }
        }

        desc.computedValues = {}
    }

    // ── 内部：冲突检测 ───────────────────────────────────────────────────────

    private _findConflictingDescriptor(prop: string): AnimationDescriptor | null {
        if (!this._target) return null
        const animations = this._target.getAnimations()
        for (const anim of animations) {
            if (anim !== this.descriptor && anim.isActive && anim.properties.includes(prop)) {
                return anim as AnimationDescriptor
            }
        }
        return null
    }
}
