import type { IAnimation } from '@/core/interfaces'

let _instance: AnimationManager | null = null

/**
 * AnimationManager —— 全局动画管理器（单例）
 *
 * 职责：
 * 1. 维护所有活跃动画的集合
 * 2. 每帧驱动所有动画的 tick
 * 3. 提供查询/批量操作接口
 *
 * 由 App 持有，在 _renderFrame 中 render() 之前调用 tick()
 */
export default class AnimationManager {
    /**
     * 获取全局单例
     */
    static getInstance(): AnimationManager {
        if (!_instance) {
            _instance = new AnimationManager()
        }
        return _instance
    }

    private _animations: Set<IAnimation> = new Set()

    /**
     * 注册动画
     */
    add(animation: IAnimation): void {
        this._animations.add(animation)
    }

    /**
     * 移除动画
     */
    remove(animation: IAnimation): void {
        this._animations.delete(animation)
    }

    /**
     * 每帧调用，驱动所有活跃动画
     * @param timestamp requestAnimationFrame 传入的时间戳
     */
    tick(timestamp: number): void {
        // 快照当前动画列表，避免遍历时增删 Set 导致的不确定行为
        // （回调中可能创建新动画、动画完成时会从 Set 中移除自身）
        const snapshot = [...this._animations]
        for (const anim of snapshot) {
            const alive = anim.tick(timestamp)
            if (!alive) {
                this._animations.delete(anim)
            }
        }
    }

    /**
     * 当前活跃动画数量
     */
    get count(): number {
        return this._animations.size
    }
}
