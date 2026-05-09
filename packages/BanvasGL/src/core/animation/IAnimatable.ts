/**
 * IAnimatable —— 动画系统与 View 之间的内部契约
 *
 * 仅供 Animation.ts 使用，不进入 IView 公共接口。
 * View 实现此接口，但业务层无需感知这些方法的存在。
 *
 * @internal
 */

import type Animation from './Animation'
import type Matrix4 from '@/core/math/Matrix4'
import type Bounds from '@/core/graph/base/Bounds'

export interface IAnimatable {
    // ── 动画列表管理 ──
    /** 将动画注册到 View 的活跃列表 @internal */
    _addAnimation(anim: Animation): void
    /** 将动画从 View 的活跃列表移除 @internal */
    _removeAnimation(anim: Animation): void
    /** 获取 View 当前所有活跃动画（用于冲突检测） @internal */
    _getAnimations(): Animation[]
    /** 动画专用 resize，直接修改 viewport + content @internal */
    _animationResize(targetWidth: number, targetHeight: number): void

    // ── Animation 内部计算所需的 View 属性 ──
    matrix: Matrix4
    viewport: Bounds
    parent: unknown
    getWorldMatrix(parent?: any): Matrix4
}
