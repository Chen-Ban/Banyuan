import { View } from "../../views"

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

export class Diff{
    parentId: string
    view: View
    constructor(parentId: string, view: View) {
        this.parentId = parentId
        this.view = view
    }
}

export enum OperationType {
    ADD = 'add',
    REMOVE = 'remove',
    MODIFY = 'modify',
    MOVE = 'move',
    NONE = 'none'
}

export class Operation {
    // 操作前后的差异, 一次操作可能包含多个差异
    diff: Diff[]
    // 操作类型
    type: OperationType
    // 时间戳
    timestamp: number
    constructor(diff: Diff[], type: OperationType, timestamp: number) {
        this.diff = diff
        this.type = type
        this.timestamp = timestamp
    }
}

const noneOperation: Operation = new Operation([], OperationType.NONE, 0)

// 快照应用器类型
export type OperationApplier = (operation: Operation | null) => void

// 操作栈类
export default class OperationStack {
    private head: LinkNode<Operation>  = new LinkNode<Operation>(noneOperation)
    private tail: LinkNode<Operation> = new LinkNode<Operation>(noneOperation)

    private OperationApplier: OperationApplier | undefined

    private maxSize: number = 100
    private _length: number = 0

    private shouldReComputeLength: boolean = true

    constructor(OperationApplier?: OperationApplier) {
        this.OperationApplier = OperationApplier
    }

    get length(): number {
        if (this._length && !this.shouldReComputeLength) return this._length
        let count = 0
        let node: LinkNode<Operation> | null = this.head
        while (node) {
            count++
            node = node.next
        }
        this._length = count
        this.shouldReComputeLength = false
        return count
    }

    do(operation: Operation): boolean {
        // 如果头节点和尾节点都为空，则创建头节点和尾节点
        if(!this.head && !this.tail) {
            this.head = new LinkNode<Operation>(operation)
            this.tail = this.head
            this.shouldReComputeLength = true
            return true
        }

        const node = new LinkNode<Operation>(operation)

        this.tail.append(node)
        this.tail = node

        if(this.OperationApplier){
            this.OperationApplier(node.value)
        }

        if(this.length >= this.maxSize && this.head.next) {
            this.head = this.head.next
            this.head.prev = null
        }

        this.shouldReComputeLength = true
        return true
    }

    // 撤销操作
    undo(): boolean {
        if(this.tail && this.tail.prev) {
            this.tail = this.tail.prev
            if(this.OperationApplier){
                this.OperationApplier(this.tail.value)
            }
            return true
        }
        return false
    }

    // 重做操作
    redo(): boolean {
        if(this.tail && this.tail.next) {
            this.tail = this.tail.next
            if(this.OperationApplier){
                this.OperationApplier(this.tail.value)
            }
            return true
        }
        return false
    }
}
