import type { FlowSchema } from './schema.js'

/**
 * 流程上下文类型定义
 *
 * 三层架构：
 *   vars  — 临时变量区（in: 只读入参, local: 可读写临时变量）
 *   state — 共享区（跨帧可变的应用状态）
 *   cap   — 能力区（外部效应句柄）
 */

/** 临时变量区 */
export interface Vars {
  in: Readonly<Record<string, unknown>>
  local: Record<string, unknown>
}

/** 应用共享状态 */
export interface State {
  view: Record<string, Record<string, unknown>>
  page: Record<string, unknown>
  app: Record<string, unknown>
}

/** 能力代理基类——两端通用 */
interface CapBase {
  httpClient: {
    request(method: string, url: string, headers?: object, body?: unknown): Promise<{
      status: number; body: unknown; headers: object
    }>
  }
}

/** 前端能力代理 */
export interface FrontendCapProxy extends CapBase {
  navigate(target: string, params?: Record<string, unknown>): Promise<void>
}

/** 后端能力代理 */
export interface BackendCapProxy extends CapBase {
  db: {
    query(coll: string, filter: object): Promise<{ rows: unknown[]; count: number }>
    insert(coll: string, doc: object): Promise<{ id: string }>
    update(coll: string, filter: object, update: object): Promise<{ matched: number; modified: number }>
    delete(coll: string, filter: object): Promise<{ deleted: number }>
  }
}

export type CapProxy = FrontendCapProxy | BackendCapProxy

/** 静态上下文（流程启动时注入初始 state） */
export interface FlowEnv {
  state: State
}

/** 运行时上下文帧接口 */
export interface IRuntimeContext {
  readonly vars: Vars
  readonly state: State
  readonly cap: CapProxy
  get(path: string): unknown
  copy(opts?: { vars?: Vars; state?: State }): IRuntimeContext
}

/** 帧栈接口 */
export interface IFrameStack {
  readonly frame: IRuntimeContext
  readonly depth: number
  enter(frame: IRuntimeContext): void
  enterParallel(frames: IRuntimeContext[]): void
  leave(): IRuntimeContext[]
  get(path: string): unknown
}

/** 流程执行器接口 */
export interface IFlowRunner {
  run(graph: FlowSchema, env: FlowEnv): Promise<void>
}

/** 运行时执行上下文——FlowRunner 实现此接口供工具函数消费 */
export interface IRunnerCtx {
  nodes: Record<string, import('./index.js').FlowNode>;
  stack: IFrameStack;
  executed: Set<string>;
  outputs: Map<string, Record<string, unknown>>;
  returnRef: { value: Record<string, unknown> };
  steps: number;
  execute: (node: import('./index.js').FlowNode) => Promise<import('./index.js').FlowNode | null>;
}
