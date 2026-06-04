/**
 * 相地 · Respond 节点（Phase 2: ADR-039 统一 Graph）
 *
 * 纯对话回答节点，替代原 ChatGraph 的 think 节点。
 * 支持只读工具 ReAct 循环（最多 2 轮），允许查询类工具辅助回答。
 *
 * 管线位置：intent(type=respond) → respond ⇄ readonlyTools → summarize
 *
 * 只读工具列表：
 * - knowledge_search: 搜索 BanvasGL 知识库
 * - material_search: 搜索物料库
 * - material_get_detail: 获取物料详情
 * - schema_get: 查询 Schema
 * - banvas_get_app_state: 查询当前画布状态
 * - web_search: 网页搜索（如注册）
 *
 * 设计原则：
 * - 流式输出：每个 token 立即推送 text_delta
 * - 只读保证：只注册查询类工具，不注册任何写操作工具
 * - 有限循环：最多 2 轮工具调用，防止无限递归
 * - 容错：工具调用失败不阻塞，降级为纯文本回答
 */
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import type { LLMClient } from "../../core/llmTypes.js";
import type { ToolRegistry } from "../../core/ToolRegistry.js";
import type { StreamCallback, Message, MessageContent } from "../../core/types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface RespondNodeConfig {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  streamCallback?: StreamCallback;
  /** 对话模型名称（默认 deepseek-v4-pro） */
  respondModel?: string;
  /** 只读工具最大 ReAct 轮次（默认 2） */
  maxReadonlyRounds?: number;
}

// ─── 只读工具白名单 ──────────────────────────────────────────────────────────

const READONLY_TOOLS = new Set([
  "knowledge_search",
  "material_search",
  "material_get_detail",
  "schema_get",
  "banvas_get_app_state",
  "web_search",
  "explain_cloud_function",
]);

// ─── System Prompt ──────────────────────────────────────────────────────────

const RESPOND_SYSTEM_PROMPT = `你是班园（Banyuan）低代码平台的 AI 助手，名为「相地」。

## 你的职责

你负责与用户进行自然语言对话，帮助用户：
1. 讨论和澄清需求
2. 解答关于平台使用的问题
3. 提供设计建议和方案讨论
4. 确认用户意图
5. 查询当前应用状态、知识库、物料等信息

## 能力

- 你可以使用只读工具查询信息来辅助回答
- 你不能执行任何画布写操作（创建/修改/删除页面、节点等）
- 如果用户明确需要执行画布操作，请告知他们你理解了需求，会在下一步执行

## 风格

- 简洁友好，避免冗长
- 如果用户表达了设计偏好（颜色、字体、风格等），记住这些偏好
- 用中文回复（除非用户使用其他语言）`;

// ─── Respond Node Factory ─────────────────────────────────────────────────────

/**
 * 创建 Respond 节点函数。
 *
 * 行为：
 * 1. 构建对话上下文（L2 + L3 + messages）
 * 2. 流式调用 LLM，注入只读工具定义
 * 3. 如果 LLM 返回工具调用 → 执行只读工具 → 将结果注入上下文 → 再次调用 LLM
 * 4. 最多 2 轮工具调用循环
 * 5. 输出 finalText + respondMessages + readonlyToolCalls
 */
export function createRespondNode(config: RespondNodeConfig) {
  const {
    llmClient,
    toolRegistry,
    streamCallback,
    respondModel = "deepseek-v4-pro",
    maxReadonlyRounds = 2,
  } = config;

  // 过滤出只读工具定义
  const readonlyToolDefs = toolRegistry.getDefinitions().filter(
    (def) => READONLY_TOOLS.has(def.name)
  );

  return async function respondNode(state: {
    messages: BaseMessage[];
    agentMemory: string;
    contextSummary: string;
  }): Promise<{
    messages: BaseMessage[];
    respondMessages: BaseMessage[];
    readonlyToolCalls: number;
    finalText: string;
    roundSummary: string;
  }> {
    // 构建 system prompt，注入 L2 和 L3
    let systemPrompt = RESPOND_SYSTEM_PROMPT;
    if (state.agentMemory) {
      systemPrompt += `\n\n---\n## 用户偏好与历史记忆\n${state.agentMemory}`;
    }
    if (state.contextSummary) {
      systemPrompt += `\n\n---\n## 历史对话摘要\n${state.contextSummary}`;
    }

    // 将 LangChain messages 转为 XiangDi Message 格式
    let currentMessages = langchainToXiangdi(state.messages);
    const respondMsgs: BaseMessage[] = [];
    let totalToolCalls = 0;
    let finalText = "";

    // ReAct 循环
    for (let round = 0; round <= maxReadonlyRounds; round++) {
      let streamedText = "";

      const response = await llmClient.createMessageStream(
        {
          model: respondModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: currentMessages,
          tools: readonlyToolDefs.length > 0 ? readonlyToolDefs : undefined,
          temperature: 0.7,
        },
        (token) => {
          streamedText += token;
          streamCallback?.({ type: "text_delta", data: { text: token } });
        }
      );

      // 解析响应
      const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
      const textParts: string[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          if (!streamedText) {
            textParts.push(block.text);
            streamCallback?.({ type: "text_delta", data: { text: block.text } });
          } else {
            textParts.push(streamedText);
          }
        } else if (block.type === "tool_use") {
          // 只允许只读工具
          if (READONLY_TOOLS.has(block.name)) {
            toolCalls.push({ id: block.id, name: block.name, args: block.input });
          }
        }
      }

      // 纯流式路径补偿
      if (textParts.length === 0 && streamedText) {
        textParts.push(streamedText);
      }

      finalText = textParts.join("\n") || streamedText;

      // 创建 AI 消息
      const aiMessage = new AIMessage({
        content: finalText,
        tool_calls: toolCalls.length > 0
          ? toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args, type: "tool_call" as const }))
          : undefined,
      });
      respondMsgs.push(aiMessage);

      // 无工具调用 → 结束循环
      if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
        break;
      }

      // 达到最大轮次 → 强制结束
      if (round >= maxReadonlyRounds) {
        break;
      }

      // 执行只读工具
      totalToolCalls += toolCalls.length;

      // 构建工具结果消息
      const toolResults: BaseMessage[] = [];
      const xiangdiToolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const tc of toolCalls) {
        streamCallback?.({ type: "tool_call", data: { id: tc.id, name: tc.name, input: tc.args } });

        const { result, is_error } = await toolRegistry.execute(tc.name, tc.args);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);

        streamCallback?.({ type: "tool_result", data: { tool_use_id: tc.id, name: tc.name, result, is_error } });

        toolResults.push(new ToolMessage({ content: resultStr, tool_call_id: tc.id, name: tc.name }));
        xiangdiToolResults.push({ type: "tool_result", tool_use_id: tc.id, content: resultStr });
      }

      respondMsgs.push(...toolResults);

      // 更新 xiangdi messages 为下一轮
      currentMessages = [
        ...currentMessages,
        {
          role: "assistant",
          content: [
            ...(finalText ? [{ type: "text" as const, text: finalText }] : []),
            ...toolCalls.map((tc) => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.args })),
          ] as unknown as MessageContent,
        },
        {
          role: "user",
          content: xiangdiToolResults as unknown as MessageContent,
        },
      ];

      // 清空 streamedText 和 finalText 以便下一轮
      finalText = "";
    }

    // 生成简短 roundSummary
    const lastUserMsg = [...state.messages].reverse().find((m) => m._getType() === "human");
    const userContent = lastUserMsg
      ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : "")
      : "";
    const roundSummary = userContent
      ? `用户说：${userContent.slice(0, 100)}。助手回复：${finalText.slice(0, 100)}`
      : "";

    return {
      messages: [new AIMessage(finalText)],
      respondMessages: respondMsgs,
      readonlyToolCalls: totalToolCalls,
      finalText,
      roundSummary,
    };
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Convert LangChain BaseMessage[] to XiangDi Message[]
 */
function langchainToXiangdi(messages: BaseMessage[]): Message[] {
  const result: Message[] = [];

  for (const msg of messages) {
    const type = msg._getType();

    if (type === "human") {
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content as unknown as MessageContent;
      result.push({ role: "user", content });
    } else if (type === "ai") {
      const aiMsg = msg as AIMessage;
      if (typeof aiMsg.content === "string" && aiMsg.content) {
        result.push({ role: "assistant", content: aiMsg.content });
      } else if (Array.isArray(aiMsg.content) && aiMsg.content.length > 0) {
        result.push({ role: "assistant", content: aiMsg.content as unknown as MessageContent });
      }
    }
  }

  return result;
}
