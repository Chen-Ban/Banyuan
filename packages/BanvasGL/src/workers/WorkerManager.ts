import { v4 as uuidv4 } from "uuid";
import { WorkerExecutor, getDefaultWorkerExecutor } from "./WorkerExecutor";
import { WorkerResult, WorkerTask, WorkerTaskType } from "./types";

/**
 * WorkerManager 负责：
 * - 生成任务 ID
 * - 调用执行器执行任务
 * - 支持通过 buffers 参数传递 Transferable ArrayBuffer
 */
export class WorkerManager {
  private executor: WorkerExecutor;

  constructor(executor?: WorkerExecutor) {
    this.executor = executor ?? getDefaultWorkerExecutor();
  }

  /**
   * 提交一个计算任务。
   * @param type 任务类型
   * @param payload 业务数据（需为可 Structured Clone 的纯对象）
   * @param buffers 需要零拷贝传输的 ArrayBuffer 列表（可选）
   * @param sourceId 来源标识（可选）
   */
  public async compute<TPayload = any, TResult = any>(
    type: WorkerTaskType,
    payload: TPayload,
    buffers?: ArrayBuffer[],
    sourceId?: string
  ): Promise<WorkerResult<TResult>> {
    const task: WorkerTask<TPayload> = {
      id: uuidv4(),
      type,
      payload,
      buffers,
      sourceId,
    };
    return this.executor.execute<TPayload, TResult>(task);
  }
}

// 全局单例实例
let globalWorkerManager: WorkerManager | null = null;

export function getGlobalWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}
