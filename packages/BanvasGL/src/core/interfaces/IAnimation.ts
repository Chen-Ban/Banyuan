/**
 * IAnimation —— Animation 的公共接口
 *
 * 供 AnimationManager 等需要引用 Animation 的模块使用，
 * 避免直接导入实现类导致循环依赖。
 */

import type { AnimatableValue, AnimationState } from '@/core/animation/types'

/**
 * 动画实例的公共契约
 */
export interface IAnimation {
    /** 唯一标识 */
    readonly id: string
    /** 动画目标视图（可能为 null，表示未绑定） */
    target: any | null
    /** 动画控制的属性列表 */
    properties: string[]
    /** 当前计算值（渲染时读取） */
    computedValues: Record<string, AnimatableValue>

    // 状态
    /** 动画当前状态 */
    readonly state: AnimationState
    /** 动画是否活跃（running 或 paused） */
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

    /**
     * 由 AnimationManager 每帧调用
     * @returns false 表示动画已结束，应从管理器中移除
     */
    tick(timestamp: number): boolean

    /** 播放动画 */
    play(): IAnimation
    /** 暂停动画 */
    pause(): IAnimation
    /** 恢复动画 */
    resume(): IAnimation
    /** 取消动画 */
    cancel(): IAnimation
    /** 立即完成动画（跳到终态） */
    finish(): IAnimation
}

/**
 * AnimationManager 的公共接口
 * 供 Animation 等模块引用管理器时避免循环依赖
 */
export interface IAnimationManager {
    /** 注册动画 */
    add(animation: IAnimation): void
    /** 移除动画 */
    remove(animation: IAnimation): void
    /** 每帧驱动所有活跃动画 */
    tick(timestamp: number): void
    /** 当前活跃动画数量 */
    readonly count: number
}
