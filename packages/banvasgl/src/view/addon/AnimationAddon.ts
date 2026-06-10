import Bounds from '@/graph/base/Bounds'
import { Point3, Vector3 } from '@/foundation/math'
import Matrix4 from '@/foundation/math/Matrix4'
import { AnimationDescriptor, AnimationManager } from '@/foundation/animation'
import type { PropertyClassification } from '@/foundation/animation/AnimationDescriptor'
import type { InterpolationHints } from '@/foundation/animation/AnimationExecutor'
import { AddonType, AddonCapability } from '@/foundation/constants'
import { isContainerView } from '@/foundation/guards'
import { adapterRegistry } from '@/view/property'
import { MathUtils } from '@/foundation/math'
import type {
  AnimationOptions,
  KeyframeDefinition,
  KeyframeProps,
  AnimatableValue,
  IAnimationDescriptor,
  IAnimationAddon,
  IView,
  ExtraData,
} from '@/types'
import type View from '@/view/View/View'

/**
 * AnimationAddon —— 动画能力插件
 *
 * 为任意 View 提供关键帧动画驱动能力，对标 Web Animation API。
 * 与布局策略和交互检测完全正交，仅影响渲染时的视觉表现。
 *
 * 重构后的职责划分：
 * - 创建时（animate）：冲突检测 → 属性分类 → 采集 initialValues → 挂载 descriptor → 注册到 Manager
 * - 运行时：不介入计算（由 Executor 纯数据驱动，结果写入 descriptor.computedValues）
 * - 渲染时：提供 getAnimatedValue() 供 View 和其他插件按需读取
 * - 结束时：通过 onFinish/onCancel 回调处理提交/清理（属性适配在消费侧）
 *
 * 设计要点：
 * - 纯视觉插件，不参与 interact() 命中检测
 * - 可选挂载：不需要动画的场景无需挂载，View 零开销
 * - descriptor 在 animate() 时立即挂载到 _animations 列表
 * - Executor 是纯计算器，不持有任何 View/Addon 引用
 * - 冲突检测和属性分类在创建动画前完成（view 层职责）
 */
export default class AnimationAddon implements IAnimationAddon {
  // ==================== IAddonBase 契约 ====================

  readonly type = AddonType.ANIMATION

  /** 动画插件不参与 render/interact 管线，由 AnimationManager tick 驱动 */
  capabilities: AddonCapability[] = []

  readonly priority = 0

  /** 动画插件不参与渲染管线（由 AnimationManager 每帧 tick 驱动） */
  render(_ctx: CanvasRenderingContext2D): void {
    // noop
  }

  /** 动画插件不参与交互管线 */
  interact(_p: Point3, _bufferCtx?: CanvasRenderingContext2D): ExtraData | null {
    return null
  }

  /** 复制插件（动画状态不可复制，返回空白实例） */
  copy(): AnimationAddon {
    return new AnimationAddon(this._view)
  }

  // ==================== 内部状态 ====================

  /** 宿主 View */
  private _view: View

  /** 活跃动画列表（按注册顺序，后注册的优先级更高） */
  private _animations: IAnimationDescriptor[] = []

  /** 动画覆盖视口（渲染时优先读取，由消费侧管理） */
  public animatedViewport: Bounds | null = null

  constructor(view: View) {
    this._view = view
  }

  // ==================== 公共 API ====================

  /**
   * 创建并播放动画
   *
   * @param definition  关键帧定义（{ to: { ... }, '50': { ... } }）
   * @param options     动画配置（duration, easing, fillMode 等）
   * @returns AnimationDescriptor 用于控制动画（pause/resume/cancel/finish）
   *
   * @example
   * // View 属性动画（spatial/size 属性由 View 消费侧适配）
   * view.animation.animate({ to: { x: 200, y: 300 } }, { duration: 500 })
   *
   * // 任意自定义属性（由任意消费者通过 getAnimatedValue 读取）
   * view.animation.animate({ to: { cursorOpacity: 0 } }, { duration: 530, iterations: Infinity, direction: 'alternate' })
   */
  animate(
    definition: KeyframeDefinition,
    options: AnimationOptions,
  ): AnimationDescriptor {
    // ── 0. 解析属性列表（从 definition 中提取所有涉及的属性名） ──
    const allProps = this._extractProperties(definition)

    // ── 1. 冲突检测（在创建 descriptor 之前，view 层职责） ──
    const conflict = adapterRegistry.detectConflict(allProps)
    if (conflict) throw new Error(conflict)

    // ── 2. 属性分类（view 层通过 property 注册表判断） ──
    const classification = this._classifyProperties(allProps)

    // ── 3. 构建插值策略提示（rotation 使用角度插值） ──
    const hints = this._buildInterpolationHints(classification)

    // ── 4. 创建纯数学描述对象 ──
    const descriptor = new AnimationDescriptor(definition, options, classification)

    // ── 5. 采集 initialValues（从 View 当前状态 + 冲突动画的 computedValues） ──
    const initialValues: KeyframeProps = {}
    for (const prop of descriptor.properties) {
      // 先检查是否有冲突动画（后到打断先到）
      const conflicting = this._findConflictingDescriptor(prop)
      if (conflicting && conflicting.computedValues[prop] !== undefined) {
        initialValues[prop] = conflicting.computedValues[prop]
        conflicting._removeProperty(prop)
      } else {
        // 从 View 当前状态采集
        initialValues[prop] = this._snapshotProperty(prop)
      }
    }

    // ── 6. 立即挂载到动画列表（消费侧可以立即读取 computedValues） ──
    this._animations.push(descriptor)

    // ── 7. 注册结束回调（在消费侧处理提交/清理） ──
    const userOnFinish = descriptor.onFinish
    const userOnCancel = descriptor.onCancel

    descriptor.onFinish = () => {
      this._handleFinish(descriptor)
      userOnFinish?.()
    }

    descriptor.onCancel = () => {
      this._handleCancel(descriptor)
      userOnCancel?.()
    }

    // ── 8. 播放 + 注册到 Manager ──
    descriptor.play()
    AnimationManager.getInstance().add(descriptor, initialValues, hints)

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

  // ==================== 动画列表管理 ====================

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

  // ==================== 消费侧适配：尺寸动画覆盖层 ====================

  /**
   * 由 View.renderViewport getter 调用：
   * 检查是否有 width/height 的动画值，若有则构建覆盖视口
   */
  resolveAnimatedViewport(): Bounds | null {
    const animW = this.getAnimatedValue('width') as number | undefined
    const animH = this.getAnimatedValue('height') as number | undefined

    if (animW === undefined && animH === undefined) {
      this.animatedViewport = null
      return null
    }

    const viewport = this._view.viewport
    const targetW = animW ?? viewport.width
    const targetH = animH ?? viewport.height

    if (!this.animatedViewport) {
      this.animatedViewport = viewport.copy()
    }
    this.animatedViewport.setSize(targetW, targetH)
    return this.animatedViewport
  }

  /**
   * 由 View.getWorldMatrix() 调用：
   * 检查是否有 spatial 属性（x/y/rotation）的动画值，若有则合成动画矩阵
   */
  resolveAnimatedMatrix(): Matrix4 | undefined {
    const animX = this.getAnimatedValue('x') as number | undefined
    const animY = this.getAnimatedValue('y') as number | undefined
    const animRotation = this.getAnimatedValue('rotation') as number | undefined

    if (animX === undefined && animY === undefined && animRotation === undefined) {
      return undefined
    }

    // 从当前 View 的真实 matrix 分解出基值
    const realMatrix = this._view.matrix
const baseTranslation = MathUtils.extractTranslation(realMatrix)
const baseRotation = MathUtils.extractRotationZ(realMatrix)

    const finalX = animX ?? baseTranslation.x
    const finalY = animY ?? baseTranslation.y
    const finalRotation = animRotation ?? baseRotation

    return Matrix4.identity()
      .translate(finalX, finalY, 0)
      .rotateZ(finalRotation)
  }

  // ==================== 内部：属性解析与分类 ====================

  /** 从 KeyframeDefinition 中提取所有涉及的属性名 */
  private _extractProperties(definition: KeyframeDefinition): string[] {
    const propSet = new Set<string>()
    for (const [key, value] of Object.entries(definition)) {
      if (value === undefined) continue
      if (key === 'to' || /^\d+(\.\d+)?$/.test(key)) {
        for (const prop of Object.keys(value)) {
          if (prop !== 'easing') propSet.add(prop)
        }
      }
    }
    return Array.from(propSet)
  }

  /** 将属性列表按 property 注册表分类为 spatial/size/direct */
  private _classifyProperties(allProps: string[]): PropertyClassification {
    const spatialProps: string[] = []
    const sizeProps: string[] = []
    const directProps: string[] = []

    for (const prop of allProps) {
      const cat = adapterRegistry.getCategory(prop)
      if (cat === 'spatial') spatialProps.push(prop)
      else if (cat === 'size') sizeProps.push(prop)
      else directProps.push(prop)
    }

    return {
      properties: allProps,
      spatialProps,
      sizeProps,
      directProps,
    }
  }

  /** 根据属性分类构建插值策略提示 */
  private _buildInterpolationHints(classification: PropertyClassification): InterpolationHints {
    const hints: InterpolationHints = {}
    // rotation 属性使用角度短弧插值
    if (classification.spatialProps.includes('rotation')) {
      hints['rotation'] = 'angle'
    }
    return hints
  }

  // ==================== 内部：属性快照 ====================

  /**
   * 从 View 当前状态采集属性初始值
   *
   * 属性适配：
   * - spatial（x/y/rotation）：从 View.matrix 分解
   * - size（width/height）：从 View.viewport 读取
   * - direct（其他任何属性）：从 View 或其 addon 上读取（通过属性查找链）
   */
  private _snapshotProperty(prop: string): AnimatableValue {
    const category = adapterRegistry.getCategory(prop)

    if (category === 'spatial') {
      const matrix = this._view.matrix
if (prop === 'x') return MathUtils.extractTranslation(matrix).x
if (prop === 'y') return MathUtils.extractTranslation(matrix).y
if (prop === 'rotation') return MathUtils.extractRotationZ(matrix)
      return 0
    }

    if (category === 'size') {
      const viewport = this._view.viewport
      if (prop === 'width') return viewport.width
      if (prop === 'height') return viewport.height
      if (prop === 'scaleX' || prop === 'scaleY') return 1
      return 0
    }

    // direct 属性：按属性查找链从 View → addon 读取
    return this._resolveDirectProperty(prop)
  }

  /**
   * 按查找链解析 direct 属性的当前值
   * View 本体 → 各 addon（按类型遍历）
   */
  private _resolveDirectProperty(prop: string): AnimatableValue {
    // 先从 View 上读
    const viewValue = (this._view as unknown as Record<string, unknown>)[prop]
    if (typeof viewValue === 'number') return viewValue

    // 再从各 addon 上查找
    const addons = this._view.activeAddons
    for (const addon of addons) {
      if (addon === this) continue // 跳过自身
      const addonValue = (addon as unknown as Record<string, unknown>)[prop]
      if (typeof addonValue === 'number') return addonValue
    }

    // 未找到，默认 0
    return 0
  }

  // ==================== 内部：冲突检测 ====================

  private _findConflictingDescriptor(prop: string): AnimationDescriptor | null {
    for (const anim of this._animations) {
      if (anim.isActive && anim.properties.includes(prop)) {
        return anim as AnimationDescriptor
      }
    }
    return null
  }

  // ==================== 内部：终态处理（消费侧提交） ====================

  /**
   * 动画正常完成时的提交逻辑
   *
   * fillMode === 'forwards' | 'both' 时，将终态值写回 View：
   * - spatial 属性 → 合成并写入 View.matrix
   * - size 属性 → 提交到 View.viewport（含子树等比缩放）
   * - direct 属性 → 写回 View 或 addon 对应字段
   *
   * 其他 fillMode 时清理覆盖层即可。
   */
  private _handleFinish(descriptor: IAnimationDescriptor): void {
    const shouldPersist =
      (descriptor as AnimationDescriptor).fillMode === 'forwards' ||
      (descriptor as AnimationDescriptor).fillMode === 'both'

    if (shouldPersist) {
      this._commitSpatial(descriptor)
      this._commitSize(descriptor)
      this._commitDirect(descriptor)
    } else {
      // 清理覆盖层
      if (this.animatedViewport) {
        this.animatedViewport = null
      }
    }

    // 清空 computedValues 并从列表移除
    descriptor.computedValues = {}
    this.removeAnimation(descriptor)
  }

  /**
   * 动画取消时的清理逻辑
   */
  private _handleCancel(descriptor: IAnimationDescriptor): void {
    // 清理覆盖层
    if (this.animatedViewport) {
      this.animatedViewport = null
    }
    descriptor.computedValues = {}
    this.removeAnimation(descriptor)
  }

  /** 提交 spatial 属性（x/y/rotation → matrix） */
  private _commitSpatial(descriptor: IAnimationDescriptor): void {
    const desc = descriptor as AnimationDescriptor
    const hasX = desc.computedValues['x'] !== undefined
    const hasY = desc.computedValues['y'] !== undefined
    const hasRotation = desc.computedValues['rotation'] !== undefined

    if (!hasX && !hasY && !hasRotation) return

const baseTranslation = MathUtils.extractTranslation(this._view.matrix)
const baseRotation = MathUtils.extractRotationZ(this._view.matrix)

    const finalX = (desc.computedValues['x'] as number) ?? baseTranslation.x
    const finalY = (desc.computedValues['y'] as number) ?? baseTranslation.y
    const finalRotation = (desc.computedValues['rotation'] as number) ?? baseRotation

    this._view.matrix = Matrix4.identity()
      .translate(finalX, finalY, 0)
      .rotateZ(finalRotation)
  }

  /** 提交 size 属性（width/height → viewport + 子树） */
  private _commitSize(descriptor: IAnimationDescriptor): void {
    const desc = descriptor as AnimationDescriptor
    const animW = desc.computedValues['width'] as number | undefined
    const animH = desc.computedValues['height'] as number | undefined

    if (animW === undefined && animH === undefined) return

    this.animatedViewport = null

    const viewport = this._view.viewport
    if (!viewport) return
    const oldWidth = viewport.width
    const oldHeight = viewport.height

    const targetWidth = animW ?? oldWidth
    const targetHeight = animH ?? oldHeight
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
      this._view.markLayoutDirty()
    }

    // 递归提交子 View
    const scaleX = targetWidth / oldWidth
    const scaleY = targetHeight / oldHeight
    if (isContainerView(this._view)) {
      this._view.children.forEach((child: IView) => {
        const childVp = child.viewport
        if (!childVp) return
        childVp.setSize(childVp.width * scaleX, childVp.height * scaleY)
        child.boundingBox?.updateSize()
      })
    }
  }

  /** 提交 direct 属性（写回 View 或 addon 对应字段） */
  private _commitDirect(descriptor: IAnimationDescriptor): void {
    const desc = descriptor as AnimationDescriptor
    for (const prop of desc.directProps) {
      const value = desc.computedValues[prop]
      if (value === undefined) continue

      // 先尝试写 View
      if (prop in this._view) {
        ;(this._view as unknown as Record<string, AnimatableValue>)[prop] = value
        continue
      }

      // 再尝试写 addon
      const addons = this._view.activeAddons
      for (const addon of addons) {
        if (addon === this) continue
        if (prop in addon) {
          ;(addon as unknown as Record<string, AnimatableValue>)[prop] = value
          break
        }
      }
    }
  }
}
