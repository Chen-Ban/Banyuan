import { Rectangle } from '@/graph'
import type { ExtraData, ITextSelectionAddon } from '@/types'
import { AddonType, AddonCapability } from '@/foundation/constants'
import type { Point3 } from '@/foundation/math'
import type { TextIndex } from '@/types'
import type { IAnimationDescriptor } from '@/types'
import TextSelection from './TextSelection.js'
import AnimationAddon from './AnimationAddon.js'
import type TextView from '@/view/TextView/index.js'

/**
 * TextSelectionAddon —— 文本光标/选区渲染与动画管理插件（RENDER + LOGIC）
 *
 * 职责：
 * - RENDER：渲染光标竖线或范围选中高亮矩形
 * - LOGIC：维护 Selection 状态（fixedIndex / dynamicIndex）、
 *   管理光标闪烁动画（AnimationAddon 驱动）
 *
 * 可选挂载：仅在 editable=true 的 TextView 上按需创建，
 * editable=false 的 TextView 不持有此 addon，零内存开销。
 *
 * 生命周期独立性：光标闪烁动画（_cursorAnimation）由本 addon 独立管理，
 * 其启动/停止不影响 View 本体的渲染生命周期。
 *
 * 复用性：Input 继承 TextView，天然复用本 addon 的全部选区逻辑。
 */
export default class TextSelectionAddon implements ITextSelectionAddon {
  public readonly type = AddonType.TEXT_SELECTION
  public capabilities = [
    AddonCapability.RENDER,
    AddonCapability.LOGIC,
  ]
  /** 优先级 5：在 BoundingBoxAddon(0) 之后渲染 */
  public readonly priority = 5

  /** 选区状态（fixedIndex + dynamicIndex + selectionBoxes） */
  public readonly selection: TextSelection = new TextSelection(undefined, undefined)

  /** 当前光标不透明度（由动画系统驱动，0~1） */
  public cursorOpacity: number = 1

  /** 光标闪烁动画描述符，用于重置时取消旧动画 */
  private _cursorAnimation: IAnimationDescriptor | null = null

  /** selection 脏标记：index 变更后需要在布局完成后重新计算矩形 */
  private _selectionDirty: boolean = false

  /** 宿主 TextView（用于访问 content.paragraphs 和 animation addon） */
  private _view: TextView

  constructor(view: TextView) {
    this._view = view
  }

  // ==================== 公共 API ====================

  /**
   * 设置选择意图（纯数据操作）。
   * 实际的光标/选区矩形计算延迟到渲染帧布局完成后执行。
   *
   * @param fixedIndex   固定光标；两者均为 undefined 时清空选区
   * @param dynamicIndex 动态光标；仅传 fixedIndex 时表示光标模式
   */
  public setSelection(
    fixedIndex: TextIndex | undefined,
    dynamicIndex: TextIndex | undefined,
  ): void {
    this.selection.fixedIndex = fixedIndex
    this.selection.dynamicIndex = dynamicIndex
    this._selectionDirty = true
  }

  /**
   * 布局完成后，根据 selection index 计算光标/选区矩形并管理闪烁动画。
   * 此方法在 TextView.renderContent() 中调用，确保 textElement.bounds 已就绪。
   */
  public computeSelectionBoxes(): void {
    if (!this._selectionDirty) return
    this._selectionDirty = false

    const { fixedIndex, dynamicIndex } = this.selection
    const [start, end] = TextSelection.toDirectionlessIndex(fixedIndex, dynamicIndex)

    if (!start || !end) {
      this.selection.setSelectionBoxs([])
      this.stopCursorAnimation()
      return
    }

    const boxs: Rectangle[] = []

    if (TextSelection.isCursor(start, end)) {
      // 光标模式
      const textElement = this._view.content.paragraphs[start[0]].texts[start[1]]
      const bounds = textElement.bounds
      const x = start[2] === 0 ? bounds.x - 2 : bounds.x + bounds.width
      boxs.push(new Rectangle(x, bounds.y, 2, bounds.height))
    } else {
      // 范围选中模式
      const startNorm: TextIndex = [...start]
      const endNorm: TextIndex = [...end]
      if (startNorm[2] === 1) {
        startNorm[1]++
        startNorm[2] = 0
      }
      if (endNorm[2] === 1) {
        endNorm[1]++
        endNorm[2] = 0
      }
      const startPriorityNum = Number(startNorm.join(''))
      const endPriorityNum = Number(endNorm.join(''))

      for (const [i, paragraph] of this._view.content.paragraphs.entries()) {
        for (const [j, textElement] of paragraph.texts.entries()) {
          const curPriorityNum = Number([i, j, 0].join(''))
          if (curPriorityNum >= startPriorityNum && curPriorityNum < endPriorityNum) {
            const bounds = textElement.bounds
            boxs.push(new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height))
          }
        }
      }
    }

    this.selection.setSelectionBoxs(boxs)

    // 光标状态时启动闪烁动画（仅当动画尚未运行时）；范围选中或清空时停止动画
    if (TextSelection.isCursor(fixedIndex, dynamicIndex)) {
      if (!this._cursorAnimation || !this._cursorAnimation.isActive) {
        this.stopCursorAnimation()
        this.cursorOpacity = 1
        // 确保宿主 View 的 animation addon 已挂载
        if (!this._view.animation) {
          this._view.animation = new AnimationAddon(this._view)
        }
        this._cursorAnimation = this._view.animation.animate(
          { to: { cursorOpacity: 0 } },
          { duration: 530, iterations: Infinity, direction: 'alternate' },
        )
      }
    } else {
      this.stopCursorAnimation()
    }
  }

  /** 停止光标闪烁动画 */
  public stopCursorAnimation(): void {
    if (this._cursorAnimation) {
      this._cursorAnimation.cancel()
      this._cursorAnimation = null
    }
    this.cursorOpacity = 1
  }

  // ==================== IAddonBase 实现 ====================

  /**
   * 渲染光标/选区高亮。
   * 由 renderPlugins 管线在 RENDER 阶段调用。
   * cursorOpacity 优先读取动画系统的驱动值。
   */
  public render(ctx: CanvasRenderingContext2D): void {
    const cursorOpacity =
      (this._view.getAnimatedValue('cursorOpacity') as number) ?? this.cursorOpacity
    this.selection.render(ctx, cursorOpacity)
  }

  /**
   * 文本选区不参与通用交互检测（命中检测由 TextView.interactContent 负责），
   * 始终返回 null。
   */
  public interact(_p: Point3, _bufferCtx?: CanvasRenderingContext2D): ExtraData | null {
    return null
  }

  public copy(): TextSelectionAddon {
    const copy = new TextSelectionAddon(this._view)
    copy.selection.fixedIndex = this.selection.fixedIndex
    copy.selection.dynamicIndex = this.selection.dynamicIndex
    return copy
  }
}
