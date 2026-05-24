import Bounds from '@/graph/base/Bounds'
import { Point3, Vector3 } from '@/foundation/math'
import { AnimationDescriptor, AnimationManager } from '@/engine/animation'
import type {
  AnimationOptions,
  KeyframeDefinition,
  AnimatableValue,
  IAnimationDescriptor,
  IAnimatable,
} from '@/types'
import type View from '@/view/View/View'

/**
 * AnimationAddon —— 动画能力插件（纯视觉，不参与交互检测）
 *
 * 为任意 View 提供关键帧动画驱动能力，对标 Web Animation API。
 * 与布局策略和交互检测完全正交，仅影响渲染时的视觉表现。
 *
 * 设计要点：
 * - 纯视觉插件，不参与 interact() 命中检测（与 BoxDecorationAddon 同级）
 * - 可选挂载：不需要动画的场景无需挂载，View 零开销
 * - 系统级一致性：若父 View 挂载了动画插件，其子树也必须挂载，
 *   否则递归操作时将抛出运行时错误（配置错误应尽早暴露）
 * - AnimationExecutor 通过 IAnimatable 接口与本 addon 交互，
 *   View 不再需要实现任何动画内部方法
 * - 动画运行期间通过 animatedViewport 覆盖层影响渲染尺寸，
 *   不修改真实 viewport，动画结束后根据 fillMode 决定是否提交
 */
export default class AnimationAddon implements IAnimatable {
  /** 宿主 View */
  private _view: View

  /** 活跃动画列表 */
  private _animations: IAnimationDescriptor[] = []

  /** 动画覆盖视口（动画运行期间写入，渲染时优先读取） */
  public animatedViewport: Bounds | null = null

  constructor(view: View) {
    this._view = view
  }

  // ==================== 公共 API ====================

  /**
   * 创建并播放动画
   * @example
   * view.animation.animate({ to: { x: 200, y: 300 } }, { duration: 500, easing: Easings.easeOutCubic })
   */
  animate(
    definition: KeyframeDefinition,
    options: AnimationOptions,
  ): AnimationDescriptor {
    const descriptor = new AnimationDescriptor(definition, options)
    descriptor.play()
    AnimationManager.getInstance().add(descriptor, this)
    return descriptor
  }

  /**
   * 获取渲染时应使用的属性值（动画计算值优先）
   * 从后向前遍历动画列表，后注册的动画优先级更高
   */
  getAnimatedValue(prop: string): AnimatableValue | undefined {
    for (let i = this._animations.length - 1; i >= 0; i--) {
      const anim = this._animations[i]
      if (anim.isActive) {
        const val = anim.computedValues[prop]
        if (val !== undefined) return val
      }
    }
    return undefined
  }

  /**
   * 取消该 View 上的所有动画
   */
  cancelAll(): void {
    const anims = [...this._animations]
    for (const anim of anims) {
      anim.cancel()
    }
  }

  /**
   * 立即完成该 View 上的所有动画
   */
  finishAll(): void {
    const anims = [...this._animations]
    for (const anim of anims) {
      anim.finish()
    }
  }

  // ==================== IAnimatable 实现（由 AnimationExecutor 调用） ====================

  /** 将动画注册到活跃列表 */
  addAnimation(anim: IAnimationDescriptor): void {
    if (!this._animations.includes(anim)) {
      this._animations.push(anim)
    }
  }

  /** 将动画从活跃列表移除 */
  removeAnimation(anim: IAnimationDescriptor): void {
    const index = this._animations.indexOf(anim)
    if (index !== -1) {
      this._animations.splice(index, 1)
    }
  }

  /** 获取当前所有活跃动画（用于冲突检测） */
  getAnimations(): IAnimationDescriptor[] {
    return this._animations
  }

  /**
   * 动画专用 resize 方法
   *
   * 只更新覆盖视口，不修改真实 viewport。
   * 渲染时通过 renderViewport getter 优先读取覆盖层。
   * 子 View 同样只更新覆盖层，保持等比缩放关系。
   */
  animationResize(targetWidth: number, targetHeight: number): void {
    const baseViewport = this._view.viewport
    if (!baseViewport) return
    if (targetWidth === 0 || targetHeight === 0) return

    // 写入覆盖层（复用已有对象避免每帧 GC，首次创建）
    if (!this.animatedViewport) {
      this.animatedViewport = baseViewport.copy()
    }
    this.animatedViewport.setSize(targetWidth, targetHeight)

    // 递归子 View（基于真实 viewport 计算缩放比，保持相对比例）
    const scaleX = targetWidth / baseViewport.width
    const scaleY = targetHeight / baseViewport.height
    this._view.children.forEach((child) => {
      const childVp = child.viewport
      if (!childVp) return
      const childAddon = child.animation as AnimationAddon
      childAddon.animationResize(childVp.width * scaleX, childVp.height * scaleY)
    })
  }

  /**
   * 将动画覆盖视口提交为真实 viewport（fillMode: forwards 时调用）
   */
  commitAnimatedViewport(): void {
    if (!this.animatedViewport) return
    const targetWidth = this.animatedViewport.width
    const targetHeight = this.animatedViewport.height
    this.animatedViewport = null

    const viewport = this._view.viewport
    if (!viewport) return
    const oldWidth = viewport.width
    const oldHeight = viewport.height
    if (oldWidth === 0 || oldHeight === 0) return
    if (targetWidth === 0 || targetHeight === 0) return

    const deltaX = targetWidth - oldWidth
    const deltaY = targetHeight - oldHeight

    viewport.setSize(targetWidth, targetHeight)
    this._view.boundingBox?.updateSize()

    if (this._view.content) {
      const fixedPoint = new Point3(viewport.x, viewport.y, 0)
      const dynamicPoint = new Point3(
        viewport.x + oldWidth,
        viewport.y + oldHeight,
        0,
      )
      const resizeVector = new Vector3(deltaX, deltaY, 0)
      this._view.content.resize(fixedPoint, dynamicPoint, resizeVector)
      // 标记布局脏，延迟到渲染时重算
      this._view.markLayoutDirty()
    }

    // 递归提交子 View
    const scaleX = targetWidth / oldWidth
    const scaleY = targetHeight / oldHeight
    this._view.children.forEach((child) => {
      const childVp = child.viewport
      if (!childVp) return
      const childAddon = child.animation as AnimationAddon
      if (!childAddon.animatedViewport) {
        childAddon.animatedViewport = childVp.copy()
      }
      childAddon.animatedViewport.setSize(
        childVp.width * scaleX,
        childVp.height * scaleY,
      )
      childAddon.commitAnimatedViewport()
    })
  }

  /**
   * 清空动画覆盖视口（fillMode: none/backwards 时调用）
   */
  clearAnimatedViewport(): void {
    this.animatedViewport = null
    this._view.children.forEach((child) => {
      const childAddon = child.animation as AnimationAddon
      childAddon.clearAnimatedViewport()
    })
  }

  // ==================== IAnimatable 属性代理 ====================

  get matrix() {
    return this._view.matrix
  }

  set matrix(value) {
    this._view.matrix = value
  }

  get viewport() {
    return this._view.viewport
  }

  get parent() {
    return this._view.parent
  }

  getWorldMatrix(parent?: any) {
    return this._view.getWorldMatrix(parent)
  }
}
