# OperationStack 使用说明

## 概述

新的 OperationStack 设计基于页面快照机制，每个操作包含：
- 操作前后的页面快照（Scene的JSON序列化）
- 操作类型（add、remove、modify、move、scene_change）
- 操作描述和时间戳

## 核心概念

### SceneSnapshot
```typescript
interface SceneSnapshot {
    sceneJson: string        // Scene的序列化JSON字符串
    description?: string     // 快照描述
}
```

### Operation
```typescript
interface Operation {
    sceneSnapshot: {
        old: SceneSnapshot | null
        new: SceneSnapshot | null
    }
    type: 'add' | 'remove' | 'modify' | 'move' | 'scene_change'
    timestamp: number
    description?: string
}
```

## 使用示例

```typescript
import OperationStack, { SnapshotApplier } from './OperationStack'
import Scene from '../Scene'
import Serializer from '../../utils/Serializer'

// 1. 创建快照应用器
const snapshotApplier: SnapshotApplier = (sceneSnapshot) => {
    if (sceneSnapshot) {
        // 从快照恢复Scene状态
        const restoredScene = OperationStack.restoreSceneFromSnapshot(sceneSnapshot)
        if (restoredScene) {
            // 更新当前Scene的状态
            console.log('应用页面快照:', sceneSnapshot.description)
        }
    }
}

// 2. 创建操作栈
const operationStack = new OperationStack(100, snapshotApplier)

// 3. 创建Scene
const scene = new Scene(camera)

// 4. 创建添加操作
const oldScene = scene.copy() // 保存当前状态
scene.addChild(newView)       // 执行操作
const addOperation = OperationStack.createAddOperation(oldScene, scene, 'Add new view')

// 5. 推入操作栈
operationStack.push(addOperation)

// 6. 撤销操作（应用 old 快照）
operationStack.undo()

// 7. 重做操作（应用 new 快照）
operationStack.redo()
```

## 操作类型

### 添加操作 (add)
- old: 操作前的Scene快照
- new: 操作后的Scene快照（包含新添加的元素）

### 删除操作 (remove)
- old: 操作前的Scene快照（包含被删除的元素）
- new: 操作后的Scene快照

### 修改操作 (modify)
- old: 修改前的Scene快照
- new: 修改后的Scene快照

### 移动操作 (move)
- old: 移动前的Scene快照
- new: 移动后的Scene快照

### 场景变更操作 (scene_change)
- old: 变更前的Scene快照（可为null）
- new: 变更后的Scene快照

## VIEWTYPE 常量

```typescript
export const enum VIEWTYPE {
    VIEW = 'VIEW'
}
```

## ViewOptions 接口

```typescript
export interface ViewOptions<T extends object = any> {
    id?: string
    data?: T
    properties?: T
    onCreate?: () => void
    onAttach?: () => void
    onDestroy?: () => void
    [funcName: string]: any
}
```

## 优势

1. **页面级快照**: 使用Scene的完整JSON序列化，确保状态一致性
2. **状态驱动**: 通过快照状态切换实现 redo/undo，无需复杂的操作重放
3. **类型安全**: 基于TypeScript接口确保类型安全
4. **序列化集成**: 使用Serializer工具进行Scene的序列化和反序列化
5. **易于扩展**: 可以轻松添加新的操作类型
6. **性能优化**: 快照机制避免了复杂的操作重放逻辑
7. **完整状态**: 每次操作都保存完整的Scene状态，确保撤销/重做的准确性
8. **描述性**: 每个操作和快照都可以包含描述信息，便于调试和用户界面显示
