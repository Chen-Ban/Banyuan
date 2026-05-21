/**
 * 相地 · BanvasGL 工具协议
 *
 * 定义 Agent 操作 BanvasGL 画布的标准工具集。
 * 每个工具对应一个原子操作，LLM 通过组合这些工具完成复杂的界面生成任务。
 *
 * 工具设计原则（来自 Anthropic 最佳实践）：
 * 1. 原子性：每个工具只做一件事
 * 2. 幂等性：相同输入产生相同结果
 * 3. 描述清晰：description 是 LLM 理解工具的唯一依据，务必准确
 */

import type { ToolDefinition } from "../core/types.js";

// ─── 工具名称常量 ─────────────────────────────────────────────────────────────

export const BANVAS_TOOLS = {
  CREATE_PAGE: "banvas_create_page",
  ADD_NODE: "banvas_add_node",
  UPDATE_NODE: "banvas_update_node",
  DELETE_NODE: "banvas_delete_node",
  MOVE_NODE: "banvas_move_node",
  RESIZE_NODE: "banvas_resize_node",
  GET_APP_STATE: "banvas_get_app_state",
  APPLY_PATCH: "banvas_apply_patch",
} as const;

export type BanvasToolName = (typeof BANVAS_TOOLS)[keyof typeof BANVAS_TOOLS];

// ─── 工具定义 ─────────────────────────────────────────────────────────────────

export const BANVAS_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: BANVAS_TOOLS.GET_APP_STATE,
    description:
      "获取当前应用的完整状态（AISchema 格式）。在进行任何修改前，应先调用此工具了解现有结构。",
    input_schema: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          description: "可选，指定页面 ID。不传则返回所有页面。",
        },
      },
    },
  },
  {
    name: BANVAS_TOOLS.CREATE_PAGE,
    description: "在应用中新建一个页面。",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "页面名称" },
        width: {
          type: "number",
          description: "页面宽度（px），默认 375",
        },
        height: {
          type: "number",
          description: "页面高度（px），默认 812",
        },
        backgroundColor: {
          type: "string",
          description: "背景色，十六进制，默认 #ffffff",
        },
      },
      required: ["name"],
    },
  },
  {
    name: BANVAS_TOOLS.ADD_NODE,
    description:
      "向指定页面添加一个新节点（矩形、文本、图片或分组）。返回新节点的 id。",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        node: {
          type: "object",
          description:
            "节点描述，符合 AISchema 节点格式。type 可为 rect / text / image / group。",
        },
      },
      required: ["pageId", "node"],
    },
  },
  {
    name: BANVAS_TOOLS.UPDATE_NODE,
    description:
      "更新已有节点的属性。只需传入需要修改的字段（深度合并），不需要传完整节点。",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        nodeId: { type: "string", description: "目标节点 ID" },
        patch: {
          type: "object",
          description: "需要更新的字段，支持嵌套路径，如 { style: { fontSize: 16 } }",
        },
      },
      required: ["pageId", "nodeId", "patch"],
    },
  },
  {
    name: BANVAS_TOOLS.DELETE_NODE,
    description: "从页面中删除指定节点。",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        nodeId: { type: "string", description: "要删除的节点 ID" },
      },
      required: ["pageId", "nodeId"],
    },
  },
  {
    name: BANVAS_TOOLS.MOVE_NODE,
    description: "移动节点到新位置。",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        nodeId: { type: "string", description: "目标节点 ID" },
        x: { type: "number", description: "新的 X 坐标（px）" },
        y: { type: "number", description: "新的 Y 坐标（px）" },
      },
      required: ["pageId", "nodeId", "x", "y"],
    },
  },
  {
    name: BANVAS_TOOLS.RESIZE_NODE,
    description: "调整节点尺寸。",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        nodeId: { type: "string", description: "目标节点 ID" },
        width: { type: "number", description: "新宽度（px）" },
        height: { type: "number", description: "新高度（px）" },
      },
      required: ["pageId", "nodeId", "width", "height"],
    },
  },
  {
    name: BANVAS_TOOLS.APPLY_PATCH,
    description:
      "批量应用一组操作（原子事务）。适合需要同时修改多个节点的场景，避免中间状态不一致。",
    input_schema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description:
            "操作列表，每项为 { tool: BanvasToolName, input: object }",
          items: {
            type: "object",
            properties: {
              tool: { type: "string" },
              input: { type: "object" },
            },
            required: ["tool", "input"],
          },
        },
      },
      required: ["operations"],
    },
  },
];

// ─── 工具输入类型 ─────────────────────────────────────────────────────────────

export interface GetAppStateInput {
  pageId?: string;
}

export interface CreatePageInput {
  name: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
}

export interface AddNodeInput {
  pageId: string;
  node: Record<string, unknown>;
}

export interface UpdateNodeInput {
  pageId: string;
  nodeId: string;
  patch: Record<string, unknown>;
}

export interface DeleteNodeInput {
  pageId: string;
  nodeId: string;
}

export interface MoveNodeInput {
  pageId: string;
  nodeId: string;
  x: number;
  y: number;
}

export interface ResizeNodeInput {
  pageId: string;
  nodeId: string;
  width: number;
  height: number;
}

export interface ApplyPatchInput {
  operations: Array<{ tool: BanvasToolName; input: Record<string, unknown> }>;
}
