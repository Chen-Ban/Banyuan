import { VIEWTYPE } from "@/constants"
import { View, ViewOptions } from "@/core/views"
import Scene from "@/core/scene/Scene"
import Serializer from "@/core/utils/Serializer"

// 页面快照接口（Scene的JSON表示）
export interface SceneSnapshot {
    // Scene的序列化JSON字符串
    sceneJson: string
    // 快照描述
    description?: string
}

// 操作接口
export interface Operation {
    // 操作前后的页面快照
    sceneSnapshot: {
        old: SceneSnapshot | null
        new: SceneSnapshot | null
    }
    // 操作类型
    type: 'add' | 'remove' | 'modify' | 'move' | 'scene_change' | 'layer'
    // 时间戳
    timestamp: number
    // 操作描述
    description?: string
}

// 快照应用器类型
export type SnapshotApplier = (sceneSnapshot: SceneSnapshot | null) => void

// 操作栈类
export default class OperationStack {
    private operations: Operation[] = []
    private currentIndex: number = -1
    private maxSize: number = 100
    private snapshotApplier: SnapshotApplier | null = null

    constructor(maxSize: number = 100, snapshotApplier?: SnapshotApplier) {
        this.maxSize = maxSize
        this.snapshotApplier = snapshotApplier || null
    }

    // 添加操作
    push(operation: Operation): void {
        // 如果当前不在栈顶，删除后面的操作
        if (this.currentIndex < this.operations.length - 1) {
            this.operations = this.operations.slice(0, this.currentIndex + 1)
        }

        // 添加新操作
        this.operations.push(operation)
        this.currentIndex++

        // 限制栈大小
        if (this.operations.length > this.maxSize) {
            this.operations.shift()
            this.currentIndex--
        }
    }

    // 撤销操作 - 从 new 状态回到 old 状态
    undo(): boolean {
        if (this.currentIndex >= 0 && this.snapshotApplier) {
            const operation = this.operations[this.currentIndex]
            // 应用 old 快照（撤销到之前的状态）
            this.snapshotApplier(operation.sceneSnapshot.old)
            this.currentIndex--
            return true
        }
        return false
    }

    // 重做操作 - 从 old 状态到 new 状态
    redo(): boolean {
        if (this.currentIndex < this.operations.length - 1 && this.snapshotApplier) {
            this.currentIndex++
            const operation = this.operations[this.currentIndex]
            // 应用 new 快照（重做到新状态）
            this.snapshotApplier(operation.sceneSnapshot.new)
            return true
        }
        return false
    }

    // 检查是否可以撤销
    canUndo(): boolean {
        return this.currentIndex >= 0
    }

    // 检查是否可以重做
    canRedo(): boolean {
        return this.currentIndex < this.operations.length - 1
    }

    // 清空操作栈
    clear(): void {
        this.operations = []
        this.currentIndex = -1
    }

    // 获取操作历史
    getHistory(): Operation[] {
        return [...this.operations]
    }

    // 获取当前操作
    getCurrentOperation(): Operation | null {
        return this.currentIndex >= 0 ? this.operations[this.currentIndex] : null
    }

    // 获取操作栈大小
    getSize(): number {
        return this.operations.length
    }

    // 获取当前索引
    getCurrentIndex(): number {
        return this.currentIndex
    }

    // 设置最大栈大小
    setMaxSize(size: number): void {
        this.maxSize = Math.max(1, size)
        
        // 如果当前栈大小超过限制，移除多余的操作
        while (this.operations.length > this.maxSize) {
            this.operations.shift()
            this.currentIndex--
        }
    }

    // 获取最大栈大小
    getMaxSize(): number {
        return this.maxSize
    }

    // 设置快照应用器
    setSnapshotApplier(applier: SnapshotApplier): void {
        this.snapshotApplier = applier
    }

    // 获取快照应用器
    getSnapshotApplier(): SnapshotApplier | null {
        return this.snapshotApplier
    }

    // 检查操作栈是否为空
    isEmpty(): boolean {
        return this.operations.length === 0
    }

    // 检查操作栈是否已满
    isFull(): boolean {
        return this.operations.length >= this.maxSize
    }

    // 获取指定索引的操作
    getOperation(index: number): Operation | null {
        if (index >= 0 && index < this.operations.length) {
            return this.operations[index]
        }
        return null
    }

    // 移除指定索引的操作
    removeOperation(index: number): boolean {
        if (index >= 0 && index < this.operations.length) {
            this.operations.splice(index, 1)
            
            // 调整当前索引
            if (index <= this.currentIndex) {
                this.currentIndex--
            }
            
            return true
        }
        return false
    }

    // 批量添加操作
    pushBatch(operations: Operation[]): void {
        operations.forEach(operation => {
            this.push(operation)
        })
    }

    // 获取操作统计信息
    getStats(): {
        totalOperations: number
        currentIndex: number
        maxSize: number
        canUndo: boolean
        canRedo: boolean
        isEmpty: boolean
        isFull: boolean
    } {
        return {
            totalOperations: this.operations.length,
            currentIndex: this.currentIndex,
            maxSize: this.maxSize,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            isEmpty: this.isEmpty(),
            isFull: this.isFull()
        }
    }

    // 导出操作栈数据
    export(): {
        operations: Operation[]
        currentIndex: number
        maxSize: number
    } {
        return {
            operations: [...this.operations],
            currentIndex: this.currentIndex,
            maxSize: this.maxSize
        }
    }

    // 导入操作栈数据
    import(data: {
        operations: Operation[]
        currentIndex: number
        maxSize: number
    }): void {
        this.operations = [...data.operations]
        this.currentIndex = Math.max(-1, Math.min(data.currentIndex, data.operations.length - 1))
        this.maxSize = Math.max(1, data.maxSize)
    }

    // 重置操作栈
    reset(): void {
        this.clear()
        this.maxSize = 100
    }

    // 创建页面快照
    static createSceneSnapshot(scene: Scene, description?: string): SceneSnapshot {
        const sceneJson = Serializer.serializeScene(scene)
        return {
            sceneJson,
            description
        }
    }

    // 从快照恢复Scene
    static restoreSceneFromSnapshot(snapshot: SceneSnapshot | null): Scene | null {
        if (!snapshot || !snapshot.sceneJson) {
            return null
        }
        try {
            return Serializer.deserializeScene(snapshot.sceneJson)
        } catch (error) {
            console.error('Failed to restore scene from snapshot:', error)
            return null
        }
    }

    // 创建操作
    static createOperation(
        sceneSnapshot: { old: SceneSnapshot | null, new: SceneSnapshot | null },
        type: Operation['type'],
        description?: string
    ): Operation {
        return {
            sceneSnapshot,
            type,
            timestamp: Date.now(),
            description
        }
    }

    // 创建场景变更操作
    static createSceneChangeOperation(
        oldScene: Scene | null,
        newScene: Scene,
        description?: string
    ): Operation {
        const oldSnapshot = oldScene ? OperationStack.createSceneSnapshot(oldScene, 'Previous state') : null
        const newSnapshot = OperationStack.createSceneSnapshot(newScene, description || 'Scene changed')
        
        return OperationStack.createOperation(
            { old: oldSnapshot, new: newSnapshot },
            'scene_change',
            description
        )
    }

    // 创建添加操作
    static createAddOperation(
        oldScene: Scene,
        newScene: Scene,
        description?: string
    ): Operation {
        const oldSnapshot = OperationStack.createSceneSnapshot(oldScene, 'Before add')
        const newSnapshot = OperationStack.createSceneSnapshot(newScene, description || 'After add')
        
        return OperationStack.createOperation(
            { old: oldSnapshot, new: newSnapshot },
            'add',
            description
        )
    }

    // 创建删除操作
    static createRemoveOperation(
        oldScene: Scene,
        newScene: Scene,
        description?: string
    ): Operation {
        const oldSnapshot = OperationStack.createSceneSnapshot(oldScene, 'Before remove')
        const newSnapshot = OperationStack.createSceneSnapshot(newScene, description || 'After remove')
        
        return OperationStack.createOperation(
            { old: oldSnapshot, new: newSnapshot },
            'remove',
            description
        )
    }

    // 创建修改操作
    static createModifyOperation(
        oldScene: Scene,
        newScene: Scene,
        description?: string
    ): Operation {
        const oldSnapshot = OperationStack.createSceneSnapshot(oldScene, 'Before modify')
        const newSnapshot = OperationStack.createSceneSnapshot(newScene, description || 'After modify')
        
        return OperationStack.createOperation(
            { old: oldSnapshot, new: newSnapshot },
            'modify',
            description
        )
    }

    // 创建移动操作
    static createMoveOperation(
        oldScene: Scene,
        newScene: Scene,
        description?: string
    ): Operation {
        const oldSnapshot = OperationStack.createSceneSnapshot(oldScene, 'Before move')
        const newSnapshot = OperationStack.createSceneSnapshot(newScene, description || 'After move')
        
        return OperationStack.createOperation(
            { old: oldSnapshot, new: newSnapshot },
            'move',
            description
        )
    }
}
