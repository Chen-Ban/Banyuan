/**
 * @banyuan/banvasgl/flow —— 领域专用声明式解释器（v2.0.0）
 *
 * Flow 本质上是对 JavaScript 的更高层抽象——一个面向低代码场景的
 * 领域专用解释器（domain-specific declarative interpreter）。
 *
 * v2.0.0 核心变更：
 *   - Push-Pull 混合调度（Push 沿 ControlEdge，Pull 沿 DataEdge）
 *   - 边二分：ControlEdge（串执行顺序）+ DataEdge（连端口到插槽）
 *   - 节点五分：control/action/function/source/compute（调度行为 + 作用域封装派生）
 *   - 顶层开放 DAG（显式 entry，控制边出度 0 即结束）
 *   - 子图可调用闭包（显式 subEntry + subExit）
 *   - 上下文三分：in / state / cap（与调度正交）
 *   - SlotValue = unknown | DataRef（槽值：内联字面量或边引用）
 */

// 类型
export * from '@/types/foundation/flow/index.js'

// 运行时
export { FlowRunner } from './FlowRunner/index.js'
export type { FlowEnv, IRuntimeContext, IFrameStack, IFlowRunner, CapProxy, FrontendCapProxy, BackendCapProxy, Vars, State } from './context/index.js'
export { ContextFrame, FrameStack } from './context/index.js'

// 执行器类型
export type { NodeExecutor, NodeExecResult } from './executors/types.js'

// 执行器（按需导入）
export { sourceExecutor } from './executors/source.js'
export { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from './executors/compute.js'
export { setVariableExecutor, navigateExecutor, cloudFunctionExecutor } from './executors/action-client.js'
export { httpRequestExecutor, dbQueryExecutor, dbInsertExecutor, dbUpdateExecutor, dbDeleteExecutor } from './executors/action-server.js'
