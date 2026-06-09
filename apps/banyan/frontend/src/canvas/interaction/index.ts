/**
 * canvas/interaction/ —— 编辑态交互状态机模块
 *
 * 从 @banyuan/banvasgl 迁移而来。
 * banvasgl 只提供原子事件契约（类型定义），状态机作为上层编辑策略由应用层维护。
 */

export { InteractionStateMachine } from './InteractionStateMachine'
export { resolveActivationTarget } from './resolveActivationTarget'
export type * from './types'
