/**
 * @banyuan/sdk — Banyan 低代码平台统一入口（伞包）
 *
 * 全量导出所有子包的公共 API：
 *   - @banyuan/canvas（核心 2D 图形引擎）
 *   - @banyuan/canvas-runtime（运行态 React Hook）
 *   - @banyuan/canvas-design（编辑态 React Hook + Worker）
 *   - @banyuan/flow-design（流程图编辑器）
 *
 * 使用方式：
 *   import { App, useDesignBanvas, useRuntimeBanvas } from '@banyuan/sdk'
 *
 * 或按子路径精细导入：
 *   import { App } from '@banyuan/sdk/core'
 *   import { useDesignBanvas } from '@banyuan/sdk/design'
 */

export * from './core.js'
export * from './runtime.js'
export * from './design.js'
export * from './flow.js'
