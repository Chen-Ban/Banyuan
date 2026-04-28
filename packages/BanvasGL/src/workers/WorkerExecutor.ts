import { WorkerResult, WorkerTask } from "./types";

/**
 * 基于浏览器 Web Worker 的执行器实现。
 * 支持 Transferable 零拷贝传输：通过 postMessage 第二参数传递 ArrayBuffer。
 */
export class WorkerExecutor {
  private worker: Worker;
  private pending: Map<string, (result: WorkerResult<any>) => void> = new Map();

  constructor(worker?: Worker) {
    if (worker) {
      this.worker = worker;
    } else {
      if (typeof Worker === "undefined") {
        throw new Error("WorkerExecutor: Worker is not available in this environment.");
      }

      const workerUrl = new URL("./banvas-worker.mjs", import.meta.url).href;
      this.worker = new Worker(workerUrl, { type: "module" });
    }

    this.worker.onmessage = (event: MessageEvent<WorkerResult<any>>) => {
      const result = event.data;
      const resolver = this.pending.get(result.id);
      this.pending.delete(result.id);
      if (resolver) {
        resolver(result);
      } else {
        console.warn(`No pending resolver found for task id: ${result.id}`);
      }
    };
  }

  /**
   * 执行一个 Worker 任务。
   * task.buffers 中的 ArrayBuffer 会通过 Transferable 零拷贝传输到 Worker，
   * 传输后这些 buffer 在主线程中将被 detach（不可用）。
   */
  public async execute<TPayload = any, TResult = any>(
    task: WorkerTask<TPayload>
  ): Promise<WorkerResult<TResult>> {
    return new Promise<WorkerResult<TResult>>((resolve) => {
      this.pending.set(task.id, resolve as (r: WorkerResult<any>) => void);
      // 提取 transferable 的 ArrayBuffer 列表
      const transferables = task.buffers ?? [];
      this.worker.postMessage(task, transferables);
    });
  }
}

// 全局单例执行器实例
let defaultWorkerExecutorInstance: WorkerExecutor | null = null;

export function getDefaultWorkerExecutor(): WorkerExecutor {
  if (!defaultWorkerExecutorInstance) {
    defaultWorkerExecutorInstance = new WorkerExecutor();
  }
  return defaultWorkerExecutorInstance;
}
