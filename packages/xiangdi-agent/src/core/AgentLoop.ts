/**
 * 相地 · Agent 主循环
 *
 * 相地之法：观、思、动，循环往复，直至园成。
 * AgentLoop 实现 ReAct 模式：
 *   Think（LLM 规划）→ Act（工具调用）→ Observe（处理结果）→ 循环
 *
 * 遵循 Anthropic "Building Effective Agents" 最佳实践：
 * - 单一职责：只负责循环控制，不关心具体工具实现
 * - 可观测：通过 StreamBridge + AgentLifecycle 向外暴露每一步事件
 * - 可中断：支持 AbortSignal
 */

import type {
  AgentConfig,
  Message,
  ToolUseContent,
  ToolResultContent,
} from "./types.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { ContextManager } from "./ContextManager.js";
import { StreamBridge } from "./StreamBridge.js";
import { AgentLifecycle } from "./AgentLifecycle.js";
import { ConflictDetector, DecisionLog } from "./ConflictDetector.js";
import { DisambiguationHandler } from "./DisambiguationHandler.js";
import type { ConflictReport } from "./ConflictDetector.js";
import type { DisambiguationOptions } from "./DisambiguationHandler.js";

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

// ─── 消歧事件类型 ──────────────────────────────────────────────────────────────

/** 消歧挂起句柄，由外部调用 resolve 恢复执行 */
export interface DisambiguationPending {
  /** 消歧选项 */
  options: DisambiguationOptions;
  /** 原始冲突报告 */
  report: ConflictReport;
  /** 调用此方法传入用户选择的 option id，恢复 Agent 执行 */
  resolve: (choiceId: string) => void;
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
  readonly lifecycle: AgentLifecycle;

  /** 冲突检测器 */
  private readonly conflictDetector: ConflictDetector;
  /** 消歧处理器（惰性初始化，需要 LLMClient） */
  private disambiguationHandler: DisambiguationHandler | null = null;
  /** 会话级决策日志 */
  readonly decisionLog: DecisionLog;

  constructor(
    config: AgentConfig,
    registry: ToolRegistry,
    context?: ContextManager,
    lifecycle?: AgentLifecycle
  ) {
    this.config = {
      maxIterations: 20,
      systemPrompt: "",
      ...config,
    };
    this.registry = registry;
    this.context = context ?? new ContextManager();
    this.stream = new StreamBridge();
    this.lifecycle = lifecycle ?? new AgentLifecycle();
    this.conflictDetector = new ConflictDetector();
    this.decisionLog = new DecisionLog();
  }

  /**
   * 运行 Agent，处理一次用户输入
   *
   * @param client  LLM 客户端（由调用方注入，解耦 SDK 依赖）
   * @param userMessage  用户消息（文本或多模态内容）
   * @param signal  可选的 AbortSignal
   * @param systemPromptOverride  覆盖构造时的 systemPrompt（由 HarnessRunner 注入 ProjectSpec 时使用）
   * @returns 最终的文本回复
   */
  async run(
    client: LLMClient,
    userMessage: Message["content"],
    signal?: AbortSignal,
    systemPromptOverride?: string
  ): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 惰性初始化消歧处理器
    if (!this.disambiguationHandler) {
      this.disambiguationHandler = new DisambiguationHandler(
        client,
        this.config.llm.model
      );
    }

    // ── Initializing ────────────────────────────────────────────────────────
    this.lifecycle.start(runId, this.config.maxIterations);
    this.context.push("user", userMessage);

    let finalText = "";

    try {
      // 初始化完成，进入主循环
      this.lifecycle.beginLoop();

      while (this.lifecycle.getSnapshot().iteration < this.config.maxIterations) {
        if (signal?.aborted) {
          this.lifecycle.cancel("AbortSignal triggered");
          throw new Error("Agent run aborted.");
        }

        this.lifecycle.nextIteration();
        this.decisionLog.advanceRound();

        // ── Think：调用 LLM ──────────────────────────────────────────────────
        const effectiveSystemPrompt =
          systemPromptOverride ?? (this.config.systemPrompt || undefined);

        this.lifecycle.beginThinking(this.config.llm.model);
        const llmStartTime = Date.now();

        const response = await client.createMessage({
          model: this.config.llm.model,
          max_tokens: this.config.llm.maxTokens ?? 8192,
          system: effectiveSystemPrompt,
          messages: this.context.getMessages(),
          tools: this.registry.isEmpty
            ? undefined
            : this.registry.getDefinitions(),
          temperature: this.config.llm.temperature,
        });

        const llmDurationMs = Date.now() - llmStartTime;
        this.lifecycle.doneThinking(llmDurationMs, response.stop_reason);

        // 收集本轮 LLM 输出
        const assistantContent: LLMResponse["content"] = response.content;
        this.context.push("assistant", assistantContent as unknown as Message["content"]);

        // 提取文本
        for (const block of assistantContent) {
          if (block.type === "text") {
            finalText = block.text;
            this.stream.emitTextDelta(block.text);
          }
        }

        // ── Act：执行工具调用 ─────────────────────────────────────────────────
        if (response.stop_reason === "tool_use") {
          const toolUseBlocks = assistantContent.filter(
            (b): b is Extract<LLMResponse["content"][number], { type: "tool_use" }> =>
              b.type === "tool_use"
          );

          // ── 冲突检测 ────────────────────────────────────────────────────────
          const toolCallsAsToolUseContent: ToolUseContent[] = toolUseBlocks.map(
            (b) => ({
              type: "tool_use" as const,
              id: b.id,
              name: b.name,
              input: b.input,
            })
          );

          const conflictReport = this.conflictDetector.check(
            toolCallsAsToolUseContent,
            this.decisionLog
          );

          if (conflictReport.hasConflict && this.disambiguationHandler) {
            // ── 消歧流程：暂停执行，等待用户选择 ──────────────────────────────
            const disambiguationOptions =
              await this.disambiguationHandler.resolve(conflictReport);

            // 通过 StreamBridge 发出 disambiguation 事件
            this.stream.emitDisambiguation(disambiguationOptions, conflictReport);

            // 挂起等待用户选择（Promise + 外部 resolve 模式）
            const choiceId = await this.waitForUserChoice(
              disambiguationOptions,
              conflictReport
            );

            // 用户选择后，写入 DecisionLog
            this.disambiguationHandler.applyChoice(
              choiceId,
              this.decisionLog,
              disambiguationOptions,
              conflictReport
            );

            // 将消歧结果作为上下文补充，让 LLM 在下轮知道用户的选择
            const chosenOption = disambiguationOptions.options.find(
              (o) => o.id === choiceId
            );
            if (chosenOption) {
              this.context.push("user", [
                {
                  type: "text" as const,
                  text: `[用户选择] ${chosenOption.description}（${chosenOption.expectedEffect}）`,
                },
              ]);
            }

            // 重新进入循环，让 LLM 根据用户选择重新规划
            continue;
          }

          // ── 无冲突，正常执行工具调用 ─────────────────────────────────────────
          const toolResults: ToolResultContent[] = [];

          for (const toolUse of toolUseBlocks) {
            this.stream.emitToolCall(toolUse.id, toolUse.name, toolUse.input);
            this.lifecycle.beginActing(toolUse.name, toolUse.id);
            const toolStartTime = Date.now();

            const { result, is_error } = await this.registry.execute(
              toolUse.name,
              toolUse.input
            );

            const toolDurationMs = Date.now() - toolStartTime;
            this.lifecycle.doneActing(
              toolUse.name,
              toolUse.id,
              toolDurationMs,
              is_error ?? false
            );

            const resultStr =
              typeof result === "string" ? result : JSON.stringify(result);

            this.stream.emitToolResult(toolUse.id, toolUse.name, result, is_error);

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: resultStr,
              is_error,
            });
          }

          // ── Observe：处理工具结果，准备下一轮 ───────────────────────────────
          this.lifecycle.beginObserving();
          this.context.push("user", toolResults as unknown as Message["content"]);
          continue;
        }

        // ── 终止条件 ──────────────────────────────────────────────────────────
        if (
          response.stop_reason === "end_turn" ||
          response.stop_reason === "max_tokens"
        ) {
          this.lifecycle.responding();
          break;
        }
      }

      // ── Completing ──────────────────────────────────────────────────────────
      this.lifecycle.complete();
      this.stream.emitDone(finalText);
      return finalText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (!this.lifecycle.isTerminal()) {
        this.lifecycle.fail(error);
      }
      this.stream.emitError(error);
      throw error;
    }
  }

  /**
   * 等待用户做出消歧选择
   *
   * 通过 Promise + 外部 resolve 模式实现挂起：
   * - 发布 DisambiguationPending 事件到 StreamBridge
   * - 外部调用者通过 pending.resolve(choiceId) 恢复执行
   */
  private waitForUserChoice(
    options: DisambiguationOptions,
    report: ConflictReport
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      const pending: DisambiguationPending = {
        options,
        report,
        resolve,
      };
      this.stream.emitDisambiguationPending(pending);
    });
  }

  /**
   * 清空对话历史，重置 Agent 状态
   */
  reset(): void {
    this.context.clear();
    this.decisionLog.clear();
    this.disambiguationHandler = null;
  }
}
