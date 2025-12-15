import { WorkerManager } from "./WorkerManager";
import { WorkerExecutor } from "./WorkerExecutor";

// 全局单例实例
let globalWorkerManager: WorkerManager | null = null;

/**
 * 初始化全局 WorkerManager。
 * 一般在应用初始化阶段调用一次即可。
 */
export function initGlobalWorkerManager(executor?: WorkerExecutor): WorkerManager {
  if (globalWorkerManager) {
    console.warn("Global WorkerManager already initialized. Replacing previous instance.");
  }
  globalWorkerManager = new WorkerManager(executor);
  return globalWorkerManager;
}

/**
 * 获取全局 WorkerManager，如果未初始化则懒加载一个默认实例。
 * 这样可以保证“随用随取”，减少接入成本。
 */
export function getGlobalWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}

/**
 * 销毁全局 WorkerManager 实例。
 */
export function destroyGlobalWorkerManager(): void {
  globalWorkerManager = null;
}

/**
 * 全局 WorkerManager 是否已初始化。
 */
export function isGlobalWorkerManagerInitialized(): boolean {
  return globalWorkerManager !== null;
}

export { WorkerManager };
