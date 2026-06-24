import type { Diff, PropChange, AddDiff, RemoveDiff, ReorderDiff, ReorderChange } from './OperationStack'
import { DiffType, Operation, OperationStack } from './OperationStack'
import { DiffApplier } from './DiffApplier'
import { Serializer } from '@/engine/serialization/rawjson/Serializer.js'

// ============ 快照相关类型 ============

/** View 的核心可变属性快照（覆盖所有用户可操作字段） */
interface ViewSnapshot {
  matrix: any
  viewport: any
  content: any
  visible: boolean
  freezed: boolean
  style: any
  data: any
  children: any
  // 子类扩展字段（TextView）
  editable?: boolean
  verticalAlign?: any
}

/** 需要快照的属性路径列表 */
const SNAPSHOT_PATHS: (keyof ViewSnapshot)[] = [
  'matrix', 'viewport', 'content',
  'visible', 'freezed', 'style', 'data', 'children',
  'editable', 'verticalAlign',
]

/** 进行中的事务 */
interface PendingTransaction {
  /** 参与事务的 viewId → 操作前快照 */
  beforeSnapshots: Map<string, ViewSnapshot>
}

import type { SceneAccessor } from '@/types/engine/scene'

// ============ 快照工具函数 ============

/**
 * 对 View 实例的核心属性做序列化快照
 * 返回纯数据对象，与原始对象完全解耦
 */
function snapshotView(view: { toJSON(): any }): ViewSnapshot {
  const json = view.toJSON()
  return {
    matrix: json.matrix,
    viewport: json.viewport,
    content: json.content,
    visible: json.visible,
    freezed: json.freezed,
    style: json.style,
    data: json.data,
    children: json.children,
    editable: json.editable,
    verticalAlign: json.verticalAlign,
  }
}

/**
 * 对比 before/after 快照，返回有变化的属性列表
 */
function diffSnapshots(before: ViewSnapshot, after: ViewSnapshot): PropChange[] {
  const changes: PropChange[] = []
  for (const path of SNAPSHOT_PATHS) {
    const bVal = before[path]
    const aVal = after[path]
    // 跳过两边都不存在的子类扩展字段
    if (bVal === undefined && aVal === undefined) continue
    const b = JSON.stringify(bVal)
    const a = JSON.stringify(aVal)
    if (b !== a) {
      changes.push({ path, before: bVal, after: aVal })
    }
  }
  return changes
}

// ============ TransactionManager ============

/**
 * 事务管理器
 *
 * 职责：
 * 1. 管理持续性操作（拖拽类）的事务生命周期：begin → commit/rollback
 * 2. 提供瞬时操作（添加/删除/层级变更）的便捷录入方法
 * 3. 生成 Diff 并提交到 OperationStack
 *
 * 三层架构：
 *   TransactionManager（记录）→ OperationStack（调度）→ DiffApplier（执行）
 *
 * 使用方式：
 *   - 持续性操作：mousedown 时 beginTransaction，mouseup 时 commitTransaction
 *   - 瞬时操作：直接调用 recordAdd / recordRemove / recordReorder
 */
export class TransactionManager {
  private operationStack: OperationStack
  private scene: SceneAccessor
  private pending: PendingTransaction | null = null

  /**
   * @param scene Scene 的访问接口（viewFinder、removeChild、insertChildAt）
   */
  constructor(scene: SceneAccessor) {
    this.scene = scene
    const diffApplier = new DiffApplier(scene)
    this.operationStack = new OperationStack(diffApplier.apply.bind(diffApplier))
  }

  // ==================== 持续性操作事务 ====================

  /** 是否有进行中的事务 */
  get isTransacting(): boolean {
    return this.pending !== null
  }

  /**
   * 开启事务：快照指定 views 的当前状态
   * @param viewIds 参与本次操作的 View id 列表
   */
  beginTransaction(viewIds: string[]): void {
    if (this.pending) {
      console.warn('已有进行中的事务，先提交或回滚当前事务')
      return
    }

    const beforeSnapshots = new Map<string, ViewSnapshot>()
    for (const id of viewIds) {
      const view = this.scene.findViewById(id)
      if (view) {
        beforeSnapshots.set(id, snapshotView(view))
      }
    }

    this.pending = { beforeSnapshots }
  }

  /**
   * 提交事务：快照当前状态作为 after，对比生成 diffs，入栈
   * 如果 before/after 完全相同，则丢弃（不污染操作栈）
   * @returns 是否成功提交（false 表示无变更或无事务）
   */
  commitTransaction(): boolean {
    if (!this.pending) return false

    const diffs: Diff[] = []

    for (const [viewId, beforeSnapshot] of this.pending.beforeSnapshots) {
      const view = this.scene.findViewById(viewId)
      if (!view) continue

      const afterSnapshot = snapshotView(view)
      const changes = diffSnapshots(beforeSnapshot, afterSnapshot)

      if (changes.length > 0) {
        diffs.push({
          type: DiffType.MODIFY,
          viewId,
          changes,
        })
      }
    }

    this.pending = null

    if (diffs.length === 0) return false

    return this.operationStack.do(new Operation(diffs))
  }

  /**
   * 回滚事务：丢弃当前事务，不入栈
   */
  rollbackTransaction(): void {
    this.pending = null
  }

  // ==================== 瞬时操作录入 ====================

  /**
   * 记录添加 View 操作
   * @param parentId 父节点 id（Scene.id 或父 View.id）
   * @param view 被添加的 View 实例
   * @param index 插入位置
   */
  recordAdd(parentId: string, view: { id: string; toJSON(): any; type: any }, index: number): void {
    const serializer = Serializer.getInstance()
    const snapshot = serializer.serialize(view)
    const diff: AddDiff = {
      type: DiffType.ADD,
      parentId,
      viewId: view.id,
      snapshot,
      index,
    }
    this.operationStack.do(new Operation([diff]))
  }

  /**
   * 记录删除 View 操作
   * @param parentId 父节点 id
   * @param view 被删除的 View 实例（删除前调用，需要拍快照）
   * @param index 原来的位置
   */
  recordRemove(parentId: string, view: { id: string; toJSON(): any; type: any }, index: number): void {
    const serializer = Serializer.getInstance()
    const snapshot = serializer.serialize(view)
    const diff: RemoveDiff = {
      type: DiffType.REMOVE,
      parentId,
      viewId: view.id,
      snapshot,
      index,
    }
    this.operationStack.do(new Operation([diff]))
  }

  /**
   * 记录层级变更操作（基于数组位置）
   * @param changes 每个受影响 View 的 parentId + 下标变化
   */
  recordReorder(changes: ReorderChange[]): void {
    if (changes.length === 0) return
    const effectiveChanges = changes.filter(c => c.before !== c.after)
    if (effectiveChanges.length === 0) return

    const diff: ReorderDiff = {
      type: DiffType.REORDER,
      changes: effectiveChanges,
    }
    this.operationStack.do(new Operation([diff]))
  }

  // ==================== 操作栈管理 ====================

  /** 撤销上一步操作 */
  undo(): boolean {
    return this.operationStack.undo()
  }

  /** 重做上一步撤销的操作 */
  redo(): boolean {
    return this.operationStack.redo()
  }

  /** 是否可以撤销 */
  get canUndo(): boolean {
    return this.operationStack.canUndo
  }

  /** 是否可以重做 */
  get canRedo(): boolean {
    return this.operationStack.canRedo
  }

  /** 清空操作栈 */
  clear(): void {
    this.operationStack.clear()
  }
}
