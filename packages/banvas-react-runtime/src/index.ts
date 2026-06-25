/**
 * @banyuan/banvas-react-runtime — 运行策略层公共 API
 *
 * 承载运行态的：
 *   - 跨平台事件适配器（adapters）：平台原生事件 → InteractionInput
 *   - 高级交互识别器（interaction）：InteractionInput → IViewEvents 事件键
 *   - useRuntimeBanvas / useRuntimeInteraction hook
 *
 * 该包进入用户 ECS 产物，不进入 banyan 编辑器。
 */

// ── hook ──
export { useRuntimeBanvas } from './hook/useRuntimeBanvas.js'
export type { UseRuntimeOptions, UseRuntimeBanvasResult } from './hook/useRuntimeBanvas.js'
export { useRuntimeInteraction } from './hook/useRuntimeInteraction.js'
export type { UseRuntimeInteractionOptions } from './hook/useRuntimeInteraction.js'

// ── adapters（跨平台事件适配） ──
export type { EventAdapter, CoordinateTransform, EventAdapterOptions } from './adapters/index.js'
export { WebEventAdapter, createWebEventAdapter } from './adapters/index.js'
export type { WebEventAdapterOptions } from './adapters/index.js'

// ── interaction recognizers ──
export {
  InteractionRecognizer,
  type RecognizedInteraction,
  type RuntimeEventKey,
} from './interaction/index.js'
export { ClickRecognizer } from './interaction/index.js'
export { DragRecognizer, type DragRecognizerOptions } from './interaction/index.js'
