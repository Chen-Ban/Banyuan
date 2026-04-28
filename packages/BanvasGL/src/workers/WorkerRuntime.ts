import { WorkerHandler, WorkerHandlerResult, WorkerResult, WorkerTask } from "./types";
import { textLayoutHandler, graphIntersectionUnifiedHandler, trajectorySampleHandler } from "./handlers";

/**
 * WorkerRuntime 在 Web Worker 环境中运行：
 * - 维护 handler 映射
 * - 监听 message，将 payload 和 buffers 传给 handler
 * - handler 返回结果后通过 postMessage 回传，支持 Transferable 归还 buffer
 */

const handlers: Map<string, WorkerHandler<any, any>> = new Map();

handlers.set("text/layout", textLayoutHandler);
handlers.set("graph/intersection", graphIntersectionUnifiedHandler);
handlers.set("graph/trajectory", trajectorySampleHandler);

const ctx: any = self as any;

ctx.onmessage = async (event: MessageEvent<WorkerTask<any>>) => {
  const task = event.data;
  const handler = handlers.get(task.type);

  let result: WorkerResult<any>;

  if (!handler) {
    result = {
      id: task.id,
      type: task.type,
      result: undefined,
      error: `No handler registered for task type in worker: ${task.type}`,
    };
    ctx.postMessage(result);
    return;
  }

  try {
    const handlerResult: WorkerHandlerResult<any> = await Promise.resolve(
      handler(task.payload, task.buffers)
    );
    result = {
      id: task.id,
      type: task.type,
      result: handlerResult.result,
      buffers: handlerResult.buffers,
    };
  } catch (e: any) {
    result = {
      id: task.id,
      type: task.type,
      result: undefined,
      error: e?.message || String(e),
    };
  }

  // 如果 handler 返回了需要归还的 buffer，通过 Transferable 回传
  const transferables = result.buffers ?? [];
  ctx.postMessage(result, transferables);
};

ctx.onerror = (event: ErrorEvent) => {
  console.error('Worker runtime error:', event);
};
