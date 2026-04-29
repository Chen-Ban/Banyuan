// ============ 基础类型 ============

/** 属性级快照：记录单个属性变更前后的值 */
export interface PropChange<T = any> {
  /** 属性路径，如 "matrix"、"viewport"、"content" */
  path: string
  /** 变更前的值（序列化后的纯数据） */
  before: T
  /** 变更后的值（序列化后的纯数据） */
  after: T
}

// ============ Diff 判别联合 ============

export enum DiffType {
  /** 属性变更（translate/resize/rotate/样式修改/文本编辑等） */
  MODIFY = 'modify',
  /** 新增 View */
  ADD = 'add',
  /** 删除 View */
  REMOVE = 'remove',
  /** 层级变更（bringToFront/sendToBack 等） */
  REORDER = 'reorder',
}

/** 属性变更 */
export interface ModifyDiff {
  type: DiffType.MODIFY
  viewId: string
  changes: PropChange[]
}

/** 新增节点：存完整快照，undo 时删除，redo 时恢复 */
export interface AddDiff {
  type: DiffType.ADD
  parentId: string
  viewId: string
  snapshot: any
  index: number
}

/** 删除节点：存完整快照，undo 时恢复，redo 时删除 */
export interface RemoveDiff {
  type: DiffType.REMOVE
  parentId: string
  viewId: string
  snapshot: any
  index: number
}

/** 层级变更（基于数组位置） */
export interface ReorderChange {
  /** 被移动的 View 所属容器的 id */
  parentId: string
  /** 被移动的 View 的 id */
  viewId: string
  /** 移动前在 parent.children 中的下标 */
  before: number
  /** 移动后在 parent.children 中的下标 */
  after: number
}

export interface ReorderDiff {
  type: DiffType.REORDER
  changes: ReorderChange[]
}

export type Diff = ModifyDiff | AddDiff | RemoveDiff | ReorderDiff

// ============ Operation ============

export class Operation {
  /** 一次用户操作包含的所有差异 */
  diffs: Diff[]
  /** 时间戳 */
  timestamp: number

  constructor(diffs: Diff[]) {
    this.diffs = diffs
    this.timestamp = Date.now()
  }
}

// ============ 双向链表节点 ============

export class LinkNode<T> {
  value: T
  next: LinkNode<T> | null
  prev: LinkNode<T> | null

  constructor(value: T) {
    this.value = value
    this.next = null
    this.prev = null
  }

  append(node: LinkNode<T>) {
    this.next = node
    node.prev = this
  }
}

// ============ 操作栈 ============

/** undo/redo 方向 */
export type ApplyDirection = 'undo' | 'redo'

/** 操作应用器：接收 Operation 和方向，由 Scene 实现具体的 diff 应用逻辑 */
export type OperationApplier = (operation: Operation, direction: ApplyDirection) => void

/** 哨兵 Operation，作为链表的初始空节点 */
const SENTINEL_OPERATION: Operation = new Operation([])

/**
 * 基于双向链表的操作栈
 *
 * 链表结构：head(哨兵) → op1 → op2 → ... → tail
 * - head 是哨兵节点，永远不会被 undo
 * - tail 指向当前状态对应的最后一个已执行操作
 * - undo: 对 tail 节点执行逆向操作，tail 回退到 prev
 * - redo: tail 前进到 next，对新 tail 执行正向操作
 * - do: 在 tail 后追加新节点，丢弃 tail 之后的所有节点（分支丢弃）
 */
export default class OperationStack {
  private head: LinkNode<Operation>
  private tail: LinkNode<Operation>
  private applier: OperationApplier | undefined
  private maxSize: number = 100
  private _length: number = 1
  private _lengthDirty: boolean = false

  constructor(applier?: OperationApplier) {
    const sentinel = new LinkNode<Operation>(SENTINEL_OPERATION)
    this.head = sentinel
    this.tail = sentinel
    this.applier = applier
  }

  /** 操作栈中有效操作的数量（不含哨兵） */
  get length(): number {
    if (this._lengthDirty) {
      let count = 0
      let node: LinkNode<Operation> | null = this.head.next
      while (node) {
        count++
        node = node.next
      }
      this._length = count
      this._lengthDirty = false
    }
    return this._length
  }

  /** 是否可以撤销 */
  get canUndo(): boolean {
    return this.tail !== this.head
  }

  /** 是否可以重做 */
  get canRedo(): boolean {
    return this.tail.next !== null
  }

  /**
   * 执行新操作并入栈
   * 会丢弃 tail 之后的所有节点（undo 后又做了新操作，旧的 redo 分支被丢弃）
   */
  do(operation: Operation): boolean {
    if (operation.diffs.length === 0) return false

    const node = new LinkNode<Operation>(operation)

    // 丢弃 tail 之后的 redo 分支
    this.tail.next = null

    this.tail.append(node)
    this.tail = node

    this._lengthDirty = true

    // 超出最大容量时，丢弃最早的操作
    if (this.length > this.maxSize && this.head.next) {
      this.head.next = this.head.next.next
      if (this.head.next) {
        this.head.next.prev = this.head
      }
      this._lengthDirty = true
    }

    return true
  }

  /** 撤销：对当前 tail 执行逆向操作，tail 回退 */
  undo(): boolean {
    if (!this.canUndo) return false

    const current = this.tail
    if (this.applier) {
      this.applier(current.value, 'undo')
    }
    this.tail = current.prev!

    return true
  }

  /** 重做：tail 前进，对新 tail 执行正向操作 */
  redo(): boolean {
    if (!this.canRedo) return false

    this.tail = this.tail.next!
    if (this.applier) {
      this.applier(this.tail.value, 'redo')
    }

    return true
  }

  /** 清空操作栈 */
  clear(): void {
    const sentinel = new LinkNode<Operation>(SENTINEL_OPERATION)
    this.head = sentinel
    this.tail = sentinel
    this._length = 0
    this._lengthDirty = false
  }

  /** 重新绑定应用器（Scene 重建时使用） */
  setApplier(applier: OperationApplier): void {
    this.applier = applier
  }
}
