/**
 * Worker 模块类型定义
 *
 * WorkerTaskType / WorkerTask / WorkerResult 已迁移至 @/core/interfaces/IWorker，
 * 此处重新导出供 workers 模块内部文件继续使用 './types' 路径。
 *
 * WorkerHandler / WorkerHandlerResult 仅在 workers 内部使用，保留在此。
 */

// 从 interfaces 重新导出公共类型
export type {
  WorkerTaskType,
  WorkerTask,
  WorkerResult,
} from '@/core/interfaces'

/**
 * Worker 任务处理函数类型
 */
export type WorkerHandler<TPayload = any, TResult = any> = (
  payload: TPayload,
  buffers?: ArrayBuffer[]
) => WorkerHandlerResult<TResult> | Promise<WorkerHandlerResult<TResult>>

/**
 * Handler 返回值，支持同时返回计算结果和需要回传的 buffer
 */
export interface WorkerHandlerResult<TResult = any> {
  result: TResult
  /** 需要 transfer 回主线程的 ArrayBuffer */
  buffers?: ArrayBuffer[]
}
