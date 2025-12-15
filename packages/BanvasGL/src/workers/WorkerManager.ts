import { v4 as uuidv4 } from "uuid";
import { WorkerExecutor, defaultWorkerExecutor } from "./WorkerExecutor";
import { WorkerResult, WorkerTask, WorkerTaskType } from "./types";

/**
 * WorkerManager 负责：
 * - 生成任务 ID
 * - 调用执行器执行任务
 * - 维护最近一次结果，方便渲染管线中的任意位置快速读取
 */
export class WorkerManager {
  private executor: WorkerExecutor;

  /**
   * 最近一次任务结果缓存，按 task.type 分类。
   * - key: WorkerTaskType
   * - value: WorkerResult
   */
  private lastResults: Map<WorkerTaskType, WorkerResult<any>> = new Map();

  constructor(executor: WorkerExecutor = defaultWorkerExecutor) {
    this.executor = executor;
  }

  /**
   * 提交一个计算任务。
   * 渲染管线中任意容器/视图/事件回调都可以调用。
   */
  public async compute<TPayload = any, TResult = any>(
    type: WorkerTaskType,
    payload: TPayload,
    sourceId?: string
  ): Promise<WorkerResult<TResult>> {
    const task: WorkerTask<TPayload> = {
      id: uuidv4(),
      type,
      payload,
      sourceId,
    };

    const result = await this.executor.execute<TPayload, TResult>(task);
    this.lastResults.set(type, result);
    return result as WorkerResult<TResult>;
  }

  /**
   * 读取指定类型任务的最近一次结果，不触发新的计算。
   * 用于在渲染/事件回调中“实时取得最新计算结果”。
   */
  public getLastResult<TResult = any>(type: WorkerTaskType): WorkerResult<TResult> | null {
    const res = this.lastResults.get(type) || null;
    return res as WorkerResult<TResult> | null;
  }

  /**
   * 清空指定类型任务的缓存结果。
   */
  public clearLastResult(type: WorkerTaskType): void {
    this.lastResults.delete(type);
  }

  /**
   * 清空所有类型任务的缓存结果。
   */
  public clearAllResults(): void {
    this.lastResults.clear();
  }
}
