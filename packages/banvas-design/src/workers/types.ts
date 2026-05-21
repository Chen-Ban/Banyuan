/**
 * Worker 模块类型定义
 */

/**
 * Worker 任务类型枚举
 */
export type WorkerTaskType =
  | 'generic'
  | 'text/layout'
  | 'graph/intersection'
  | 'graph/trajectory'
  | 'scene/diff'
  | 'custom'

/**
 * Worker 任务消息
 */
export interface WorkerTask<TPayload = any> {
  id: string
  type: WorkerTaskType
  payload: TPayload
  buffers?: ArrayBuffer[]
  sourceId?: string
}

/**
 * Worker 返回结果
 */
export interface WorkerResult<TResult = any> {
  id: string
  type: WorkerTaskType
  result: TResult
  buffers?: ArrayBuffer[]
  error?: string
}

export type WorkerHandler<TPayload = any, TResult = any> = (
  payload: TPayload,
  buffers?: ArrayBuffer[]
) => WorkerHandlerResult<TResult> | Promise<WorkerHandlerResult<TResult>>

export interface WorkerHandlerResult<TResult = any> {
  result: TResult
  buffers?: ArrayBuffer[]
}
