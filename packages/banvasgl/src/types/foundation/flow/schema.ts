import type { FlowNode } from './nodes/index.js'

// ═══════════════════════════════════════════════════════════
// FlowSchema —— 声明式流程图顶层结构
// ═══════════════════════════════════════════════════════════

/**
 * FlowSchema —— 声明式流程图顶层结构
 *
 * FlowSchema 是一棵以有向图形态承载的过程式抽象语法树（procedural AST as a directed graph）。
 * 它用"语义化的节点 + 内嵌引用"声明一段程序的执行流程。
 *
 * v2.0.0 将 ControlEdge / DataEdge 消解为节点内部的引用字段：
 * - 控制流由节点 `slots[*].next` 字段承载（"A 执行完后去 B"是 A 的属性）
 * - 数据依赖由 `SlotValue = unknown | DataRef` 承载（"B 的输入来自 A"是 B 的属性）
 *
 * 因此 FlowSchema 现在只有两个字段：`entry` + `nodes`。
 * 图的全部信息（拓扑 + 数据依赖）都在节点自身内部。
 */
export interface FlowSchema {
  /** Schema 版本（用于版本迁移），当前为 "2.0.0" */
  version: string
  /** 入口节点 ID（必须是 control 或 action 节点） */
  entry: string
  /** 节点注册表（key = nodeId） */
  nodes: Record<string, FlowNode>
}

/** 当前 FlowSchema 规范版本 */
export const FLOW_SCHEMA_VERSION = '2.0.0'
