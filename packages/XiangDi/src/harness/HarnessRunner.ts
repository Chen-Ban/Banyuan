/**
 * 相地 · HarnessRunner
 *
 * Harness 的核心执行器，包裹 AgentLoop，提供：
 *   1. Guard 前置检查（阻断不合规的执行）
 *   2. HumanGate 人工介入节点（暂停等待确认）
 *   3. AgentLoop 执行
 *   4. Checkpoint 后置验证（验证结果，触发回滚）
 *
 * 信息注入策略：
 *   - ProjectSpec → 通过 specLoader 管线注入 system prompt（全局约束，量小且稳定）
 *   - KnowledgeStore → 已迁移为 Tool 模式（knowledge_search），由 LLM 按需调用
 *     调用方在构造 AgentLoop 时通过 registerKnowledgeSearchTool(registry, store) 注册
 *
 * 使用示例：
 * ```ts
 * // 知识库注册到 ToolRegistry（Tool 模式）
 * const registry = new ToolRegistry();
 * registerKnowledgeSearchTool(registry, knowledgeStore);
 *
 * // Harness 只负责 ProjectSpec 管线注入
 * const harness = new HarnessRunner(agentLoop, llmClient, {
 *   guards: [specCompletedGuard, noEmptyTasksGuard],
 *   checkpoints: [outputNotEmptyCheckpoint],
 *   humanGates: [beforeRunGate],
 * }, specLoader);
 *
 * const result = await harness.run(changeSpec);
 * ```
 */

import type { AgentLoop, LLMClient } from "../core/AgentLoop.js";
import type { MessageContent } from "../core/types.js";
import type { ChangeSpec, ProjectSpec, ProjectSpecLoader } from "../spec/types.js";
import type {
  HarnessConfig,
  HarnessContext,
  HarnessPhase,
  HarnessRunResult,
  HumanDecision,
  HumanGateTrigger,
} from "./types.js";
import { ChangeSpecBuilder } from "../spec/ChangeSpecBuilder.js";

// ─── HarnessRunner ────────────────────────────────────────────────────────────

export class HarnessRunner {
  private readonly config: Required<HarnessConfig>;
  private readonly specLoader: ProjectSpecLoader | null;

  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly llmClient: LLMClient,
    config: HarnessConfig = {},
    specLoader?: ProjectSpecLoader
  ) {
    this.config = {
      guards: config.guards ?? [],
      checkpoints: config.checkpoints ?? [],
      humanGates: config.humanGates ?? [],
      autoRun: config.autoRun ?? false,
      maxRetries: config.maxRetries ?? 0,
    };
    this.specLoader = specLoader ?? null;
  }

  /**
   * 执行完整的 Harness 流程
   *
   * @param changeSpec 当前变更 Spec
   * @param signal 可选的 AbortSignal
   */
  async run(
    changeSpec: ChangeSpec,
    signal?: AbortSignal
  ): Promise<HarnessRunResult> {
    const startTime = Date.now();

    // ── 加载 ProjectSpec，构建 systemPromptOverride ────────────────────────
    // 注意：知识检索已从管线模式迁移为 Tool 模式（knowledge_search），
    // 由 LLM 在 AgentLoop 中按需主动调用，不再在此处预注入。
    const projectPrompt = await this.buildProjectPrompt();
    const systemPromptOverride = combinePromptSections(projectPrompt);

    const context: HarnessContext = {
      changeSpec,
      phase: "idle",
      metadata: {},
    };

    try {
      // ── Phase 1: Guards ──────────────────────────────────────────────────
      context.phase = "guarding" as HarnessPhase;

      for (const guard of this.config.guards) {
        const result = await guard.fn(context);
        if (!result.passed) {
          return {
            success: false,
            failureReason: result.reason ?? `Guard "${guard.name}" failed`,
            blockedBy: guard.name,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // ── Phase 2: HumanGate（before_run）─────────────────────────────────
      if (!this.config.autoRun) {
        const shouldContinue = await this.runHumanGates(
          "before_run",
          context
        );
        if (!shouldContinue) {
          return {
            success: false,
            abortedByHuman: true,
            failureReason: "Aborted by human at before_run gate",
            durationMs: Date.now() - startTime,
          };
        }
      }

      // ── Phase 3: AgentLoop 执行 ──────────────────────────────────────────
      context.phase = "running" as HarnessPhase;

      const userMessage = this.buildUserMessage(context.changeSpec);
      let output: string;

      let retries = 0;
      while (true) {
        try {
          output = await this.agentLoop.run(
            this.llmClient,
            userMessage,
            signal,
            systemPromptOverride ?? undefined
          );
          context.result = output;
          break;
        } catch (err) {
          if (retries >= this.config.maxRetries) throw err;
          retries++;
          context.error = err instanceof Error ? err : new Error(String(err));

          // HumanGate on_error
          const shouldRetry = await this.runHumanGates("on_error", context);
          if (!shouldRetry) {
            return {
              success: false,
              abortedByHuman: true,
              failureReason: "Aborted by human at on_error gate",
              durationMs: Date.now() - startTime,
            };
          }
        }
      }

      // ── Phase 4: Checkpoints ─────────────────────────────────────────────
      context.phase = "checkpointing" as HarnessPhase;

      for (const checkpoint of this.config.checkpoints) {
        const result = await checkpoint.fn(context);
        if (!result.passed) {
          if (result.needsRollback && checkpoint.rollback) {
            await checkpoint.rollback(context);
          }
          return {
            success: false,
            output,
            failureReason: result.reason ?? `Checkpoint "${checkpoint.name}" failed`,
            failedCheckpoint: checkpoint.name,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // ── Phase 5: HumanGate（after_run）──────────────────────────────────
      const shouldFinalize = await this.runHumanGates("after_run", context);
      if (!shouldFinalize) {
        return {
          success: false,
          output,
          abortedByHuman: true,
          failureReason: "Aborted by human at after_run gate",
          durationMs: Date.now() - startTime,
        };
      }

      context.phase = "done" as HarnessPhase;

      return {
        success: true,
        output,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      context.phase = "error" as HarnessPhase;
      context.error = err instanceof Error ? err : new Error(String(err));

      return {
        success: false,
        failureReason: context.error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ── 私有方法 ──────────────────────────────────────────────────────────────

  /**
   * 运行指定触发时机的所有 HumanGates
   * 返回 true 表示继续，false 表示中止
   */
  private async runHumanGates(
    trigger: HumanGateTrigger,
    context: HarnessContext
  ): Promise<boolean> {
    const gates = this.config.humanGates.filter((g) => g.trigger === trigger);
    if (gates.length === 0) return true;

    context.phase = "waiting_human" as HarnessPhase;

    for (const gate of gates) {
      const prompt =
        typeof gate.prompt === "function" ? gate.prompt(context) : gate.prompt;

      // 默认决策：自动批准（骨架实现）
      // 实际使用时，调用方应通过 onDecision 回调接入 UI 或 CLI 交互
      const decision: HumanDecision = await this.requestHumanDecision(
        prompt,
        context
      );

      const shouldContinue = await gate.onDecision(decision, context);
      if (!shouldContinue) return false;

      // 若用户提供了 specPatch，更新 ChangeSpec
      if (decision.specPatch) {
        context.changeSpec = {
          ...context.changeSpec,
          ...decision.specPatch,
          updatedAt: Date.now(),
        };
      }
    }

    return true;
  }

  /**
   * 请求人工决策
   *
   * 骨架实现：默认自动批准。
   * 实际使用时，子类或调用方应覆盖此方法，接入真实的 UI/CLI 交互。
   *
   * TODO: 提供 InteractiveHarnessRunner 子类，支持 readline / WebSocket 等交互方式
   */
  protected async requestHumanDecision(
    _prompt: string,
    _context: HarnessContext
  ): Promise<HumanDecision> {
    // 默认自动批准，不阻塞
    return { approved: true };
  }

  /**
   * 将 ChangeSpec 转化为 AgentLoop 的用户消息
   * 注入 proposal + tasks，让 Agent 知道"这次要做什么"
   */
  private buildUserMessage(spec: ChangeSpec): MessageContent {
    const markdown = ChangeSpecBuilder.toMarkdown(spec);
    return markdown;
  }

  /**
   * 加载 ProjectSpec 并构建 prompt 片段
   *
   * - 若没有 specLoader，返回 null
   * - 若加载失败或返回 null，同样返回 null
   * - 若加载成功，格式化为 system prompt 片段
   */
  private async buildProjectPrompt(): Promise<string | null> {
    if (!this.specLoader) return null;

    let projectSpec: ProjectSpec | null = null;
    try {
      projectSpec = await this.specLoader.load();
    } catch {
      // 加载失败时静默降级，不阻断执行
      return null;
    }

    if (!projectSpec) return null;

    return buildProjectSystemPrompt(projectSpec);
  }
}

// ─── ProjectSpec → system prompt 拼接 ────────────────────────────────────────

/**
 * 将 ProjectSpec 转化为注入 AgentLoop 的 system prompt 片段
 *
 * 格式：
 * ```
 * # 项目规范：<projectName>
 *
 * <description>
 *
 * ## 编码惯例
 * - ...
 *
 * ## 禁止事项
 * - ...
 *
 * ## Agent 行为指引
 * - ...
 * ```
 */
function buildProjectSystemPrompt(spec: ProjectSpec): string {
  const lines: string[] = [];

  lines.push(`# 项目规范：${spec.projectName}`);

  if (spec.description) {
    lines.push("", spec.description);
  }

  if (spec.conventions.length > 0) {
    lines.push("", "## 编码惯例");
    for (const c of spec.conventions) {
      lines.push(`- ${c}`);
    }
  }

  if (spec.prohibitions.length > 0) {
    lines.push("", "## 禁止事项");
    for (const p of spec.prohibitions) {
      lines.push(`- ${p}`);
    }
  }

  if (spec.agentGuidelines.length > 0) {
    lines.push("", "## Agent 行为指引");
    for (const g of spec.agentGuidelines) {
      lines.push(`- ${g}`);
    }
  }

  return lines.join("\n");
}

// ─── combinePromptSections ────────────────────────────────────────────────────

/**
 * 将多个可能为 null 的 prompt 片段合并为一个完整的 systemPromptOverride。
 *
 * - 过滤掉 null 值
 * - 若所有片段都为 null，返回 null（不覆盖 AgentLoop 默认 systemPrompt）
 * - 否则用双换行连接各片段
 */
function combinePromptSections(
  ...sections: Array<string | null>
): string | null {
  const validSections = sections.filter(
    (s): s is string => s != null && s.length > 0
  );

  if (validSections.length === 0) return null;

  return validSections.join("\n\n");
}
