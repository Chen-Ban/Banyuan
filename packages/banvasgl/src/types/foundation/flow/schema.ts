import type { NodeCategory } from './enums.js'
import type { FlowSlot } from './slots.js'

// ═══════════════════════════════════════════════════════════
// FlowSchema —— 声明式流程图顶层结构
// ═══════════════════════════════════════════════════════════

export interface FlowSchema {
  version: string;
  entry: string;
  nodes: Record<string, AnyFlowNode>;
}

export interface AnyFlowNode {
  id: string;
  category: NodeCategory;
  kind: string;
  slots: FlowSlot[];
}

export const FLOW_SCHEMA_VERSION = "2.0.0";
