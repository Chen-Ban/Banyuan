import { NodeCategory, NodeKind, ParallelMode } from "../enums.js";
import type {
  FlowConditionSlot,
  FlowLoopSlot,
  FlowParallelSlot,
} from "../slots/control.js";

export interface FlowConditionNode {
  id: string;
  category: NodeCategory.Control;
  kind: NodeKind.Condition;
  slots: FlowConditionSlot[];
}

export interface FlowLoopNode {
  id: string;
  category: NodeCategory.Control;
  kind: NodeKind.Loop;
  slots: FlowLoopSlot[];
}

export interface FlowParallelNode {
  id: string;
  category: NodeCategory.Control;
  kind: NodeKind.Parallel;
  slots: FlowParallelSlot[];
  mode: ParallelMode;
}

export type FlowControlNode =
  | FlowConditionNode
  | FlowLoopNode
  | FlowParallelNode;
