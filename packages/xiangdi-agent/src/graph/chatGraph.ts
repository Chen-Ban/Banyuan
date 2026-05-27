/**
 * 相地 · ChatGraph —— 轻量聊天管线
 *
 * 管线：START → think → extractMemory → END
 *
 * 设计原则：
 * - 不注册任何工具（无 ToolRegistry）
 * - 不注册知识检索（不允许用户问 BanvasGL 相关问题）
 * - 不做 Spec 规划
 * - 不做 Plan/Execute/Audit 流程
 * - 仅做自然语言对话 + 偏好提取
 *
 * 适用场景：
 * - 用户闲聊、确认需求、讨论方案
 * - 非 BanvasGL 画布操作的对话
 */
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMClient } from "../core/llmTypes.js";
import type { StreamCallback, Message, MessageContent } from "../core/types.js";
import { createExtractMemoryNode } from "./nodes/extractMemoryNode.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface ChatGraphConfig {
  llmClient: LLMClient;
  /** Stream callback for SSE events */
  streamCallback?: StreamCallback;
  /** Enable memory extraction / preference extraction (default: true) */
  enableMemoryExtraction?: boolean;
  /** Memory extraction model override */
  memoryExtractionModel?: string;
  /** 聊天模型（默认 deepseek-v4-pro） */
  chatModel?: string;
}

// ─── ChatState ───────────────────────────────────────────────────────────────

// Messages reducer that appends messages
function messagesReducer(curr: BaseMessage[], update: BaseMessage[]): BaseMessage[] {
  return [...curr, ...update];
}

export const ChatStateAnnotation = Annotation.Root({
  /** 对话消息（L4 + L5） */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** L2: Agent 记忆（含用户偏好） */
  agentMemory: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** L3: 历史对话摘要 */
  contextSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** LLM 最终回复文本 */
  finalText: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 整轮摘要（由 think 节点直接生成简短摘要） */
  roundSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
});

export type ChatState = typeof ChatStateAnnotation.State;

// ─── System Prompt ───────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `你是班园（Banyuan）低代码平台的 AI 助手，名为「相地」。

## 你的职责

你负责与用户进行自然语言对话，帮助用户：
1. 讨论和澄清需求
2. 解答关于平台使用的一般性问题
3. 提供设计建议和方案讨论
4. 确认用户意图

## 限制

- 你不能执行任何画布操作（创建页面、添加节点、修改样式等）
- 你不能搜索 BanvasGL 知识库
- 你不能回答 BanvasGL 引擎的技术实现细节
- 如果用户询问 BanvasGL 相关的技术问题，请礼貌地告知他们需要切换到任务模式

## 风格

- 简洁友好，避免冗长
- 如果用户表达了设计偏好（颜色、字体、风格等），记住这些偏好
- 用中文回复（除非用户使用其他语言）`;

// ─── ChatGraph Factory ───────────────────────────────────────────────────────

/**
 * 创建 ChatGraph —— 轻量聊天管线。
 *
 * 管线：START → think → extractMemory → END
 */
export function createChatGraph(config: ChatGraphConfig) {
  const {
    llmClient,
    streamCallback,
    enableMemoryExtraction = true,
    memoryExtractionModel,
    chatModel = "deepseek-v4-pro",
  } = config;

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Think Node ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 核心对话节点。
   *
   * 接收 messages（L4+L5）+ agentMemory（L2）+ contextSummary（L3），
   * 调用 LLM 生成回复，不使用任何工具。
   */
  async function thinkNode(state: ChatState): Promise<Partial<ChatState>> {
    // 构建 system prompt，注入 L2 和 L3
    let systemPrompt = CHAT_SYSTEM_PROMPT;

    if (state.agentMemory) {
      systemPrompt += `\n\n---\n## 用户偏好与历史记忆\n${state.agentMemory}`;
    }

    if (state.contextSummary) {
      systemPrompt += `\n\n---\n## 历史对话摘要\n${state.contextSummary}`;
    }

    // 将 LangChain messages 转为 XiangDi Message 格式
    const xiangdiMessages = langchainToXiangdi(state.messages);

    const response = await llmClient.createMessage({
      model: chatModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: xiangdiMessages,
      temperature: 0.7,
    });

    // 提取文本回复
    const textParts: string[] = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
        // 流式推送
        streamCallback?.({ type: "text_delta", data: { text: block.text } });
      }
    }

    const finalText = textParts.join("");

    // 生成简短的 roundSummary（用于偏好提取上下文）
    const lastUserMsg = [...state.messages].reverse().find((m) => m._getType() === "human");
    const userContent = lastUserMsg
      ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : "")
      : "";
    const roundSummary = userContent
      ? `用户说：${userContent.slice(0, 100)}。助手回复：${finalText.slice(0, 100)}`
      : "";

    // 将 AI 回复追加到 messages
    const aiMessage = new AIMessage(finalText);

    return {
      messages: [aiMessage],
      finalText,
      roundSummary,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── ExtractMemory Node ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  const extractMemoryNodeFn = createExtractMemoryNode({
    llmClient,
    streamCallback,
    enabled: enableMemoryExtraction,
    model: memoryExtractionModel,
    // chat 模式下降低工具调用阈值（因为没有工具调用），
    // 主要依赖偏好信号检测来触发
    minToolCalls: 0,
  });

  async function extractMemoryWrapper(state: ChatState): Promise<Partial<ChatState>> {
    await extractMemoryNodeFn({
      messages: state.messages,
      roundSummary: state.roundSummary,
      auditResult: null,
      auditRetries: 0,
      planOutput: null,
    });
    return {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Build the Graph ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const graph = new StateGraph(ChatStateAnnotation)
    .addNode("think", thinkNode)
    .addNode("extractMemory", extractMemoryWrapper)
    .addEdge(START, "think")
    .addEdge("think", "extractMemory")
    .addEdge("extractMemory", END);

  return graph.compile();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Utility Functions ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert LangChain BaseMessage[] to XiangDi Message[] (Anthropic-style)
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
