/**
 * Worker 端 SnapshotDiff 纯数据类型定义
 *
 * 设计原则：
 * - Worker 端不依赖主线程的类实例（View、Scene 等）
 * - 所有数据通过 Structured Clone 传输，使用纯 JSON 对象
 * - 输入：主线程将 before/after 快照传入
 * - 输出：Worker 返回变更属性列表（PropChange[]）
 */

// ─── 输入数据结构 ───

/**
 * View 快照数据（与 TransactionManager 中的 ViewSnapshot 对应）
 * 所有字段都是 toJSON() 后的纯数据
 */
export interface ViewSnapshotData {
    matrix?: any
    viewport?: any
    content?: any
    visible?: boolean
    freezed?: boolean
    style?: any
    data?: any
    properties?: any
    children?: any
    editable?: boolean
    verticalAlign?: any
}

/**
 * 单个 View 的 diff 请求
 */
export interface ViewDiffRequest {
    /** View 的唯一标识 */
    viewId: string
    /** 操作前的快照 */
    before: ViewSnapshotData
    /** 操作后的快照 */
    after: ViewSnapshotData
}

/**
 * SnapshotDiff Worker 任务的完整输入
 */
export interface SnapshotDiffInput {
    /** 需要对比的 View 列表（支持批量） */
    views: ViewDiffRequest[]
}

// ─── 输出数据结构 ───

/**
 * 单个属性的变更记录
 */
export interface PropChangeData {
    /** 属性路径，如 "matrix"、"content"、"children" */
    path: string
    /** 变更前的值（序列化后的纯数据） */
    before: any
    /** 变更后的值（序列化后的纯数据） */
    after: any
}

/**
 * 单个 View 的 diff 结果
 */
export interface ViewDiffResult {
    /** View 的唯一标识 */
    viewId: string
    /** 有变更的属性列表（空数组表示无变更） */
    changes: PropChangeData[]
}

/**
 * SnapshotDiff Worker 任务的完整输出
 */
export interface SnapshotDiffOutput {
    /** 所有 View 的 diff 结果 */
    results: ViewDiffResult[]
    /** 是否有任何变更 */
    hasChanges: boolean
}
