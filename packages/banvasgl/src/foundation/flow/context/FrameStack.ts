/**
 * FrameStack —— 二维帧栈
 */

import type { CapProxy, State, IRuntimeContext, IFrameStack } from '@/types/foundation/flow/context.js'
import { ContextFrame } from './ContextFrame.js'

type FrameLayer = IRuntimeContext[]

export class FrameStack implements IFrameStack {
  private layers: FrameLayer[];

  constructor() {
    this.layers = [];
  }

  get frame(): IRuntimeContext {
    if (this.layers.length === 0) throw new Error("FrameStack: no frames — call enter() first");
    return this.layers[this.layers.length - 1][0];
  }

  get depth(): number {
    return this.layers.length;
  }

  get vars() { return this.frame.vars; }
  get state(): State { return this.frame.state; }
  get cap(): CapProxy { return this.frame.cap; }

  get(path: string): unknown {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      for (const frame of this.layers[i]) {
        const val = frame.get(path);
        if (val !== undefined) return val;
      }
    }
    return undefined;
  }

  enter(frame: IRuntimeContext): void {
    this.layers.push([frame]);
  }

  enterParallel(frames: FrameLayer): void {
    this.layers.push(frames);
  }

  leave(): FrameLayer {
    return this.layers.pop()!;
  }
}
