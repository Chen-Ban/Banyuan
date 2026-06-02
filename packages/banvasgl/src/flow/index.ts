/**
 * @banyuan/banvasgl/flow —— 流程引擎主入口
 *
 * 导出核心运行时 + 类型 + 执行器注册表
 * 预组装 preset 通过子路径导入：
 *   import { createClientFlowRunner } from '@banyuan/banvasgl/flow/client'
 *   import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server'
 */

// 类型
export * from './types/index.js'

// 运行时
export { FlowRunner } from './runtime/FlowRunner.js'
export { resolveValue } from './runtime/resolveValue.js'
export type { FlowContext } from './runtime/context.js'

// 执行器注册表
export { NodeExecutorRegistry } from './executors/registry.js'
export type { NodeExecutor } from './executors/registry.js'

// 执行器（按需导入）
export * from './executors/shared/index.js'
export * from './executors/client/index.js'
export * from './executors/server/index.js'
