import AnimationExecutor from '../executor/AnimationExecutor'
import type AnimationDescriptor from '../descriptor/AnimationDescriptor'
import type { IAnimatable } from '@/core/interfaces'

let _instance: AnimationManager | null = null

/**
 * AnimationManager —— 全局动画管理器（单例）
 *
 * 职责：
 * 1. 接收 (descriptor, target) 对，为每个 descriptor 创建 AnimationExecutor
 * 2. 每帧驱动所有活跃 executor 的 tick
 * 3. 感知 descriptor 状态变化（cancel / finish），触发对应的 executor 处理
 * 4. 提供查询/批量操作接口
 *
 * 由 App 持有，在 _renderFrame 中 render() 之前调用 tick()
 */
export default class AnimationManager {
    static getInstance(): AnimationManager {
        if (!_instance) {
            _instance = new AnimationManager()
        }
        return _instance
    }

    /** descriptor.id → executor */
    private _executors: Map<string, AnimationExecutor> = new Map()

    // ── 注册 / 移除 ──────────────────────────────────────────────────────────

    /**
     * 注册一个动画描述对象并立即开始执行
     *
     * @param descriptor 动画描述对象（state 应为 'running'）
     * @param target     动画目标 View
     */
    add(descriptor: AnimationDescriptor, target: IAnimatable): void {
        if (this._executors.has(descriptor.id)) return

        const executor = new AnimationExecutor(descriptor)
        this._executors.set(descriptor.id, executor)
        executor.bindAndPlay(target)
    }

    /**
     * 从管理器中移除动画（通常由 Executor 在完成/取消时自动触发，外部也可调用）
     */
    remove(descriptor: AnimationDescriptor): void {
        this._executors.delete(descriptor.id)
    }

    // ── 帧驱动 ───────────────────────────────────────────────────────────────

    /**
     * 每帧调用，驱动所有活跃动画
     * @param timestamp requestAnimationFrame 传入的时间戳
     */
    tick(timestamp: number): void {
        // 快照当前 executor 列表，避免遍历时增删 Map 导致的不确定行为
        const snapshot = [...this._executors.values()]

        for (const executor of snapshot) {
            const desc = executor.descriptor

            // 感知外部状态变化
            if (desc.state === 'cancelled') {
                executor.handleCancel()
                this._executors.delete(desc.id)
                continue
            }

            if (desc.state === 'finished') {
                // 手动 finish()：跳到终态再清理
                executor.handleFinish()
                this._executors.delete(desc.id)
                continue
            }

            // 正常帧驱动
            const alive = executor.tick(timestamp)
            if (!alive) {
                this._executors.delete(desc.id)
            }
        }
    }

    // ── 查询 ─────────────────────────────────────────────────────────────────

    /** 当前活跃动画数量 */
    get count(): number {
        return this._executors.size
    }
}
