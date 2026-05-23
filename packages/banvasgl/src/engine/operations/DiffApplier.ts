import type { Diff, ApplyDirection } from './OperationStack'
import { DiffType, Operation } from './OperationStack'
import type { SceneAccessor, ReviverFactory } from './types'
import { Matrix4 } from '@/foundation/math'
import Bounds from '@/graph/base/Bounds'
import { isContainerView } from '@/types'

/**
 * Diff 回放执行器
 *
 * 职责：接收 Operation 和方向，将 Diff 逐条应用到场景上。
 * 通过 SceneAccessor 接口操作视图树，自身不依赖 Scene 类。
 *
 * 在三层架构中的位置：
 *   TransactionManager（记录）→ OperationStack（调度）→ DiffApplier（执行）
 */
export default class DiffApplier {
  private scene: SceneAccessor
  private getReviver: ReviverFactory

  constructor(scene: SceneAccessor, getReviver: ReviverFactory) {
    this.scene = scene
    this.getReviver = getReviver
  }

  /**
   * 应用一个 Operation（由 OperationStack 的 undo/redo 回调触发）
   *
   * undo 时逆序遍历 diffs（后执行的先撤销），redo 时正序遍历。
   */
  apply(operation: Operation, direction: ApplyDirection): void {
    const diffs = direction === 'undo'
      ? [...operation.diffs].reverse()
      : operation.diffs

    for (const diff of diffs) {
      this.applyDiff(diff, direction)
    }
  }

  // ==================== 各类型 Diff 的回放 ====================

  private applyDiff(diff: Diff, direction: ApplyDirection): void {
    switch (diff.type) {
      case DiffType.MODIFY:
        this.applyModifyDiff(diff, direction)
        break
      case DiffType.ADD:
        this.applyAddDiff(diff, direction)
        break
      case DiffType.REMOVE:
        this.applyRemoveDiff(diff, direction)
        break
      case DiffType.REORDER:
        this.applyReorderDiff(diff, direction)
        break
    }
  }

  private applyModifyDiff(diff: Extract<Diff, { type: DiffType.MODIFY }>, direction: ApplyDirection): void {
    const view = this.scene.findViewById(diff.viewId)
    if (!view) return

    for (const change of diff.changes) {
      const value = direction === 'undo' ? change.before : change.after
      this.restoreProperty(view, change.path, value)
    }
  }

  private applyAddDiff(diff: Extract<Diff, { type: DiffType.ADD }>, direction: ApplyDirection): void {
    if (direction === 'undo') {
      // 撤销添加 = 删除
      const view = this.scene.findViewById(diff.viewId)
      if (view) {
        this.scene.removeChild(view)
      }
    } else {
      // 重做添加 = 从快照恢复
      const view = this.getReviver().revive(diff.snapshot)
      this.scene.insertChildAt(view, diff.index)
    }
  }

  private applyRemoveDiff(diff: Extract<Diff, { type: DiffType.REMOVE }>, direction: ApplyDirection): void {
    if (direction === 'undo') {
      // 撤销删除 = 从快照恢复
      const view = this.getReviver().revive(diff.snapshot)
      this.scene.insertChildAt(view, diff.index)
    } else {
      // 重做删除 = 再次删除
      const view = this.scene.findViewById(diff.viewId)
      if (view) {
        this.scene.removeChild(view)
      }
    }
  }

  /**
   * 回放层级变更（基于数组位置）
   *
   * redo: 按原始顺序（叶→根）执行，将 view 从 before 移动到 after
   * undo: 按逆序（根→叶）执行，将 view 从 after 移动回 before
   *
   * 注意：undo 时的逆序已经由 apply() 方法通过 reverse() 处理，
   * 这里只需要按 changes 顺序依次执行即可。
   */
  private applyReorderDiff(diff: Extract<Diff, { type: DiffType.REORDER }>, direction: ApplyDirection): void {
    for (const change of diff.changes) {
      const container = this.scene.findContainerById(change.parentId)
      if (!container) continue

      const from = direction === 'undo' ? change.after : change.before
      const to = direction === 'undo' ? change.before : change.after

      const children = container.children
      if (from < 0 || from >= children.length) continue

      // splice: 从 from 取出，插入到 to
      const [moved] = children.splice(from, 1)
      children.splice(to, 0, moved)
    }
  }

  // ==================== 属性恢复 ====================

  /**
   * 恢复 View 的某个属性
   * 根据 path 调用对应类型的 fromJSON 方法重建实例
   */
  private restoreProperty(view: any, path: string, value: any): void {
    switch (path) {
      case 'matrix':
        view.matrix = Matrix4.fromJSON(value)
        break
      case 'viewport':
        view.viewport = Bounds.fromJSON(value)
        view.markLayoutDirty()
        break
      case 'content': {
        if (value === null) {
          view.content = null
          view.markLayoutDirty()
          break
        }
        view.content = this.getReviver().revive(value)
        view.markLayoutDirty()
        break
      }
      case 'children': {
        // 只有 ContainerView（CombinedView、NodeView）才有可写的 children
        if (isContainerView(view)) {
          view.clear()
          const children = (value || []).map((child: any) => {
            return this.getReviver().revive(child)
          })
          for (const child of children) {
            view.addChild(child)  // addChild 内部已调用 markLayoutDirty
          }
        }
        break
      }
      // 纯值类型字段，直接赋值
      case 'visible':
      case 'freezed':
      case 'style':
      case 'data':
      case 'editable':
      case 'verticalAlign':
        view[path] = value
        // style 变更可能影响布局（overflow、needStructViewport 等）
        if (path === 'style') {
          view.markLayoutDirty()
        }
        break
      default:
        console.warn(`未知的属性路径: ${path}`)
    }
  }
}
