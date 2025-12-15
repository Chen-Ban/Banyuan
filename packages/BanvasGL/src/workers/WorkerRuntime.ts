import { WorkerHandler, WorkerResult, WorkerTask } from "./types";
import { textLayoutHandler, graphIntersectionUnifiedHandler, trajectorySampleHandler } from "./handlers";

/**
 * WorkerRuntime 在 Web Worker 环境中运行：
 * - 维护与主线程一致的 handler 映射
 * - 监听 message，执行计算后通过 postMessage 返回结果
 *
 * 注意：当前 handler 使用的 payload/result 中大量包含类实例，
 * 要真正把这些计算放到 worker 中，还需要一层序列化/反序列化逻辑。
 * 这里先实现完整的消息通道，后续可以在具体任务上按需接入。
 */

const handlers: Map<string, WorkerHandler<any, any>> = new Map();

// 注册与主线程相同的任务类型
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
    const data = await Promise.resolve(handler(task.payload));
    result = {
      id: task.id,
      type: task.type,
      result: data,
    };
  } catch (e: any) {
    result = {
      id: task.id,
      type: task.type,
      result: undefined,
      error: e?.message || String(e),
    };
  }

  ctx.postMessage(result);
};
