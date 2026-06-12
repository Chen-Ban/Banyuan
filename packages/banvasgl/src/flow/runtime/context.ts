/**
 * FlowContext —— 流程执行的运行时环境
 *
 * 采用 C16 的三分模型（in / state / cap），与调度方式正交。
 * cap 仅 action 节点执行器可见，值节点只读 {in, state}。
 */

/** 挂载点上下文（由挂载点描述符提供） */
export interface MountContext {
  in: Record<string, unknown>
  state: {
    view: Record<string, Record<string, unknown>>
    page: Record<string, unknown>
    app: Record<string, unknown>
    flow: Record<string, unknown>
  }
  cap: Record<string, unknown>
}

/** 前端能力代理 */
export interface FrontendCapProxy {
  navigate(target: string, params?: Record<string, unknown>): Promise<void>
  callFlow(functionId: string, args: Record<string, unknown>): Promise<unknown>
  persist(key: string, value: unknown): Promise<void>
}

/** 后端能力代理 */
export interface BackendCapProxy {
  db: {
    query(coll: string, filter: object): Promise<{ rows: unknown[]; count: number }>
    insert(coll: string, doc: object): Promise<{ id: string }>
    update(coll: string, filter: object, update: object): Promise<{ matched: number; modified: number }>
    delete(coll: string, filter: object): Promise<{ deleted: number }>
  }
  httpClient: {
    request(method: string, url: string, headers?: object, body?: unknown): Promise<{
      status: number; body: unknown; headers: object
    }>
  }
}

export type CapProxy = FrontendCapProxy | BackendCapProxy

/** 分层状态代理 */
export interface StateProxy {
  view: Record<string, Record<string, unknown>>
  page: Record<string, unknown>
  app: Record<string, unknown>
  flow: Record<string, unknown>
}

/** 运行时上下文帧 */
export interface ContextFrame {
  in: Readonly<Record<string, unknown>>
  state: StateProxy
  cap: CapProxy

  /** 压入新作用域帧（块级：继承外层 in，叠入 extraIn） */
  pushScope(extraIn: Record<string, unknown>): ContextFrame

  /** 压入隔离作用域帧（subFlow 专有：不继承外层 in/state） */
  pushIsolatedScope(opts: { in: Record<string, unknown>; state: Partial<StateProxy> }): ContextFrame

  /** 深拷贝 state（用于 parallel all/allSettled 分支隔离） */
  snapshot(): ContextFrame
}

/** 简单帧实现 */
class ContextFrameImpl implements ContextFrame {
  constructor(
    public readonly in_: Readonly<Record<string, unknown>>,
    public readonly state: StateProxy,
    public readonly cap: CapProxy,
  ) {}

  get in(): Readonly<Record<string, unknown>> { return this.in_ }

  pushScope(extraIn: Record<string, unknown>): ContextFrame {
    return new ContextFrameImpl(
      { ...this.in_, ...extraIn },
      this.state,
      this.cap,
    )
  }

  pushIsolatedScope(opts: { in: Record<string, unknown>; state: Partial<StateProxy> }): ContextFrame {
    return new ContextFrameImpl(
      opts.in,
      {
        view: opts.state.view ?? {},
        page: opts.state.page ?? {},
        app: opts.state.app ?? {},
        flow: opts.state.flow ?? {},
      },
      this.cap,
    )
  }

  snapshot(): ContextFrame {
    return new ContextFrameImpl(
      { ...this.in_ },
      JSON.parse(JSON.stringify(this.state)),
      this.cap,
    )
  }

  static fromMount(mount: MountContext): ContextFrame {
    return new ContextFrameImpl(mount.in, mount.state, mount.cap as CapProxy)
  }
}

export { ContextFrameImpl as ContextFrame }

/** 按路径从上下文取值 */
export function contextGet(
  path: string,
  ctxIn: Record<string, unknown>,
  ctxState: StateProxy,
): unknown {
  const [root, ...rest] = path.split('.')
  if (root === 'in') return deepGet(ctxIn, rest)
  if (root === 'state') {
    const [layer, ...rest2] = rest
    const target = (ctxState as any)[layer]
    if (!target) return undefined
    return deepGet(target, rest2)
  }
  throw new Error(`Invalid context path root: ${root}`)
}

function deepGet(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current == null) return undefined
    current = (current as any)[key]
  }
  return current
}
