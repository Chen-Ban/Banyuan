// 计算任务与结果类型定义

export type WorkerTaskType =
  | "generic"
  | "text/layout"
  | "graph/intersection"
  | "graph/trajectory"
  | "scene/diff"
  | "custom";

/**
 * Worker 任务消息
 * - payload: 业务数据（已序列化为纯对象，可被 Structured Clone）
 * - transferables: 需要零拷贝传输的 ArrayBuffer 列表
 */
export interface WorkerTask<TPayload = any> {
  id: string;
  type: WorkerTaskType;
  payload: TPayload;
  /** 需要零拷贝传输的 ArrayBuffer（由上层从 ITransferable 对象中提取） */
  buffers?: ArrayBuffer[];
  /** 由上层可选指定一个来源标识（场景/容器/视图ID等），用于调试和统计 */
  sourceId?: string;
}

/**
 * Worker 返回结果
 * - result: 计算结果（已序列化为纯对象）
 * - buffers: 需要归还主线程的 ArrayBuffer
 */
export interface WorkerResult<TResult = any> {
  id: string;
  type: WorkerTaskType;
  result: TResult;
  /** 需要归还主线程的 ArrayBuffer（零拷贝回传） */
  buffers?: ArrayBuffer[];
  error?: string;
}

export type WorkerHandler<TPayload = any, TResult = any> = (
  payload: TPayload,
  buffers?: ArrayBuffer[]
) => WorkerHandlerResult<TResult> | Promise<WorkerHandlerResult<TResult>>;

/**
 * Handler 返回值，支持同时返回计算结果和需要回传的 buffer
 */
export interface WorkerHandlerResult<TResult = any> {
  result: TResult;
  /** 需要 transfer 回主线程的 ArrayBuffer */
  buffers?: ArrayBuffer[];
}
