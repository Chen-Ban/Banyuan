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

      // 使用单独打包出的 worker 入口文件（见 tsup.config.ts 中的 entry 配置）
      // dist 中会生成 dist/banvas-worker.mjs
      const workerUrl = new URL("./banvas-worker.mjs", import.meta.url).href;
      this.worker = new Worker(workerUrl, { type: "module" });
    }

    this.worker.onmessage = (event: MessageEvent<WorkerResult<any>>) => {
      const result = event.data;
      console.log("收到worker返回的信息", result);
      const resolver = this.pending.get(result.id);
      this.pending.delete(result.id);
      if (resolver) {
        resolver(result);
      } else {
        console.warn(`No pending resolver found for task id: ${result.id}`);
      }
    };
  }

  public async execute<TPayload = any, TResult = any>(task: WorkerTask<TPayload>): Promise<WorkerResult<TResult>> {
    return new Promise<WorkerResult<TResult>>((resolve) => {
      console.log("发送信息到worker");
      this.pending.set(task.id, resolve as (r: WorkerResult<any>) => void);
      this.worker.postMessage(task);
    });
  }
}

// 全局单例执行器实例
let defaultWorkerExecutorInstance: WorkerExecutor | null = null;

/**
 * 获取默认执行器实例（单例模式）。
 * 确保整个应用只创建一个 Worker，避免重复加载 worker 文件。
 *
 * 注意：使用函数而不是模块级常量，避免在模块导入时立即创建 Worker。
 * 只有在真正需要时才创建 Worker 实例。
 */
export function getDefaultWorkerExecutor(): WorkerExecutor {
  if (!defaultWorkerExecutorInstance) {
    defaultWorkerExecutorInstance = new WorkerExecutor();
  }
  return defaultWorkerExecutorInstance;
}
