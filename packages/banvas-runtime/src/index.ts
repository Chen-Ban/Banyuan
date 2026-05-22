/**
 * @banyuan/banvas-runtime —— 运行态统一接口层（平台无关契约）
 *
 * 本包定义所有平台适配需要实现的抽象接口，不包含具体实现。
 * 具体实现由各平台适配包提供：
 *   - @banyuan/banvas-runtime-web  — Web/React 实现（Canvas 2D + React Hook）
 *   - @banyuan/banvas-runtime-ios  — 未来 iOS 实现
 *   - @banyuan/banvas-runtime-desktop — 未来原生桌面实现
 *
 * 上层业务代码和其他引擎包（banvas-design、flow-design）依赖本包的类型，
 * 而非具体平台实现，从而实现平台解耦。
 */

// ── 类型与接口导出 ──
export type {
    SerializedPageJSON,
    IRuntimeCanvasOptions,
    IRuntimeCanvasResult,
    IRuntimeRendererAdapter,
    IRuntimePointerEvent,
    IRuntimeEventBridge,
    IRuntimeAdapter,
} from './types.js'

export { RuntimeEventType } from './types.js'

