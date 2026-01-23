import { v4 as uuidv4 } from "uuid";
import { WorkerExecutor, getDefaultWorkerExecutor } from "./WorkerExecutor";
import { WorkerResult, WorkerTask, WorkerTaskType } from "./types";

/**
 * WorkerManager 负责：
 * - 生成任务 ID
 * - 调用执行器执行任务
 */
export class WorkerManager {
  private executor: WorkerExecutor;

  constructor(executor?: WorkerExecutor) {
    // 如果没有传入 executor，使用全局单例，确保整个应用只有一个 Worker 实例
    this.executor = executor ?? getDefaultWorkerExecutor();
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
    return this.executor.execute<TPayload, TResult>(task);
  }
}

// 全局单例实例
let globalWorkerManager: WorkerManager | null = null;

/**
 * 获取全局 WorkerManager，如果未初始化则懒加载一个默认实例。
 * 这样可以保证“随用随取”，减少接入成本。
 */
export function getGlobalWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    console.log("新建workermanager");
    globalWorkerManager = new WorkerManager();
  }
  console.log("获取全局workermanager");

  return globalWorkerManager;
}
