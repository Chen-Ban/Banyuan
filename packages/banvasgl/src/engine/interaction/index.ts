/**
 * interaction/ —— 交互状态机模块
 *
 * 纯逻辑层，零 React / 零 DOM 依赖。
 * 向外暴露 InteractionStateMachine 类和相关类型。
 */

export { InteractionStateMachine } from './InteractionStateMachine.js'
export { resolveActivationTarget } from './resolveActivationTarget.js'

// 类型从全局类型文件重导出
export type {
    InteractionState,
    InteractionInput,
    InteractionOutput,
    InteractionDelegate,
    InteractionStateMachineConfig,
    InteractionCapability,
    HoverTarget,
    IdleState,
    HoverState,
    PanningState,
    MovingState,
    ResizingState,
    RotatingState,
    ConnectingState,
    BoxSelectingState,
    TextSelectingState,
    EditingPointState,
    StateOfMode,
    PointerDownInput,
    PointerMoveInput,
    PointerUpInput,
    KeyDownInput,
    KeyUpInput,
} from '@/types/interaction'
