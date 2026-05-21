import { generateId } from '@/foundation/utils'
import { animationAdapterRegistry } from './adapters'
import type {
    AnimationOptions,
    AnimationState,
    KeyframeDefinition,
    FillMode,
    PlaybackDirection,
    EasingFunction,
} from '@/types'
import type { Keyframe } from './types'
import { Easings } from './easings'

/**
 * AnimationDescriptor —— 动画描述对象（纯数据，无执行逻辑）
 *
 * View 持有此对象，描述"要播放什么动画"以及当前播放状态。
 * 具体如何执行由 AnimationManager 侧的 AnimationExecutor 负责。
 *
 * 控制方法（play/pause/resume/cancel/finish）只修改状态字段，
 * AnimationManager 在下一帧感知状态变化并响应。
 */
export default class AnimationDescriptor {
    public readonly id: string

    // ── 用户输入（不可变） ──────────────────────────────────────────────────

    /** 原始关键帧定义 */
    public readonly definition: KeyframeDefinition

    /** 动画时长 (ms) */
    public readonly duration: number
    /** 延迟启动 (ms) */
    public readonly delay: number
    /** 填充模式 */
    public readonly fillMode: FillMode
    /** 播放方向 */
    public readonly direction: PlaybackDirection
    /** 迭代次数 */
    public readonly iterations: number
    /** 全局缓动函数 */
    public readonly easing: EasingFunction
    /** 参考系（坐标系计算用，仅对空间属性生效） */
    public readonly referenceFrame: any | undefined

    // ── 回调 ────────────────────────────────────────────────────────────────

    public onStart: (() => void) | null
    public onUpdate: ((progress: number) => void) | null
    public onFinish: (() => void) | null
    public onCancel: (() => void) | null
    public onIteration: ((currentIteration: number) => void) | null

    // ── 运行时状态（由 Executor 写入，外部只读） ────────────────────────────

    /** 当前播放状态 */
    public state: AnimationState = 'idle'

    /**
     * 动画开始时间戳（由 Executor 在首次 tick 时写入）
     * -1 表示尚未开始
     */
    public startTime: number = -1

    /**
     * 暂停时已累计的播放时长（ms）
     * resume 时用于修正 startTime
     */
    public pausedElapsed: number = 0

    /**
     * 最后一次 tick 的时间戳（用于 pause 时计算 pausedElapsed）
     */
    public lastTimestamp: number = -1

    // ── 属性分类（构造时计算，供 Executor 使用） ────────────────────────────

    /** 动画涉及的所有属性名 */
    public properties: string[]
    /** 空间属性（x/y/rotation → matrix） */
    public spatialProps: string[]
    /** 尺寸属性（width/height/scaleX/scaleY → _animatedViewport） */
    public sizeProps: string[]
    /** 直通属性（直接读写 View 同名属性） */
    public directProps: string[]

    // ── Promise 支持 ────────────────────────────────────────────────────────

    public readonly finished: Promise<void>
    /** @internal */
    public _finishResolve: (() => void) | null = null
    /** @internal */
    public _finishReject: ((reason?: any) => void) | null = null

    // ── 计算结果（由 Executor 每帧写入，渲染时读取） ────────────────────────

    /**
     * 当前帧的计算值（渲染时读取此对象，而非 View 的真实属性）
     * key: 属性名（'matrix' / 直通属性名）
     * value: 插值后的当前值
     */
    public computedValues: Record<string, import('@/types').AnimatableValue> = {}

    // ── 内部关键帧（由构造函数解析，供 Executor 构建分段） ──────────────────

    public readonly keyframes: Keyframe[]

    constructor(definition: KeyframeDefinition, options: AnimationOptions) {
        this.id = generateId()
        this.definition = definition

        this.duration = options.duration
        this.delay = options.delay ?? 0
        this.fillMode = options.fillMode ?? 'none'
        this.direction = options.direction ?? 'normal'
        this.iterations = options.iterations ?? 1
        this.easing = options.easing ?? Easings.linear
        this.referenceFrame = options.referenceFrame ?? undefined

        this.onStart = options.onStart ?? null
        this.onUpdate = options.onUpdate ?? null
        this.onFinish = options.onFinish ?? null
        this.onCancel = options.onCancel ?? null
        this.onIteration = options.onIteration ?? null

        // 解析关键帧
        this.keyframes = this._parseDefinition(definition)

        // 收集属性名
        const propSet = new Set<string>()
        for (const kf of this.keyframes) {
            for (const key of Object.keys(kf)) {
                if (key !== 'offset' && key !== 'easing') propSet.add(key)
            }
        }
        this.properties = Array.from(propSet)

        // 冲突检测（在描述对象创建时就报错，而不是等到 play）
        const conflict = animationAdapterRegistry.detectConflict(this.properties)
        if (conflict) throw new Error(conflict)

        // 属性分类
        const spatialProps: string[] = []
        const sizeProps: string[] = []
        const directProps: string[] = []
        for (const prop of this.properties) {
            const cat = animationAdapterRegistry.getCategory(prop)
            if (cat === 'spatial') spatialProps.push(prop)
            else if (cat === 'size') sizeProps.push(prop)
            else directProps.push(prop)
        }
        this.spatialProps = spatialProps
        this.sizeProps = sizeProps
        this.directProps = directProps

        // Promise
        this.finished = new Promise<void>((resolve, reject) => {
            this._finishResolve = resolve
            this._finishReject = reject
        })
        // 防止 cancel 时产生 unhandled rejection
        this.finished.catch(() => {})
    }

    // ── 状态访问 ────────────────────────────────────────────────────────────

    get isActive(): boolean {
        return this.state === 'running' || this.state === 'paused'
    }

    // ── 播放控制（只改状态字段，Executor 在下一帧响应） ─────────────────────

    play(): AnimationDescriptor {
        if (this.state === 'running') return this
        if (this.state === 'finished' || this.state === 'cancelled') return this
        this.state = 'running'
        return this
    }

    pause(): AnimationDescriptor {
        if (this.state !== 'running') return this
        if (this.startTime !== -1 && this.lastTimestamp !== -1) {
            this.pausedElapsed = this.lastTimestamp - this.startTime
        }
        this.state = 'paused'
        return this
    }

    resume(): AnimationDescriptor {
        if (this.state !== 'paused') return this
        this.state = 'running'
        // 重置 startTime，Executor 下一帧会根据 pausedElapsed 重新计算
        this.startTime = -1
        return this
    }

    cancel(): AnimationDescriptor {
        if (this.state === 'finished' || this.state === 'cancelled') return this
        this.state = 'cancelled'
        this._finishReject?.(new Error('Animation cancelled'))
        return this
    }

    finish(): AnimationDescriptor {
        if (this.state === 'finished' || this.state === 'cancelled') return this
        this.state = 'finished'
        return this
    }

    // ── 内部方法（供 Executor 调用） ─────────────────────────────────────────

    /**
     * 移除动画对某个属性的控制（被更高优先级动画打断时调用）
     * @internal
     */
    _removeProperty(prop: string): void {
        this.properties = this.properties.filter(p => p !== prop)
        delete this.computedValues[prop]
        this.spatialProps = this.spatialProps.filter(p => p !== prop)
        this.sizeProps = this.sizeProps.filter(p => p !== prop)
        this.directProps = this.directProps.filter(p => p !== prop)

        if (this.properties.length === 0) {
            this.cancel()
        }
    }

    // ── 内部：关键帧解析 ────────────────────────────────────────────────────

    private _parseDefinition(input: KeyframeDefinition): Keyframe[] {
        const keyframes: Keyframe[] = []

        for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue
            let offset: number
            if (key === 'to') {
                offset = 1
            } else if (/^\d+(\.\d+)?$/.test(key)) {
                offset = Math.max(0, Math.min(1, parseFloat(key) / 100))
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
}
