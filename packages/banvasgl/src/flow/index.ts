/**
 * @banyuan/banvasgl/flow —— 领域专用声明式解释器
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计哲学
 * ═══════════════════════════════════════════════════════════════════
 *
 * Flow 本质上是对 JavaScript 的更高层抽象——一个面向低代码场景的
 * 领域专用解释器（domain-specific declarative interpreter）。
 *
 * 类比编译原理，它的三层结构可以这样理解：
 *
 *   FlowSchema（nodes + edges）  ≈ AST（抽象语法树）
 *       ↓
 *   NodeExecutor（registry 中注册）≈ 操作语义（operational semantics）
 *       ↓
 *   FlowContext（env + 变量表）   ≈ 运行时环境（runtime environment）
 *
 * 这套设计的核心取舍是：用户的「代码」必须满足三个约束——
 *   1. 可序列化（JSON 持久化、网络传输）
 *   2. AI 可生成（结构化 schema 比自由文本更容易生成和验证）
 *   3. 可视化可编辑（节点图天然映射为画布上的连线）
 *
 * 正因为这三个约束，我们不能直接用 JS/TS——我们需要一层声明式的
 * schema 把控制流（condition/loop/delay）和副作用（navigate/dbQuery）
 * 封装为可序列化的数据结构，再通过 context 注入不同平台的实际能力。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 三层设计质量准则
 * ═══════════════════════════════════════════════════════════════════
 *
 * 每一层有各自的「合格标准」：
 *
 * 1. Schema 层 —— 流程控制的完备集
 *    Schema 必须能表达所有必要的控制流原语（顺序/条件/循环/延迟/子流程），
 *    确保用户不会因为「某种流程写不出来」而被迫逃逸到代码。
 *    完备性是 schema 层的核心指标。
 *
 * 2. Context 层 —— 作用域设计（最核心的设计问题）
 *    Context 必须完整包含流程执行所需的一切内容（变量、事件参数、环境能力）。
 *    关键问题是 scope 的粒度——作用域有多大、变量在哪些边界内可见——
 *    这取决于具体业务领域的需求。scope 设计决定了流程的表达力上限和
 *    隔离性/安全性的下限，是整个 Flow 架构中最需要审慎权衡的部分。
 *
 * 3. Executor 层 —— 前后端职责边界划分
 *    env 的设计本质是按「前端/后端」划分职责边界：
 *      - 前端 env: navigateTo / playAnimation / markDirty → 操控画布视图
 *      - 后端 env: db / httpClient → 访问数据和外部服务
 *    这不是在「磨平平台差异」（PC/Android/iOS 等平台差异由壳层 Bridge 处理，
 *    见 ADR-038），而是划定两类完全不同的职责各自需要哪些能力。
 *    所有平台上 Flow 执行的都是同一套 Web 代码，根本不存在平台差异需要屏蔽。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 模块组织
 * ═══════════════════════════════════════════════════════════════════
 *
 *   types/      → 纯数据契约层（schema = AST 结构定义）
 *   runtime/    → 解释执行层（FlowRunner 调度 + resolveValue 求值 + FlowContext 接口）
 *   executors/  → 操作语义层（每个 kind 的实际行为实现）
 *   presets/    → 预组装工厂（按前端/后端组装 registry，一行创建 runner）
 *
 * 预组装 preset 通过子路径导入：
 *   import { createClientFlowRunner } from '@banyuan/banvasgl/flow/client'
 *   import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server'
 */

// 类型
export * from './types/index.js'

// 运行时
export { FlowRunner } from './runtime/FlowRunner.js'
export { resolveValue } from './runtime/resolveValue.js'
export type { FlowContext } from './runtime/context.js'

// 执行器注册表
export { NodeExecutorRegistry } from './executors/registry.js'
export type { NodeExecutor, NodeExecutorResult } from './executors/registry.js'

// 执行器（按需导入）
export * from './executors/shared/index.js'
export * from './executors/client/index.js'
export * from './executors/server/index.js'
