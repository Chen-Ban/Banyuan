import { v4 as uuidv4 } from 'uuid'
import { WorkerExecutor, getDefaultWorkerExecutor } from './WorkerExecutor.js'
import type { WorkerResult, WorkerTask, WorkerTaskType } from './types.js'

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

let globalWorkerManager: WorkerManager | null = null;

export function getGlobalWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}
