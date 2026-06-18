import type { FlowSchema } from './schema.js'

/**
 * 流程上下文类型定义
 *
 * 分层架构：
 *   FrameRecord.in    — 只读入参（子图调用时传入，帧内只读）
 *   FrameRecord.local — 可读写临时变量（setVariable 写入，帧内可见）
 *   FlowRunner.cap    — 全局能力代理（整个执行链共享同一引用）
 *
 * 数据流通过 DataRef（节点输出 → 下游输入）显式传递，不通过隐式共享状态。
 */

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
  setViewData(viewId: string, key: string, value: unknown): void
  setViewVisible(viewId: string, visible: boolean): void
  playAnimation(viewId: string, animationId: string): void
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

/** 帧栈接口 */
export interface IFrameStack {
  /** 当前帧的只读入参（子图调用时传入） */
  readonly in: Readonly<Record<string, unknown>>
  /** 当前帧的可读写临时变量（setVariable 写入） */
  readonly local: Record<string, unknown>
  readonly nodes: Record<string, import('./index.js').FlowNode>
  readonly entry: string
  readonly returnRef: { value: Record<string, unknown> }
  readonly steps: number
  enter(inputs: Readonly<Record<string, unknown>>, schema: FlowSchema): void
  leave(): void
  /** 当前帧的节点输出缓存（stepNode 首次写入，后续同一帧内命中则直接返回） */
  getOutput(nodeId: string): { outputs?: Record<string, unknown>; error?: Error } | undefined
  setOutput(nodeId: string, result: { outputs?: Record<string, unknown>; error?: Error }): void
}

/** 流程执行器接口 */
export interface IFlowRunner {
  run(graph: FlowSchema): Promise<void>
}

/** 运行时执行上下文——FlowRunner 实现此接口供工具函数消费 */
export interface IRunnerCtx {
  /** 帧栈（含 nodes / returnRef / steps / outputCache） */
  stack: IFrameStack;
  /** 节点执行器注册表（stepNode 按 kind 查找执行器） */
  readonly executors: Record<string, import('../../../foundation/flow/executors/types.js').NodeEvaluator>;
  /** 全局能力代理（整个执行链共享同一引用，executor 通过此字段访问外部效应） */
  readonly cap: CapProxy;
}
