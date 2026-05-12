/**
 * @banyuan/runtime
 *
 * BanvasGL 运行时包 —— Web 平台适配层
 *
 * 当前阶段：re-export banvasgl 中的运行态 hook，
 * 作为独立包对外暴露，供打包后的独立运行时应用使用。
 *
 * 未来：小程序适配层、Native 适配层将在此处分叉。
 */

import useRuntimeBanvas from 'banvasgl'

export { useRuntimeBanvas }
export { useRuntimeCanvasInit } from 'banvasgl'

// 类型
export type {
    UseRuntimeBanvasOptions,
    UseRuntimeBanvasResult,
    SerializedPageJSON,
} from 'banvasgl'
export type {
    UseRuntimeCanvasOptions,
    UseRuntimeCanvasInitResult,
} from 'banvasgl'

// default export（scaffold 生成的 App.tsx 使用 import useRuntimeBanvas from 'banvasgl/runtime'）
export default useRuntimeBanvas
