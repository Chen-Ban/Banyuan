/**
 * @banyuan/banyan-sdk — Banyan 低代码平台统一入口（伞包）
 *
 * 全量导出所有子包的公共 API：
 *   - @banyuan/banvasgl（核心 2D 图形引擎）
 *   - @banyuan/banvas-runtime（运行态统一接口层）
 *   - @banyuan/banvas-runtime-web（运行态 Web 平台适配）
 *   - @banyuan/banvas-design（编辑态 React Hook + Worker）
 *   - @banyuan/flow-design（流程图编辑器）
 *
 * 使用方式：
 *   import { App, useDesignBanvas, useRuntimeBanvas } from '@banyuan/banyan-sdk'
 */

export * from '@banyuan/banvasgl'
export * from '@banyuan/banvas-runtime'
export {
    useCanvasInit,
    useRuntimeBanvas,
    useRuntimeEvents,
} from '@banyuan/banvas-runtime-web'
export type {
    UseCanvasOptions,
    UseCanvasInitResult,
    UseRuntimeBanvasOptions,
    UseRuntimeBanvasResult,
    UseRuntimeEventsOptions,
} from '@banyuan/banvas-runtime-web'
export * from '@banyuan/banvas-design'
export * from '@banyuan/flow-design'
export * from '@banyuan/flow'
