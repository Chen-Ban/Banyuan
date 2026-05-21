import type { WorkerHandler, WorkerHandlerResult, WorkerResult, WorkerTask } from './types.js'
import { textLayoutHandler, graphIntersectionUnifiedHandler, trajectorySampleHandler, snapshotDiffHandler } from './handlers/index.js'

/**
 * WorkerRuntime 在 Web Worker 环境中运行
 */

const handlers: Map<string, WorkerHandler<any, any>> = new Map();

handlers.set('text/layout', textLayoutHandler);
handlers.set('graph/intersection', graphIntersectionUnifiedHandler);
handlers.set('graph/trajectory', trajectorySampleHandler);
handlers.set('scene/diff', snapshotDiffHandler);

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

  const transferables = result.buffers ?? [];
  ctx.postMessage(result, transferables);
};

ctx.onerror = (event: ErrorEvent) => {
  console.error('Worker runtime error:', event);
};
