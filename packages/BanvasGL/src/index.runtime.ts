/**
 * banvasgl — 运行时入口
 *
 * 只包含运行一个已打包应用所需的最小集合：
 *   - core（App、Scene、Camera、Renderer、Graph、Animation 等）
 *   - useRuntimeBanvas / useCanvasInit（运行态 React hook）
 *
 * 不包含：
 *   - 编辑态 hook（useDesignBanvas）
 *   - 流程态 hook（useFlowBanvas）
 *   - Worker 相关（WorkerExecutor、WorkerManager 等）
 *
 * 消费方：
 *   import useRuntimeBanvas from 'banvasgl/runtime'
 */

import useRuntimeBanvas from './hook/useRuntimeBanvas'

export * from './core'
export { useRuntimeBanvas }
export { useCanvasInit } from './hook/useCanvasInit'
export type { UseRuntimeBanvasOptions, UseRuntimeBanvasResult } from './hook/useRuntimeBanvas'
export type { UseCanvasOptions, UseCanvasInitResult, SerializedPageJSON } from './hook/useCanvasInit'

// default export 供 `import useRuntimeBanvas from 'banvasgl/runtime'` 使用
export default useRuntimeBanvas
