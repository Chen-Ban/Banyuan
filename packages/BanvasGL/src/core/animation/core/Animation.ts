import { generateId } from '@/core/utils'
import { interpolateKeyframes, type ResolvedKeyframeSegment } from '../keyframes/interpolators'
import { Easings } from '../keyframes/easings'
import AnimationManager from './AnimationManager'
import Matrix4 from '@/core/math/Matrix4'
import { animationAdapterRegistry } from '../adapters/adapters'
import { extractTranslation, extractRotationZ, lerpAngle } from '../adapters/trs'
import type {
    AnimationOptions,
    AnimationState,
    AnimatableValue,
    KeyframeProps,
    KeyframeDefinition,
    FillMode,
    PlaybackDirection,
    EasingFunction,
    IAnimatable,
} from '@/core/interfaces'
import type { Keyframe } from '../types'
import type View from '@/core/views/View/View'

/**
 * Animation 类
 *
 * 核心设计原则：
 * 1. 动画运行期间不修改 View 的基础属性（空间属性通过 computedValues['matrix'] 覆盖渲染）
 * 2. 尺寸属性每帧真正 resize（viewport + content），模拟 Ctrl+拖拽效果
 * 3. 动画结束时根据 fillMode 提交终态
 * 4. 同属性冲突时，后者打断前者，从当前计算值无缝衔接
 *
 * 属性映射层：
 * - 空间属性（x/y/rotation）→ 修改 matrix
 * - 尺寸属性（width/height/scaleX/scaleY）→ 通过 resize 修改 viewport + content
 * - 直通属性 → 直接读写 View 同名属性
 *
 * 参考系：
 * - 不传 referenceFrame：相对变换，to 中的值是增量
 * - 传祖先 View：绝对变换，to 中的值是在该祖先坐标系下的目标
 *
 * @example
 * // 相对偏移
 * view.animate({ to: { x: 100, y: 50 } }, { duration: 1000 })
 *
 * // 在父坐标系下绝对定位
 * view.animate({ to: { x: 200 } }, { duration: 1000, referenceFrame: parentView })
 *
 * // 尺寸动画
 * view.animate({ to: { width: 400, height: 300 } }, { duration: 600 })
 *
 * // 缩放动画（等价于按比例改尺寸）
 * view.animate({ to: { scaleX: 2 } }, { duration: 600 })
 */
export default class Animation {
    public readonly id: string
    public target: IAnimatable | null = null
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
    public readonly referenceFrame: View | undefined  // 仅用于坐标系计算，保留 View 类型

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

    // 快照——play() 时从 View 读取的原始值（用于 direct 属性）
    private _snapshotValues: KeyframeProps = {}

    // 属性分类缓存
    private _spatialProps: string[] = []
    private _sizeProps: string[] = []
    private _directProps: string[] = []

    // 空间属性快照（从 matrix 分解出的起始 TRS 值）
    private _spatialSnapshot: { x: number; y: number; rotation: number } = { x: 0, y: 0, rotation: 0 }
    // 空间属性的 matrix 快照（相对模式时作为基矩阵）
    private _matrixSnapshot: Matrix4 = Matrix4.identity()

    // 尺寸属性快照
    private _sizeSnapshot: { width: number; height: number } = { width: 0, height: 0 }

    // Promise 支持
    private _finishResolve: (() => void) | null = null
    private _finishReject: ((reason?: any) => void) | null = null
    public readonly finished: Promise<void>

    // ========== 构造函数重载 ==========

    /**
     * 不绑定 target 创建（后续通过 view.animate(anim) 挂载）
     */
    constructor(definition: KeyframeDefinition, options: AnimationOptions)

    /**
     * 绑定 target 创建（后续手动调用 play()）
     */
    constructor(target: IAnimatable, definition: KeyframeDefinition, options: AnimationOptions)

    constructor(...args: any[]) {
        this.id = generateId()

        // 解析参数：判断第一个参数是否是 View（有 _addAnimation 方法）
        let target: IAnimatable | null = null
        let definition: KeyframeDefinition
        let options: AnimationOptions

        if (args.length === 3 && args[0] && typeof args[0] === 'object' && '_addAnimation' in args[0]) {
            // (target, definition, options) 形式
            target = args[0] as IAnimatable
            definition = args[1] as KeyframeDefinition
            options = args[2]
        } else if (args.length === 2) {
            // (definition, options) 形式
            definition = args[0] as KeyframeDefinition
            options = args[1]
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
        this.referenceFrame = options.referenceFrame

        this.onStart = options.onStart ?? null
        this.onUpdate = options.onUpdate ?? null
        this.onFinish = options.onFinish ?? null
        this.onCancel = options.onCancel ?? null
        this.onIteration = options.onIteration ?? null

        // 解析 KeyframeDefinition 为内部关键帧数组
        this._keyframes = this._parseDefinition(definition)

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

        // 冲突检测
        const conflict = animationAdapterRegistry.detectConflict(this.properties)
        if (conflict) {
            throw new Error(conflict)
        }

        // 分类属性
        for (const prop of this.properties) {
            const category = animationAdapterRegistry.getCategory(prop)
            if (category === 'spatial') {
                this._spatialProps.push(prop)
            } else if (category === 'size') {
                this._sizeProps.push(prop)
            } else {
                this._directProps.push(prop)
            }
        }

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
    _bindTarget(view: IAnimatable): void {
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

        // ---- 快照空间属性 ----
        if (this._spatialProps.length > 0) {
            if (this.referenceFrame) {
                // 绝对模式：从 View 到 referenceFrame 之间的矩阵提取当前位置
                const relativeMatrix = target.getWorldMatrix(this.referenceFrame)
                this._spatialSnapshot = {
                    x: extractTranslation(relativeMatrix).x,
                    y: extractTranslation(relativeMatrix).y,
                    rotation: extractRotationZ(relativeMatrix),
                }
            } else {
                // 相对模式：起始值为 0（增量语义）
                this._spatialSnapshot = { x: 0, y: 0, rotation: 0 }
            }
            // 记录当前 matrix 快照（相对模式时用作基矩阵）
            this._matrixSnapshot = target.matrix.copy()
        }

        // ---- 快照尺寸属性 ----
        if (this._sizeProps.length > 0) {
            const viewport = target.viewport
            this._sizeSnapshot = {
                width: viewport.width,
                height: viewport.height,
            }
        }

        // ---- 快照直通属性 ----
        for (const prop of this._directProps) {
            this._snapshotValues[prop] = (target as any)[prop]
        }

        // ---- 处理同属性冲突 + 构建关键帧段 ----
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

        // 如果尺寸动画已经改了 viewport/content，需要恢复到快照状态
        if (this._sizeProps.length > 0 && this.target) {
            this.target._animationResize(this._sizeSnapshot.width, this._sizeSnapshot.height)
        }

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
        this.onUpdate?.(1)
        this._commit()
        this._state = 'finished'
        this.target?._removeAnimation(this)
        AnimationManager.getInstance().remove(this)
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
     * 解析 KeyframeDefinition 为内部 Keyframe[]
     *
     * 规则：
     * - 'to' 键 → offset: 1（终态，必填）
     * - 数字键（如 '25', '50', '75'）→ offset: 数字/100
     * - 自动补 offset:0 的空帧（play 时从 View 快照填充起始值）
     * - 结果按 offset 升序排列
     */
    private _parseDefinition(input: KeyframeDefinition): Keyframe[] {
        const keyframes: Keyframe[] = []

        for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue

            let offset: number
            if (key === 'to') {
                offset = 1
            } else if (/^\d+(\.\d+)?$/.test(key)) {
                offset = parseFloat(key) / 100
                offset = Math.max(0, Math.min(1, offset))
            } else {
                continue
            }

            keyframes.push({ offset, ...value })
        }

        keyframes.sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0))

        if (keyframes.length === 0 || (keyframes[0].offset ?? 0) !== 0) {
            keyframes.unshift({ offset: 0 })
        }

        return keyframes
    }

    /**
     * 处理同属性冲突并构建关键帧分段
     *
     * 对于 spatial 和 size 类属性，快照值从 adapter 获取；
     * 对于 direct 类属性，快照值从 _snapshotValues 获取。
     */
    private _resolveConflictsAndBuildSegments(): void {
        if (!this.target) return
        this._segments.clear()

        for (const prop of this.properties) {
            // 检查冲突（后到的动画打断先到的）
            const existingAnim = this._findConflictingAnimation(prop)
            let overrideFromValue: AnimatableValue | undefined

            if (existingAnim && existingAnim.computedValues[prop] !== undefined) {
                overrideFromValue = existingAnim.computedValues[prop]
                existingAnim._removeProperty(prop)
            }

            // 确定起始值
            const fromValue = overrideFromValue ?? this._getSnapshotValue(prop)

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

    /**
     * 获取属性的快照值（用于 segment 构建时补全起始帧）
     */
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
     * 根据进度计算所有属性的值并应用
     *
     * 处理三类属性：
     * - spatial: 各分量插值 → 合成矩阵 → 写入 computedValues['matrix']
     * - size: 插值当前宽高 → 调用 _animationResize 真正修改 viewport + content
     * - direct: 线性插值 → 写入 computedValues[prop]
     */
    private _applyAtProgress(progress: number): void {
        if (!this.target) return

        // ---- 空间属性：分量插值 → 合成矩阵 ----
        if (this._spatialProps.length > 0) {
            const currentX = this._interpolateSpatialProp('x', progress)
            const currentY = this._interpolateSpatialProp('y', progress)
            const currentRotation = this._interpolateSpatialProp('rotation', progress)

            if (this.referenceFrame) {
                // 绝对模式：在参考系坐标空间中构造目标矩阵，再反算本地 matrix
                const targetInRef = Matrix4.identity()
                    .translate(currentX, currentY, 0)
                    .rotateZ(currentRotation)

                const parent = this.target.parent
                let parentToRef = Matrix4.identity()
                if (parent && typeof parent === 'object' && 'getWorldMatrix' in parent) {
                    parentToRef = (parent as View).getWorldMatrix(this.referenceFrame)
                }
                const animatedMatrix = parentToRef.inverse().multiplyMatrix(targetInRef)
                this.computedValues['matrix'] = animatedMatrix
            } else {
                // 相对模式：构造增量矩阵，左乘到快照 matrix 上
                const deltaMatrix = Matrix4.identity()
                    .translate(currentX, currentY, 0)
                    .rotateZ(currentRotation)
                const animatedMatrix = deltaMatrix.multiplyMatrix(this._matrixSnapshot)
                this.computedValues['matrix'] = animatedMatrix
            }
        }

        // ---- 尺寸属性：插值 → 每帧 resize ----
        if (this._sizeProps.length > 0) {
            const currentWidth = this._interpolateSizeProp('width', progress)
            const currentHeight = this._interpolateSizeProp('height', progress)
            this.target._animationResize(currentWidth, currentHeight)
        }

        // ---- 直通属性：线性插值 → computedValues ----
        for (const prop of this._directProps) {
            const segments = this._segments.get(prop)
            if (segments) {
                this.computedValues[prop] = interpolateKeyframes(segments, progress)
            }
        }
    }

    /**
     * 插值空间属性分量
     */
    private _interpolateSpatialProp(prop: 'x' | 'y' | 'rotation', progress: number): number {
        const segments = this._segments.get(prop)
        if (!segments) {
            return this._spatialSnapshot[prop]
        }
        if (prop === 'rotation') {
            return this._interpolateRotationSegments(segments, progress)
        }
        return interpolateKeyframes(segments, progress) as number
    }

    /**
     * 对 rotation 分段进行短弧插值
     */
    private _interpolateRotationSegments(segments: ResolvedKeyframeSegment[], progress: number): number {
        for (const seg of segments) {
            if (progress >= seg.startOffset && progress <= seg.endOffset) {
                const segDuration = seg.endOffset - seg.startOffset
                const segProgress = segDuration > 0
                    ? (progress - seg.startOffset) / segDuration
                    : 1
                const easedSeg = seg.easing ? seg.easing(segProgress) : segProgress
                return lerpAngle(seg.startValue as number, seg.endValue as number, easedSeg)
            }
        }
        if (segments.length > 0) {
            const lastSeg = segments[segments.length - 1]
            return progress <= segments[0].startOffset
                ? segments[0].startValue as number
                : lastSeg.endValue as number
        }
        return 0
    }

    /**
     * 插值尺寸属性
     */
    private _interpolateSizeProp(prop: 'width' | 'height', progress: number): number {
        const segments = this._segments.get(prop)
        if (segments) {
            return interpolateKeyframes(segments, progress) as number
        }
        if (prop === 'width') {
            const scaleSegs = this._segments.get('scaleX')
            if (scaleSegs) {
                const scale = interpolateKeyframes(scaleSegs, progress) as number
                return this._sizeSnapshot.width * scale
            }
            return this._sizeSnapshot.width
        }
        if (prop === 'height') {
            const scaleSegs = this._segments.get('scaleY')
            if (scaleSegs) {
                const scale = interpolateKeyframes(scaleSegs, progress) as number
                return this._sizeSnapshot.height * scale
            }
            return this._sizeSnapshot.height
        }
        return 0
    }

    /**
     * 提交终态：动画结束时将最终值写入 View 的真实属性
     */
    private _commit(): void {
        if (!this.target) return

        const shouldPersist = this.fillMode === 'forwards' || this.fillMode === 'both'

        if (shouldPersist) {
            if (this._spatialProps.length > 0 && this.computedValues['matrix']) {
                this.target.matrix = this.computedValues['matrix'] as Matrix4
            }

            for (const prop of this._directProps) {
                if (this.computedValues[prop] !== undefined) {
                    ;(this.target as any)[prop] = this.computedValues[prop]
                }
            }
        } else {
            if (this._spatialProps.length > 0) {
                this.target.matrix = this._matrixSnapshot.copy()
            }

            if (this._sizeProps.length > 0) {
                this.target._animationResize(this._sizeSnapshot.width, this._sizeSnapshot.height)
            }
        }

        this.computedValues = {}
    }

    /**
     * 查找同一 View 上控制相同属性的正在运行的动画
     */
    private _findConflictingAnimation(prop: string): Animation | null {
        if (!this.target) return null
        const animations = this.target._getAnimations()
        for (const anim of animations) {
            if (anim !== (this as any) && anim.isActive && anim.properties.includes(prop)) {
                return anim as Animation
            }
        }
        return null
    }

    /**
     * 移除动画对某个属性的控制（被更高优先级动画打断时调用）
     * @internal
     */
    _removeProperty(prop: string): void {
        this.properties = this.properties.filter(p => p !== prop)
        this._segments.delete(prop)
        delete this.computedValues[prop]

        this._spatialProps = this._spatialProps.filter(p => p !== prop)
        this._sizeProps = this._sizeProps.filter(p => p !== prop)
        this._directProps = this._directProps.filter(p => p !== prop)

        if (this.properties.length === 0) {
            this.cancel()
        }
    }
}
