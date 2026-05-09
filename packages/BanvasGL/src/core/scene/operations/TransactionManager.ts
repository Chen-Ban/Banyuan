import type { Diff, PropChange, AddDiff, RemoveDiff, ReorderDiff, ReorderChange } from './OperationStack'
import { DiffType, Operation } from './OperationStack'
import OperationStack from './OperationStack'
import DiffApplier from './DiffApplier'
import type { ReviverFactory } from './types'
import { getDefaultWorkerExecutor } from '@/workers/WorkerExecutor'
import type { WorkerTask } from '@/workers/types'
import type { SnapshotDiffInput, SnapshotDiffOutput, ViewDiffRequest } from '@/workers/handlers/snapshot/types'

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

// SceneAccessor 接口已迁移至 @/core/interfaces
import type { SceneAccessor } from './types'

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
export default class TransactionManager {
  private operationStack: OperationStack
  private scene: SceneAccessor
  private pending: PendingTransaction | null = null
  private taskIdCounter: number = 0

  /**
   * @param scene Scene 的访问接口（viewFinder、removeChild、insertChildAt）
   */
  constructor(scene: SceneAccessor, getReviver: ReviverFactory) {
    this.scene = scene
    const diffApplier = new DiffApplier(scene, getReviver)
    this.operationStack = new OperationStack(diffApplier.apply.bind(diffApplier))
  }

  private generateTaskId(): string {
    return `scene-diff-${++this.taskIdCounter}-${Date.now()}`
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
   * 异步提交事务：将 diff 计算 offload 到 Worker 线程
   *
   * 适用于大型场景（复杂图形、深层嵌套子视图），避免 JSON.stringify 对比
   * 阻塞主线程。快照拍摄仍在主线程完成（需要访问 View 实例），
   * 但耗时的字符串对比在 Worker 中执行。
   *
   * @returns Promise<boolean> 是否成功提交（false 表示无变更或无事务）
   */
  async commitTransactionAsync(): Promise<boolean> {
    if (!this.pending) return false

    const views: ViewDiffRequest[] = []

    for (const [viewId, beforeSnapshot] of this.pending.beforeSnapshots) {
      const view = this.scene.findViewById(viewId)
      if (!view) continue

      const afterSnapshot = snapshotView(view)
      views.push({ viewId, before: beforeSnapshot, after: afterSnapshot })
    }

    this.pending = null

    if (views.length === 0) return false

    // 构造 Worker 任务
    const payload: SnapshotDiffInput = { views }
    const task: WorkerTask<SnapshotDiffInput> = {
      id: this.generateTaskId(),
      type: 'scene/diff',
      payload,
    }

    // 发送到 Worker 执行 diff 计算
    const workerResult = await getDefaultWorkerExecutor().execute<SnapshotDiffInput, SnapshotDiffOutput>(task)

    if (workerResult.error) {
      console.error('Worker diff 计算失败，回退到同步模式:', workerResult.error)
      // 降级：使用同步方式重新计算
      return this.commitTransactionSync(views)
    }

    const diffOutput = workerResult.result
    if (!diffOutput.hasChanges) return false

    // 将 Worker 返回的 diff 结果转换为 Operation
    const diffs: Diff[] = []
    for (const viewResult of diffOutput.results) {
      if (viewResult.changes.length > 0) {
        diffs.push({
          type: DiffType.MODIFY,
          viewId: viewResult.viewId,
          changes: viewResult.changes,
        })
      }
    }

    if (diffs.length === 0) return false

    return this.operationStack.do(new Operation(diffs))
  }

  /**
   * 同步 diff 计算（作为 Worker 失败时的降级方案）
   */
  private commitTransactionSync(views: ViewDiffRequest[]): boolean {
    const diffs: Diff[] = []

    for (const { viewId, before, after } of views) {
      const changes = diffSnapshots(
        before as ViewSnapshot,
        after as ViewSnapshot
      )
      if (changes.length > 0) {
        diffs.push({ type: DiffType.MODIFY, viewId, changes })
      }
    }

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
    const snapshot = { $type: view.type, $value: view.toJSON() }
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
    const snapshot = { $type: view.type, $value: view.toJSON() }
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
