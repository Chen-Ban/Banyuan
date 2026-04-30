import type Animation from './Animation'
import type View from '@/core/views/View/View'

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

    private _animations: Set<Animation> = new Set()

    /**
     * 注册动画
     */
    add(animation: Animation): void {
        this._animations.add(animation)
    }

    /**
     * 移除动画
     */
    remove(animation: Animation): void {
        this._animations.delete(animation)
    }

    /**
     * 每帧调用，驱动所有活跃动画
     * @param timestamp requestAnimationFrame 传入的时间戳
     */
    tick(timestamp: number): void {
        for (const anim of this._animations) {
            const alive = anim.tick(timestamp)
            if (!alive) {
                this._animations.delete(anim)
            }
        }
    }

    /**
     * 查询某 View 上是否有活跃动画在控制指定属性
     */
    getActiveAnimation(view: View, property: string): Animation | undefined {
        for (const anim of this._animations) {
            if (anim.target === view && anim.isActive && anim.properties.includes(property)) {
                return anim
            }
        }
        return undefined
    }

    /**
     * 取消某 View 上的所有动画
     */
    cancelAllForView(view: View): void {
        for (const anim of this._animations) {
            if (anim.target === view) {
                anim.cancel()
            }
        }
    }

    /**
     * 立即完成某 View 上的所有动画
     */
    finishAllForView(view: View): void {
        for (const anim of this._animations) {
            if (anim.target === view) {
                anim.finish()
            }
        }
    }

    /**
     * 取消所有动画
     */
    cancelAll(): void {
        for (const anim of this._animations) {
            anim.cancel()
        }
    }

    /**
     * 当前是否有任何活跃动画
     * 可用于优化：无动画时 tick 是空操作
     */
    get hasActiveAnimations(): boolean {
        return this._animations.size > 0
    }

    /**
     * 当前活跃动画数量
     */
    get count(): number {
        return this._animations.size
    }
}
