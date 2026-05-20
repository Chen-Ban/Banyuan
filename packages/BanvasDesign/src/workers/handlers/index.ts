/**
 * Worker Handlers 占位入口
 *
 * Workers 的实际 handler 实现（TextLayout、GraphIntersection、Trajectory、SnapshotDiff）
 * 依赖 BanvasGL 内部的 Serializer、DenseTrajectory 等模块，
 * 在 Worker 线程中需要被完整打包。
 *
 * 当前阶段，handlers 仍保留在 BanvasGL 的 workers/ 目录中，
 * BanvasDesign 仅导出 WorkerManager / WorkerExecutor 作为任务提交接口。
 *
 * TODO: Phase 3.5 - 将 handlers 完整迁移到 BanvasDesign
 */

// 这些类型从 @banyuan/canvas 重新导出，供 WorkerRuntime 编译使用
export type { WorkerHandler, WorkerHandlerResult } from '../types.js'

// 占位导出——实际 handler 仍由 @banyuan/canvas 的 worker bundle 提供
export const textLayoutHandler: any = () => { throw new Error('Not implemented in banvas-design stub') }
export const graphIntersectionUnifiedHandler: any = () => { throw new Error('Not implemented in banvas-design stub') }
export const trajectorySampleHandler: any = () => { throw new Error('Not implemented in banvas-design stub') }
export const snapshotDiffHandler: any = () => { throw new Error('Not implemented in banvas-design stub') }
