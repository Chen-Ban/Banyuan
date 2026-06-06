/**
 * 旧编排体系类型（Legacy）
 *
 * 保留供现有 masterGraph.ts / state.ts 编译通过。
 * 这些类型将在 Phase 2（新图替换旧图）时一并删除。
 *
 * @deprecated 由 ADR-041 新协议取代
 */
import type { AIProjectionNode, AIProjectionScene } from "../schema/projection.types.js";

// ─── 旧 SubAgent 结果（用于 state.ts 的 subResults 字段）────────────────────

export interface SubAgentResult {
  taskId: string
  status: "success" | "partial" | "failed"
  nodes: AIProjectionNode[]
  ports: ContainerPorts
  flowFragments: FlowFragment[]
  dataUsage: DataUsageDeclaration[]
  diagnostics?: string[]
  error?: string
}

// ─── 旧组装计划 ────────────────────────────────────────────────────────────

export interface AssemblyPlan {
  page: {
    id: string
    name: string
    width: number
    height: number
    backgroundColor: string
  }
  placements: ContainerPlacement[]
  dataBindings: DataBinding[]
  eventWirings: EventWiring[]
  pageDataSources?: Array<{
    id: string
    name: string
    type: PortDataType
    description: string
  }>
}

// ─── 旧审计结果（含 issues 字段）───────────────────────────────────────────

export type AuditSeverity = "error" | "warning" | "info"

export interface AuditIssue {
  severity: AuditSeverity
  nodeId?: string
  taskId?: string
  category: "layout" | "overflow" | "visibility" | "data_binding" | "event_wiring" | "style"
  message: string
  suggestion?: string
}

export interface LegacyAuditResult {
  passed: boolean
  issues: AuditIssue[]
  fixedPage?: AIProjectionScene
  fixSummary?: string
}

// ─── 支撑类型 ─────────────────────────────────────────────────────────────

export type PortDirection = "in" | "out"
export type PortDataType = "string" | "number" | "boolean" | "object" | "array" | "image_url" | "color" | "date" | "enum"

export interface DataPort {
  id: string
  name: string
  direction: PortDirection
  dataType: PortDataType
  enumValues?: string[]
  objectSchema?: Record<string, PortDataType>
  required?: boolean
  defaultValue?: unknown
  description: string
}

export interface EventPort {
  id: string
  name: string
  direction: "emit" | "listen"
  payload?: Record<string, PortDataType>
  description: string
}

export interface ContainerPorts {
  data: DataPort[]
  events: EventPort[]
}

export interface FlowFragment {
  id: string
  trigger: string
  actions: string[]
  referencedPorts: string[]
}

export interface DataUsageDeclaration {
  portId: string
  nodeId: string
  binding: "text_content" | "visibility" | "style" | "src" | "items" | "custom"
  expression: string
}

export interface ContainerPlacement {
  taskId: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
}

export interface DataBinding {
  id: string
  source: { taskId: string; portId: string }
  target: { taskId: string; portId: string }
  transform?: string
}

export interface EventWiring {
  id: string
  emitter: { taskId: string; eventId: string }
  listener: { taskId: string; eventId: string }
  action?: string
}
