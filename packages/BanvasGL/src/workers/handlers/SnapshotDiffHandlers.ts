import { WorkerHandler, WorkerHandlerResult } from '@/workers/types'
import SnapshotDiffEngine from './snapshot/SnapshotDiffEngine'
import type { SnapshotDiffInput, SnapshotDiffOutput } from './snapshot/types'

/**
 * 快照差分 Worker Handler
 *
 * 职责：
 * 1. 接收主线程传来的 before/after 快照数据（批量 View）
 * 2. 对每个 View 的快照执行 JSON.stringify 对比
 * 3. 返回有变更的属性列表
 *
 * 性能优势：
 * - 大型场景中 content/children 的 JSON.stringify 可能产生数 MB 字符串
 * - 在 Worker 中执行避免阻塞主线程的渲染和交互
 * - 支持批量对比（一次事务可能涉及多个 View）
 *
 * 主线程使用方式：
 * 1. beginTransaction 时拍摄 beforeSnapshot（主线程，需要访问 View 实例）
 * 2. commitTransaction 时拍摄 afterSnapshot（主线程）
 * 3. 将 before/after 快照发送到 Worker 做 diff 计算
 * 4. 收到 diff 结果后构造 Operation 入栈
 */

// 引擎单例
let engine: SnapshotDiffEngine | null = null

function getEngine(): SnapshotDiffEngine {
    if (!engine) {
        engine = new SnapshotDiffEngine()
    }
    return engine
}

export const snapshotDiffHandler: WorkerHandler<
    SnapshotDiffInput,
    SnapshotDiffOutput
> = (payload): WorkerHandlerResult<SnapshotDiffOutput> => {
    const diffEngine = getEngine()
    const result = diffEngine.compute(payload)
    return { result }
}
