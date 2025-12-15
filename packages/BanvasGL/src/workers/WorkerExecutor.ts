import { WorkerResult, WorkerTask } from "./types";

/**
 * 基于浏览器 Web Worker 的执行器实现。
 * 所有任务都会通过 Web Worker 执行（如果运行环境支持 Worker）。
 *
 * 具体的 handler 注册和实际计算逻辑在 `WorkerRuntime.ts` 中完成。
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

      // 依赖打包工具对 new URL(..., import.meta.url) 的支持（Vite/Rollup/Webpack5 等）
      this.worker = new Worker(new URL("./WorkerRuntime.ts", import.meta.url), {
        type: "module",
      });
    }

    this.worker.onmessage = (event: MessageEvent<WorkerResult<any>>) => {
      const result = event.data;
      const resolver = this.pending.get(result.id);
      if (resolver) {
        this.pending.delete(result.id);
        resolver(result);
      }
    };
  }

  public async execute<TPayload = any, TResult = any>(task: WorkerTask<TPayload>): Promise<WorkerResult<TResult>> {
    return new Promise<WorkerResult<TResult>>((resolve) => {
      this.pending.set(task.id, resolve as (r: WorkerResult<any>) => void);
      this.worker.postMessage(task);
    });
  }
}

/**
 * 默认执行器实例。
 * 在大多数场景下可以复用，仅当你需要完全自定义时才需要自己 new。
 */
export const defaultWorkerExecutor = new WorkerExecutor();
