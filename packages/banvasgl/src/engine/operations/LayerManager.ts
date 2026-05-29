import type View from '@/view/View/View'
import type { ReorderChange } from './OperationStack'
import { isContainerView } from '@/types'

/**
 * 层级管理器（基于数组位置）
 *
 * 核心理念：layer = 容器 children 数组的下标（即深度优先遍历顺序）。
 * 不再在 View 上存储 layer 数值，所有层级操作都是对 children 数组的 splice。
 *
 * 全局可见性（类 PPT）：bringToFront / sendToBack 会递归提升祖先链，
 * 使目标 View 在全局绘制顺序中真正到达最前/最后。
 *
 * 每个修改方法返回 ReorderChange[]，由 Scene 代理层提交到操作栈。
 */
export default class LayerManager {
  /**
   * 获取场景根节点，用于祖先链递归
   * 返回的对象需要有 children 和 id 属性
   */
  private getRoot: () => { children: View[]; id: string }

  constructor(getRoot: () => { children: View[]; id: string }) {
    this.getRoot = getRoot
  }

  // ==================== 公共 API ====================

  /**
   * 将视图移到最前面（置顶）—— 全局递归
   *
   * 1. 在 parent.children 中把 view 移到末尾
   * 2. 递归：把 parent 在 grandparent.children 中也移到末尾
   * 3. 直到到达 Scene 根节点
   *
   * redo 顺序：叶 → 根（先移子再移父）
   * undo 顺序：根 → 叶（ReorderDiff 内 changes 逆序回放）
   */
  bringToFront(view: View): ReorderChange[] {
    const changes: ReorderChange[] = []
    this.moveToEnd(view, changes)
    return changes
  }

  /**
   * 将视图移到最后面（置底）—— 全局递归
   *
   * 与 bringToFront 对称，移到数组开头，祖先链也移到开头。
   */
  sendToBack(view: View): ReorderChange[] {
    const changes: ReorderChange[] = []
    this.moveToStart(view, changes)
    return changes
  }

  /**
   * 将视图上移一层（在同级 children 中与后一个交换）
   * 不递归祖先链——仅同级内移动。
   */
  bringForward(view: View): ReorderChange[] {
    const parent = this.findParentOf(view)
    if (!parent) return []

    const idx = parent.children.indexOf(view)
    if (idx < 0 || idx === parent.children.length - 1) return []

    // 交换 idx 和 idx+1
    const changes: ReorderChange[] = []
    this.swapInArray(parent, idx, idx + 1, changes)
    return changes
  }

  /**
   * 将视图下移一层（在同级 children 中与前一个交换）
   * 不递归祖先链——仅同级内移动。
   */
  sendBackward(view: View): ReorderChange[] {
    const parent = this.findParentOf(view)
    if (!parent) return []

    const idx = parent.children.indexOf(view)
    if (idx <= 0) return []

    // 交换 idx 和 idx-1
    const changes: ReorderChange[] = []
    this.swapInArray(parent, idx, idx - 1, changes)
    return changes
  }

  // ==================== 内部方法 ====================

  /**
   * 递归将 node 移到其 parent.children 末尾，再对 parent 做同样操作。
   * 到达根节点（Scene）时停止。
   */
  private moveToEnd(node: View, changes: ReorderChange[]): void {
    const parent = this.findParentOf(node)
    if (!parent) return

    const children = parent.children
    const from = children.indexOf(node)
    if (from < 0) return

    const to = children.length - 1
    if (from !== to) {
      // 从原位置移除，插入到末尾
      children.splice(from, 1)
      children.push(node)
      changes.push({
        parentId: parent.id,
        viewId: node.id,
        before: from,
        after: to,
      })
    }

    // 递归祖先（如果 parent 本身也是 View，继续往上）
    if (this.isView(parent)) {
      this.moveToEnd(parent as unknown as View, changes)
    }
  }

  /**
   * 递归将 node 移到其 parent.children 开头，再对 parent 做同样操作。
   */
  private moveToStart(node: View, changes: ReorderChange[]): void {
    const parent = this.findParentOf(node)
    if (!parent) return

    const children = parent.children
    const from = children.indexOf(node)
    if (from < 0) return

    const to = 0
    if (from !== to) {
      children.splice(from, 1)
      children.unshift(node)
      changes.push({
        parentId: parent.id,
        viewId: node.id,
        before: from,
        after: to,
      })
    }

    if (this.isView(parent)) {
      this.moveToStart(parent as unknown as View, changes)
    }
  }

  /**
   * 在 parent.children 中交换两个位置的元素
   * 记录为：被操作 view 从 fromIdx 移动到 toIdx
   */
  private swapInArray(
    parent: { children: View[]; id: string },
    fromIdx: number,
    toIdx: number,
    changes: ReorderChange[],
  ): void {
    const children = parent.children
    const node = children[fromIdx]

    // 用 splice 模拟：先移除，再插入到目标位置
    children.splice(fromIdx, 1)
    children.splice(toIdx, 0, node)

    changes.push({
      parentId: parent.id,
      viewId: node.id,
      before: fromIdx,
      after: toIdx,
    })
  }

  /**
   * 查找 node 的父容器（可能是 View，也可能是 Scene 根节点）
   */
  private findParentOf(node: View): { children: View[]; id: string } | null {
    // View.parent 可能指向 Scene 或另一个 View
    // 如果 parent 存在且有 children 和 id，直接使用
    const parent = node.parent as any
    if (parent && Array.isArray(parent.children) && typeof parent.id === 'string') {
      return parent
    }
    // 兜底：从根节点搜索（理论上不会走到这里）
    return this.findParentInTree(this.getRoot(), node)
  }

  /**
   * 递归搜索 node 的父节点
   */
  private findParentInTree(
    root: { children: View[]; id: string },
    target: View,
  ): { children: View[]; id: string } | null {
    if (root.children.includes(target)) return root
    for (const child of root.children) {
      if (isContainerView(child) && child.children.length > 0) {
        const found = this.findParentInTree(child as unknown as { children: View[]; id: string }, target)
        if (found) return found
      }
    }
    return null
  }

  /**
   * 判断一个节点是否是 View（有 parent 属性，区别于 Scene 根节点）
   */
  private isView(node: { children: View[]; id: string }): boolean {
    return 'parent' in node && node !== this.getRoot()
  }
}
