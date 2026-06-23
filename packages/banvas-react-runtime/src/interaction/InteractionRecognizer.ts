/**
 * 高级交互识别器基类
 *
 * 识别器只消费 banvasgl 的原子事件（pointerdown/move/up），
 * 识别成高级交互后回调 emit。命中 View 与 triggerSchema 派发由 useRuntimeInteraction 统一处理。
 */

import type { IViewEvents } from "@banyuan/banvasgl";

/** 识别结果指向 IViewEvents 的某个键 */
export type RuntimeEventKey = keyof IViewEvents;

export interface RecognizedInteraction {
  eventKey: RuntimeEventKey;
  clientX: number;
  clientY: number;
  payload?: unknown;
}

export abstract class InteractionRecognizer {
  constructor(protected emit: (r: RecognizedInteraction) => void) {}
  abstract onPointerDown(clientX: number, clientY: number, button: number): void;
  abstract onPointerMove(clientX: number, clientY: number): void;
  abstract onPointerUp(clientX: number, clientY: number): void;
  abstract reset(): void;
}
