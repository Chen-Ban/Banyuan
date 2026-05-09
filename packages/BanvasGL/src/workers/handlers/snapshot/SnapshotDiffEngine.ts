/**
 * SnapshotDiffEngine - Worker 端快照差分计算引擎
 *
 * 核心职责：对比 before/after 快照，找出有变更的属性。
 *
 * 计算密集点：
 * - 对 content、children 等大型嵌套对象做 JSON.stringify 生成字符串
 * - 字符串比较判断是否有变更
 *
 * 在大型场景中（复杂图形、深层嵌套子视图），content 和 children 的
 * JSON.stringify 可能产生数十 KB 甚至数 MB 的字符串，这是主线程阻塞的主要来源。
 * 将此计算放到 Worker 中可以避免阻塞用户交互。
 *
 * 优化策略：
 * 1. 快速路径：对简单值类型（boolean）直接 === 比较，跳过 stringify
 * 2. 引用相等检测：如果 before[path] === after[path]（同一引用），跳过
 * 3. null/undefined 快速判断：一边为空另一边不为空，直接判定为变更
 * 4. 按属性大小排序：先比较小属性（matrix、viewport），后比较大属性（content、children）
 *    这样如果只有小属性变了，可以快速完成
 */

import type {
    SnapshotDiffInput,
    SnapshotDiffOutput,
    ViewDiffRequest,
    ViewDiffResult,
    ViewSnapshotData,
    PropChangeData,
} from './types'

/**
 * 需要对比的属性路径列表
 * 顺序按照典型数据量从小到大排列，优化早期退出
 */
const SNAPSHOT_PATHS: (keyof ViewSnapshotData)[] = [
    // 简单值类型（直接 === 比较）
    'visible',
    'freezed',
    'editable',
    // 中等复杂度（对象但通常较小）
    'verticalAlign',
    'matrix',
    'viewport',
    'style',
    'data',
    // 高复杂度（可能非常大）
    'content',
    'children',
]

/** 简单值类型属性集合（可以用 === 直接比较） */
const SIMPLE_VALUE_PATHS = new Set<string>(['visible', 'freezed', 'editable'])

export default class SnapshotDiffEngine {
    /**
     * 执行批量快照差分计算
     */
    compute(input: SnapshotDiffInput): SnapshotDiffOutput {
        const results: ViewDiffResult[] = []
        let hasChanges = false

        for (const view of input.views) {
            const result = this.diffView(view)
            results.push(result)
            if (result.changes.length > 0) {
                hasChanges = true
            }
        }

        return { results, hasChanges }
    }

    /**
     * 对比单个 View 的 before/after 快照
     */
    private diffView(request: ViewDiffRequest): ViewDiffResult {
        const { viewId, before, after } = request
        const changes = this.diffSnapshots(before, after)
        return { viewId, changes }
    }

    /**
     * 对比两个快照对象，返回有变更的属性列表
     * 复刻 TransactionManager.diffSnapshots() 的逻辑，但带有优化
     */
    private diffSnapshots(before: ViewSnapshotData, after: ViewSnapshotData): PropChangeData[] {
        const changes: PropChangeData[] = []

        for (const path of SNAPSHOT_PATHS) {
            const bVal = before[path]
            const aVal = after[path]

            // 快速路径 1：两边都不存在（子类扩展字段）
            if (bVal === undefined && aVal === undefined) continue

            // 快速路径 2：简单值类型直接比较
            if (SIMPLE_VALUE_PATHS.has(path)) {
                if (bVal !== aVal) {
                    changes.push({ path, before: bVal, after: aVal })
                }
                continue
            }

            // 快速路径 3：一边为 null/undefined，另一边不是
            if ((bVal == null) !== (aVal == null)) {
                changes.push({ path, before: bVal, after: aVal })
                continue
            }

            // 快速路径 4：两边都为 null/undefined
            if (bVal == null && aVal == null) continue

            // 完整比较：JSON.stringify 后字符串对比
            const bStr = JSON.stringify(bVal)
            const aStr = JSON.stringify(aVal)
            if (bStr !== aStr) {
                changes.push({ path, before: bVal, after: aVal })
            }
        }

        return changes
    }
}
