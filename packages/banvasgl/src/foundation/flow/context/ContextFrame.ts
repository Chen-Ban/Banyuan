/**
 * ContextFrame —— 上下文帧
 *
 * 三层架构：
 *   vars.in   — 只读入参
 *   vars.local — 可读写临时变量
 *   state     — 共享区
 *   cap       — 能力区（始终共享）
 *
 * copy() 创建空白子帧，值通过 FrameStack 作用域链向上查找。
 */

import type { CapProxy, Vars, State, IRuntimeContext } from '@/types/foundation/flow/context.js'

export class ContextFrame implements IRuntimeContext {
  readonly vars: Vars;
  readonly state: State;
  readonly cap: CapProxy;

  constructor(
    vars: Vars,
    state: State,
    cap: CapProxy,
  ) {
    this.vars = vars;
    this.state = state;
    this.cap = cap;
  }

  /** 按路径从上下文取值（不跨帧） */
  get(path: string): unknown {
    let current: unknown = this
    for (const key of path.split('.')) {
      if (current == null) return undefined
      current = (current as any)[key]
    }
    return current
  }

  /** 创建子帧。vars 默认空，state 默认继承父帧 */
  copy(opts?: {
    vars?: Vars;
    state?: State;
  }): ContextFrame {
    return new ContextFrame(
      opts?.vars ?? { in: {}, local: {} },
      opts?.state ?? this.state,
      this.cap,
    )
  }
}
