/**
 * 相地 · Agent 主循环
 *
 * 相地之法：观、思、动，循环往复，直至园成。
 * AgentLoop 实现 ReAct 模式：
 *   Observe（感知用户意图）→ Think（LLM 规划）→ Act（工具调用）→ 循环
 *
 * 遵循 Anthropic "Building Effective Agents" 最佳实践：
 * - 单一职责：只负责循环控制，不关心具体工具实现
 * - 可观测：通过 StreamBridge 向外暴露每一步事件
 * - 可中断：支持 AbortSignal
 */

import type {
  AgentConfig,
  AgentState,
  Message,
  ToolUseContent,
  ToolResultContent,
} from "./types.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { ContextManager } from "./ContextManager.js";
import { StreamBridge } from "./StreamBridge.js";

// ─── 最小化 Anthropic SDK 类型（避免强依赖，运行时由调用方注入）─────────────

export interface LLMClient {
  createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: unknown[];
    temperature?: number;
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
}

// ─── AgentLoop ────────────────────────────────────────────────────────────────

export class AgentLoop {
  private readonly config: Required<
    Pick<AgentConfig, "maxIterations" | "systemPrompt">
  > &
    AgentConfig;
  private readonly registry: ToolRegistry;
  private readonly context: ContextManager;
  readonly stream: StreamBridge;

  constructor(
    config: AgentConfig,
    registry: ToolRegistry,
    context?: ContextManager
  ) {
    this.config = {
      maxIterations: 20,
      systemPrompt: "",
      ...config,
    };
    this.registry = registry;
    this.context = context ?? new ContextManager();
    this.stream = new StreamBridge();
  }

  /**
   * 运行 Agent，处理一次用户输入
   *
   * @param client  LLM 客户端（由调用方注入，解耦 SDK 依赖）
   * @param userMessage  用户消息（文本或多模态内容）
   * @param signal  可选的 AbortSignal
   * @returns 最终的文本回复
   */
  async run(
    client: LLMClient,
    userMessage: Message["content"],
    signal?: AbortSignal
  ): Promise<string> {
    // 将用户消息压入上下文
    this.context.push("user", userMessage);

    const state: AgentState = {
      status: "running",
      messages: this.context.getMessages(),
      iteration: 0,
    };

    let finalText = "";

    try {
      while (state.iteration < this.config.maxIterations) {
        if (signal?.aborted) {
          throw new Error("Agent run aborted.");
        }

        state.iteration++;

        // ── Think：调用 LLM ──────────────────────────────────────────────────
        const response = await client.createMessage({
          model: this.config.llm.model,
          max_tokens: this.config.llm.maxTokens ?? 8192,
          system: this.config.systemPrompt || undefined,
          messages: this.context.getMessages(),
          tools: this.registry.isEmpty
            ? undefined
            : this.registry.getDefinitions(),
          temperature: this.config.llm.temperature,
        });

        // 收集本轮 LLM 输出
        const assistantContent: LLMResponse["content"] = response.content;
        const assistantMessage: Message = {
          role: "assistant",
          content: assistantContent as unknown as Message["content"],
        };
        this.context.push("assistant", assistantMessage.content);

        // 提取文本增量
        for (const block of assistantContent) {
          if (block.type === "text") {
            finalText = block.text;
            this.stream.emitTextDelta(block.text);
          }
        }

        // ── Act：执行工具调用 ─────────────────────────────────────────────────
        if (response.stop_reason === "tool_use") {
          state.status = "waiting_tool";

          const toolUseBlocks = assistantContent.filter(
            (b): b is Extract<LLMResponse["content"][number], { type: "tool_use" }> =>
              b.type === "tool_use"
          );

          const toolResults: ToolResultContent[] = [];

          for (const toolUse of toolUseBlocks) {
            this.stream.emitToolCall(toolUse.id, toolUse.name, toolUse.input);

            const { result, is_error } = await this.registry.execute(
              toolUse.name,
              toolUse.input
            );

            const resultStr =
              typeof result === "string" ? result : JSON.stringify(result);

            this.stream.emitToolResult(toolUse.id, result, is_error);

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: resultStr,
              is_error,
            });
          }

          // 将工具结果作为 user 消息压回上下文
          this.context.push("user", toolResults as unknown as Message["content"]);
          state.status = "running";
          continue;
        }

        // ── 终止条件 ──────────────────────────────────────────────────────────
        if (
          response.stop_reason === "end_turn" ||
          response.stop_reason === "max_tokens"
        ) {
          break;
        }
      }

      state.status = "done";
      this.stream.emitDone(finalText);
      return finalText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      state.status = "error";
      state.error = error;
      this.stream.emitError(error);
      throw error;
    }
  }

  /**
   * 清空对话历史，重置 Agent 状态
   */
  reset(): void {
    this.context.clear();
  }
}
