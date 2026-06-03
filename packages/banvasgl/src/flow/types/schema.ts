/**
 * FlowSchema —— 流程图的核心数据结构
 *
 * 设计定位：FlowSchema 就是 Flow 解释器的 AST。
 *
 * 正如编程语言的 AST 用树状结构描述代码的「做什么」，
 * FlowSchema 用节点图（DAG）描述流程的「做什么」。
 * 两者的区别在于 FlowSchema 还包含空间信息（x/y 坐标），
 * 因为它同时是画布可视化编辑器的持久化格式。
 *
 * 节点分为两类：
 *   - 动作节点（FlowActionNode）参与控制流，是 AST 中的「语句」
 *   - 值节点（FlowValueNode）仅产出数据，是 AST 中的「表达式」
 *
 * 边（FlowEdge）既表达控制流方向（顺序/分支），
 * 也可表达数据流方向（toParam 指定参数槽）。
 * 这种统一让画布上的连线同时传达了执行顺序和数据依赖。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计质量准则：流程控制的完备集
 * ═══════════════════════════════════════════════════════════════════
 *
 * Schema 层的核心指标是「完备性」——它必须能表达所有必要的控制流原语，
 * 确保用户不会因为「某种流程写不出来」而被迫逃逸到原始代码。
 *
 * 当前的控制流完备集由以下原语构成：
 *   - 顺序（edges 的自然拓扑序）
 *   - 条件分支（condition 节点 + branch 边）
 *   - 延迟/等待（delay 节点）
 *   - 子程序调用（callFlow —— 引用外部 schema，黑盒复用）
 *   - 子流程内联（subFlow —— 内嵌 schema，白盒编辑）
 *   - 变量赋值（setVariable —— 状态突变）
 *   - 提前终止（return —— 中断当前流程执行）
 *   - 列表迭代（forEach —— 遍历集合逐一执行子流程）
 *   - 并行执行（parallel —— 多分支并发 + 汇聚策略）
 *
 * 当发现业务场景中出现「用现有节点类型无法表达的控制流模式」时，
 * 说明完备集需要扩展——应新增共享节点类型而非绕过 schema。
 */

import type { SharedFlowNode } from './nodes/shared.js'
import type { ClientFlowNode } from './nodes/client.js'
import type { ServerFlowNode } from './nodes/server.js'

/**
 * FlowSchema 格式版本号
 *
 * 当 FlowSchema 的结构发生 breaking change 时递增此版本。
 * BanvasGL 的全局 Migration 函数通过此常量判断是否需要对
 * View.events/lifetimes 中嵌套的 FlowSchema 执行格式变换。
 */
export const FLOW_SCHEMA_VERSION = '1.0.0'

/** 值节点（不参与控制流，仅产出值供参数引用） */
export interface FlowVarNode {
  kind: 'variable'
  viewId: string
  key: string
}

export interface FlowPageVarNode {
  kind: 'pageVar'
  key: string
}

export interface FlowEventParamNode {
  kind: 'eventParam'
  index: number
}

export type FlowValueNode = FlowVarNode | FlowPageVarNode | FlowEventParamNode

/** 所有动作节点的联合 */
export type FlowActionNode = SharedFlowNode | ClientFlowNode | ServerFlowNode

/** FlowNode = 动作节点 | 值节点，附加公共字段 */
export type FlowNode = { id: string; x?: number; y?: number } & (FlowActionNode | FlowValueNode)

/** 有向边 */
export interface FlowEdge {
  /** 边的唯一标识（编辑器画布管理 + 序列化需要） */
  id: string
  from: string
  to: string
  /** 条件分支边的标签（error 边仅在节点执行抛异常时走） */
  branch?: 'true' | 'false' | 'error'
  /** 数据流边：指定目标节点的哪个参数槽 */
  toParam?: string
}

/** 流程图完整结构 */
export interface FlowSchema {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
