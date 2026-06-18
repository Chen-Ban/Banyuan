/**
 * @banyuan/banvasgl/flow —— 领域专用声明式解释器（v2.1.0）
 *
 * Flow 本质上是对 JavaScript 的更高层抽象——一个面向低代码场景的
 * 领域专用解释器（domain-specific declarative interpreter）。
 *
 * 在 BanvasGL 分层架构中的位置：
 * `types` → `foundation`（含 flow） → `graph` → `view` → `engine`
 *
 * FlowSchema（nodes + entry）  ≈ AST（抽象语法树）
 *     ↓
 * NodeExecutor（registry）     ≈ 操作语义
 *     ↓
 * FlowRunner（FrameStack + cap） ≈ 运行时环境
 *
 * 架构演进（v2.1.0）：
 * - 统一执行器模型：所有 NodeKind 均通过 `ExecutorRegistry` 分发，
 *   Runner 退化为纯编排外壳（帧栈 / 缓存 / 错误恢复 / 步数限制）
 * - Executor 负责数据产出 + `nextNodeId` 决策；
 *   Runner 负责 ID→节点映射 / 缓存 / 错误恢复
 * - Control/Function 节点不再硬编码在 Runner，转为独立 executor
 * - `ExecutorRegistry` 从 Record 升级为映射类型 `{ [K in NodeKind]?: NodeExecutor<NodeForKind<K>, C> }`，
 *   消除 executor 函数签名中的 as 断言
 *
 * v2.0.0 核心变更：
 * - Push-Pull 混合调度（Push 沿 next 字段，Pull 沿 DataRef）
 * - 边消解为节点内嵌引用：`next` 字段承载控制流，`DataRef` 承载数据依赖
 * - 节点五分：control / action / source / compute / function
 * - 顶层开放 DAG（显式 entry，next 为空字符串即结束）
 * - 子图可调用闭包（Function/Loop 内嵌 FlowSchema body）
 * - 上下文分层：`FrameRecord.in` / `FrameRecord.local`（帧内变量）
 *   + `FlowRunner.cap`（全局能力代理）
 * - `SlotValue = unknown | DataRef`（槽值：内联字面量或跨节点引用）
 *
 * 子路径导出（通过 package.json exports）：
 * - `@banyuan/banvasgl` — Flow 类型 + 核心引擎
 * - `@banyuan/banvasgl/flow/client` — 前端 FlowRunner 预设工厂
 * - `@banyuan/banvasgl/flow/server` — 后端 FlowRunner 预设工厂
 * 不存在公开的 `./flow` 子路径——内部组件不对外暴露。
 */

// 类型
export * from '@/types/foundation/flow/index.js'

// 运行时
export { FlowRunner } from './FlowRunner/index.js'
export type { IFrameStack, IFlowRunner, CapProxy, FrontendCapProxy, BackendCapProxy } from './context/index.js'
export { FrameStack } from './context/index.js'

// 执行器类型
export type { NodeExecutor, NodeEvalResult } from '@/types/foundation/flow/executor.js'

// 执行器（按需导入）
export { sourceExecutor } from './executors/source.js'
export { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from './executors/compute.js'
export { setVariableExecutor, setViewDataExecutor, setViewVisibleExecutor, playAnimationExecutor, navigateExecutor, cloudFunctionExecutor, httpRequestExecutor, dbQueryExecutor, dbInsertExecutor, dbUpdateExecutor, dbDeleteExecutor } from './executors/action.js'
export { conditionExecutor, loopExecutor, parallelExecutor, returnExecutor } from './executors/control.js'
export { functionExecutor } from './executors/function.js'
