// workers 统一对外出口
// 使用方式：
//   import { getGlobalWorkerManager, WorkerTaskType } from "@/workers";
//   const manager = getGlobalWorkerManager();
//   const result = await manager.compute("text/layout", payload);

export * from "./types";
export * from "./WorkerExecutor";
export * from "./WorkerManager";
export * from "./global";
export * from "./handlers";
