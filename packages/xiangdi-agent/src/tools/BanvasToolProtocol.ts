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
 *
 * 数据格式：AI Projection（ADR-027）
 *   - 视图类型：GRAPHVIEW / TEXTVIEW / IMAGEVIEW / VIDEOVIEW / COMBINEDVIEW
 *   - 坐标：{ x, y, rotation?, scaleX?, scaleY? }
 *   - 尺寸：{ width, height }
 *   - 装饰：{ fill?, stroke?, cornerRadius?, overflow? }
 *   - 页面包含 children[]，每个 child 是 AIProjectionNode
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
      "获取当前应用的完整状态（AI Projection 格式）。返回所有页面的结构化数据，包括视图树、坐标、尺寸、装饰、事件绑定等。在进行任何修改前，应先调用此工具了解现有结构。\n\n" +
      "返回格式示例（单页面）：\n" +
      '{ "id": "page_xxx", "name": "首页", "size": { "width": 375, "height": 812 }, "children": [...] }',
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
    description: "在应用中新建一个页面。返回新页面的 ID。",
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
      "向指定页面添加一个新节点。返回新节点的 id。\n\n" +
      "【重要】使用 AI Projection 格式描述节点：\n" +
      "- type: 视图类型，可选 GRAPHVIEW / TEXTVIEW / IMAGEVIEW / VIDEOVIEW / COMBINEDVIEW\n" +
      "- transform: { x, y, rotation?, scaleX?, scaleY? } 位置坐标\n" +
      "- size: { width, height } 尺寸\n" +
      "- decoration: { fill?, stroke?, cornerRadius?, overflow? } 装饰样式（可选）\n" +
      "- content: 视图内容（类型相关，可选）\n" +
      "- children: 子节点数组（COMBINEDVIEW 适用）\n\n" +
      "示例 — 添加红色圆角矩形：\n" +
      "{\n" +
      '  "type": "GRAPHVIEW",\n' +
      '  "transform": { "x": 20, "y": 100 },\n' +
      '  "size": { "width": 335, "height": 48 },\n' +
      '  "decoration": { "fill": { "color": "#ff4d4f" }, "cornerRadius": 8 },\n' +
      '  "content": { "graphType": "ROUNDED_RECT", "data": { "radii": 8 } }\n' +
      "}\n\n" +
      "示例 — 添加文本：\n" +
      "{\n" +
      '  "type": "TEXTVIEW",\n' +
      '  "transform": { "x": 20, "y": 160 },\n' +
      '  "size": { "width": 200, "height": 24 },\n' +
      '  "content": { "paragraphs": [{ "elements": [{ "text": "Hello" }] }] }\n' +
      "}\n\n" +
      "示例 — 添加 Flex 容器：\n" +
      "{\n" +
      '  "type": "COMBINEDVIEW",\n' +
      '  "transform": { "x": 0, "y": 0 },\n' +
      '  "size": { "width": 375, "height": 200 },\n' +
      '  "layoutMode": "flex",\n' +
      '  "flexLayout": { "direction": "column", "gap": 8, "padding": 16 },\n' +
      '  "children": []\n' +
      "}",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        node: {
          type: "object",
          description:
            "AI Projection 格式的节点描述。必须包含 type、transform、size 字段。",
          properties: {
            type: {
              type: "string",
              enum: ["GRAPHVIEW", "TEXTVIEW", "IMAGEVIEW", "VIDEOVIEW", "COMBINEDVIEW"],
              description: "视图类型",
            },
            transform: {
              type: "object",
              description: "位置坐标",
              properties: {
                x: { type: "number", description: "水平位置 px，左上角为原点" },
                y: { type: "number", description: "垂直位置 px，左上角为原点" },
                rotation: { type: "number", description: "旋转角度（默认 0）" },
                scaleX: { type: "number", description: "水平缩放（默认 1）" },
                scaleY: { type: "number", description: "垂直缩放（默认 1）" },
              },
              required: ["x", "y"],
            },
            size: {
              type: "object",
              description: "尺寸",
              properties: {
                width: { type: "number", description: "宽度 px" },
                height: { type: "number", description: "高度 px" },
              },
              required: ["width", "height"],
            },
            decoration: {
              type: "object",
              description: "装饰样式：{ fill?: { color, opacity? }, stroke?: { color, width? }, cornerRadius?, overflow? }",
            },
            content: {
              type: "object",
              description: "视图内容。GRAPHVIEW: { graphType, data }; TEXTVIEW: { paragraphs }; IMAGEVIEW: 使用 src 字段",
            },
            src: { type: "string", description: "图片/视频 URL（IMAGEVIEW/VIDEOVIEW 适用）" },
            layoutMode: {
              type: "string",
              enum: ["free", "flex", "list", "grid"],
              description: "布局模式（COMBINEDVIEW 适用，默认 free）",
            },
            flexLayout: {
              type: "object",
              description: "Flex 布局配置：{ direction?, gap?, padding?, mainAxisAlignment?, crossAxisAlignment? }",
            },
            children: {
              type: "array",
              description: "子节点数组（COMBINEDVIEW 适用）",
            },
          },
          required: ["type", "transform", "size"],
        },
      },
      required: ["pageId", "node"],
    },
  },
  {
    name: BANVAS_TOOLS.UPDATE_NODE,
    description:
      "更新已有节点的属性。只需传入需要修改的字段（深度合并），不需要传完整节点。\n\n" +
      "示例 — 修改背景色和圆角：\n" +
      '{ "pageId": "xxx", "nodeId": "yyy", "patch": { "decoration": { "fill": { "color": "#1890ff" }, "cornerRadius": 12 } } }\n\n' +
      "示例 — 修改文本内容：\n" +
      '{ "pageId": "xxx", "nodeId": "yyy", "patch": { "content": { "paragraphs": [{ "elements": [{ "text": "New text" }] }] } } }',
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "目标页面 ID" },
        nodeId: { type: "string", description: "目标节点 ID" },
        patch: {
          type: "object",
          description: "需要更新的字段（AI Projection 格式），深度合并到现有节点。可更新 transform/size/decoration/content/layoutMode/flexLayout 等。",
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
    description: "移动节点到新位置（更新 transform 的 x/y）。",
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
    description: "调整节点尺寸（更新 size 的 width/height）。",
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
      "批量应用一组操作（原子事务）。适合需要同时修改多个节点的场景，避免中间状态不一致。所有操作在内存中共享同一份 Projection 状态，最终一次性写回。",
    input_schema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description:
            "操作列表，每项为 { tool: BanvasToolName, input: object }。tool 可选值：banvas_create_page / banvas_add_node / banvas_update_node / banvas_delete_node / banvas_move_node / banvas_resize_node",
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
