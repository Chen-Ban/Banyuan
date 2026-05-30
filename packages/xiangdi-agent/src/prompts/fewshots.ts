/**
 * 相地 · Few-shot 示例
 *
 * 精选的示例对话，帮助 LLM 理解期望的行为模式。
 * 遵循 Anthropic 最佳实践：示例应覆盖典型场景，并展示正确的工具调用顺序。
 */

import type { Message } from "../core/types.js";

/**
 * 示例：从零创建一个登录页
 */
export const FEWSHOT_CREATE_LOGIN_PAGE: Message[] = [
  {
    role: "user",
    content: "帮我创建一个简洁的登录页，包含 Logo、用户名输入框、密码输入框和登录按钮。",
  },
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "好的，我先了解一下当前应用状态，然后为你创建登录页。",
      },
      {
        type: "tool_use",
        id: "tool_1",
        name: "banvas_get_app_state",
        input: {},
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tool_1",
        content: JSON.stringify([]),
      },
    ],
  },
  {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "应用目前没有页面，我来创建登录页。",
      },
      {
        type: "tool_use",
        id: "tool_2",
        name: "banvas_create_page",
        input: {
          name: "登录页",
          width: 375,
          height: 812,
          backgroundColor: "#F5F7FA",
        },
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tool_2",
        content: JSON.stringify({ pageId: "page_login" }),
      },
    ],
  },
  {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "tool_3",
        name: "banvas_add_node",
        input: {
          pageId: "page_login",
          node: {
            id: "logo_bg",
            type: "rect",
            transform: {
              position: { x: 137, y: 120 },
              size: { width: 100, height: 100 },
              rotation: 0,
              opacity: 1,
            },
            fill: { type: "solid", color: "#4A90E2" },
            cornerRadius: 20,
            zIndex: 0,
            locked: false,
          },
        },
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tool_3",
        content: JSON.stringify({ nodeId: "logo_bg" }),
      },
    ],
  },
  {
    role: "assistant",
    content:
      "登录页已创建完成！包含：\n- 顶部居中的 Logo 区域（蓝色圆角矩形，100×100px）\n- 用户名输入框（带圆角，白色背景）\n- 密码输入框（同上）\n- 蓝色登录按钮（全宽，圆角 8px）\n\n如需调整颜色、间距或添加「忘记密码」链接，请告诉我。",
  },
];

/**
 * 获取所有 few-shot 示例
 */
export function getAllFewshots(): Message[][] {
  return [FEWSHOT_CREATE_LOGIN_PAGE];
}

/**
 * 将 few-shot 示例展平为消息列表（用于注入对话历史）
 */
export function flattenFewshots(examples: Message[][]): Message[] {
  return examples.flat();
}
