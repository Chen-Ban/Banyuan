/**
 * @banyuan/runtime
 *
 * BanvasGL 运行时包 —— Web 平台适配层
 *
 * 提供运行态 hook，供两类消费方使用：
 *   1. 低代码平台内的"预览"模式（通过 banvasgl re-export 透传）
 *   2. scaffold 打包后的独立运行时应用（直接依赖本包）
 *
 * 未来：小程序适配层、Native 适配层将在此处分叉。
 */

import useRuntimeBanvas from './hooks/useRuntimeBanvas'

// ── 运行态 hook ──
export { useRuntimeBanvas }
export { useRuntimeCanvasInit } from './hooks/useRuntimeCanvasInit'

// ── 类型 ──
export type {
    UseRuntimeBanvasOptions,
    UseRuntimeBanvasResult,
    SerializedPageJSON,
} from './hooks/useRuntimeBanvas'
export type {
    UseRuntimeCanvasOptions,
    UseRuntimeCanvasInitResult,
} from './hooks/useRuntimeCanvasInit'

// default export（scaffold 生成的 App.tsx 使用 import useRuntimeBanvas from '@banyuan/runtime'）
export default useRuntimeBanvas
