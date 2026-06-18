import type { FlowNode } from './nodes/index.js'

// ═══════════════════════════════════════════════════════════
// FlowSchema —— 声明式流程图顶层结构
// ═══════════════════════════════════════════════════════════

export interface FlowSchema {
  version: string;
  entry: string;
  nodes: Record<string, FlowNode>;
}

export const FLOW_SCHEMA_VERSION = "2.0.0";
