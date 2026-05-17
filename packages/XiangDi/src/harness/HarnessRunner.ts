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
 *   - Memory → 通过 MemoryManager 注入历史经验和已知事实
 *   - KnowledgeStore → 已迁移为 Tool 模式（knowledge_search），由 LLM 按需调用
 *
 * HumanGate 断点续跑：
 *   - HumanGate 触发时，调用 requestHumanDecision()（可被子类覆盖）
 *   - 子类（如 SSEHarnessRunner）可在此方法中：
 *       1. 将当前状态序列化到 CheckpointStore
 *       2. 推送 SSE human_gate 事件给前端
 *       3. 挂起 Promise，等待 /ai/resume/:runId 回调
 *   - resume(runId, decision) 方法从 CheckpointStore 恢复状态，继续执行
 *
 * 使用示例：
 * ```ts
 * const harness = new HarnessRunner(agentLoop, client, {
 *   guards: [Guards.hasAtLeastOneTask()],
 *   checkpoints: [Checkpoints.outputNotEmpty()],
 *   humanGates: [HumanGates.reviewProposal()],
 *   autoRun: false,
 * }, specLoader, memory);
 *
 * const result = await harness.run(changeSpec);
 * ```
 */

import type { AgentLoop, LLMClient } from "../core/AgentLoop.js";
import type { Message, MessageContent } from "../core/types.js";
import type { ChangeSpec, ProjectSpec, ProjectSpecLoader } from "../spec/types.js";
import type {
  HarnessConfig,
  HarnessContext,
  HarnessPhase,
  HarnessRunResult,
  HumanDecision,
  HumanGateTrigger,
} from "./types.js";
import type { MemoryManager } from "../memory/types.js";
import type { CheckpointStore } from "./checkpoint.js";
import { ContextManager } from "../core/ContextManager.js";
import { ChangeSpecBuilder } from "../spec/ChangeSpecBuilder.js";

// ─── HarnessRunner ────────────────────────────────────────────────────────────

export class HarnessRunner {
  private readonly config: Required<HarnessConfig>;
  private readonly specLoader: ProjectSpecLoader | null;
  private readonly memory: MemoryManager | null;
  protected readonly checkpointStore: CheckpointStore | null;
  /** 用于 after_run 时读取完整消息历史（checkpoint 序列化用） */
  private readonly contextManager: ContextManager | null;

  constructor(
    protected readonly agentLoop: AgentLoop,
    protected readonly llmClient: LLMClient,
    config: HarnessConfig = {},
    specLoader?: ProjectSpecLoader,
    memory?: MemoryManager,
    checkpointStore?: CheckpointStore,
    contextManager?: ContextManager
  ) {
    this.config = {
      guards: config.guards ?? [],
      checkpoints: config.checkpoints ?? [],
      humanGates: config.humanGates ?? [],
      autoRun: config.autoRun ?? false,
      maxRetries: config.maxRetries ?? 0,
    };
    this.specLoader = specLoader ?? null;
    this.memory = memory ?? null;
    this.checkpointStore = checkpointStore ?? null;
    this.contextManager = contextManager ?? null;
  }

  /**
   * 执行完整的 Harness 流程
   *
   * @param changeSpec 当前变更 Spec
   * @param runId 运行唯一标识（由调用方生成，用于 checkpoint 关联）
   * @param signal 可选的 AbortSignal
   */
  async run(
    changeSpec: ChangeSpec,
    runId?: string,
    signal?: AbortSignal
  ): Promise<HarnessRunResult> {
    const startTime = Date.now();
    const effectiveRunId = runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // ── 并行加载 ProjectSpec + Memory ────────────────────────────────────
    const taskDescription = `${changeSpec.title}\n${changeSpec.proposal.what}`;
    const [projectPrompt, memoryPrompt] = await Promise.all([
      this.buildProjectPrompt(),
      this.memory?.loadForTask(taskDescription) ?? Promise.resolve(null),
    ]);
    const systemPromptOverride = combinePromptSections(projectPrompt, memoryPrompt);

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
          context,
          effectiveRunId,
          [] // before_run 时消息历史为空
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

          // HumanGate on_error（不做 checkpoint，错误状态不适合序列化）
          const shouldRetry = await this.runHumanGates("on_error", context, effectiveRunId, []);
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

          await this.memory?.saveAfterTask({
            title: changeSpec.title,
            content: `执行完成但 Checkpoint "${checkpoint.name}" 未通过：${result.reason ?? "未知原因"}`,
            outcome: "failure",
            changeSpecId: changeSpec.id,
            importance: 0.6,
          });

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
      // 此时 AgentLoop 已完成，消息历史完整，是最重要的 checkpoint 点
      const messages = this.contextManager?.getMessages() ?? [];
      const shouldFinalize = await this.runHumanGates(
        "after_run",
        context,
        effectiveRunId,
        messages
      );
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

      // ── 保存成功经验 ──────────────────────────────────────────────────────
      await this.memory?.saveAfterTask({
        title: changeSpec.title,
        content: [
          `成功完成变更：${changeSpec.title}`,
          `任务数：${changeSpec.tasks.length}，全部完成。`,
          output ? `Agent 输出摘要：${output.slice(0, 200)}` : "",
        ].filter(Boolean).join("\n"),
        outcome: "success",
        changeSpecId: changeSpec.id,
        involvedEntities: changeSpec.tasks.map((t) => t.description).slice(0, 5),
        importance: 0.7,
      });

      return {
        success: true,
        output,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      context.phase = "error" as HarnessPhase;
      context.error = err instanceof Error ? err : new Error(String(err));

      await this.memory?.saveAfterTask({
        title: changeSpec.title,
        content: `执行异常中止：${context.error.message}`,
        outcome: "failure",
        changeSpecId: changeSpec.id,
        importance: 0.5,
      });

      return {
        success: false,
        failureReason: context.error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 从 checkpoint 恢复执行
   *
   * 进程重启后，用户通过 POST /ai/resume/:runId 触发此方法。
   * 从 CheckpointStore 读取序列化状态，重建上下文，从断点继续。
   *
   * @param runId 运行唯一标识
   * @param decision 用户的决策
   * @param signal 可选的 AbortSignal
   */
  async resume(
    runId: string,
    decision: HumanDecision,
    signal?: AbortSignal
  ): Promise<HarnessRunResult> {
    if (!this.checkpointStore) {
      return {
        success: false,
        failureReason: "No CheckpointStore configured, cannot resume",
        durationMs: 0,
      };
    }

    const checkpoint = await this.checkpointStore.load(runId);
    if (!checkpoint) {
      return {
        success: false,
        failureReason: `Checkpoint "${runId}" not found, expired, or already resumed`,
        durationMs: 0,
      };
    }

    // 标记为已恢复，防止重复恢复
    await this.checkpointStore.markResumed(runId);

    const startTime = Date.now();

    // ── 根据 waitingAt 决定从哪个 phase 继续 ─────────────────────────────
    if (checkpoint.waitingAt === "before_run") {
      // 用户在 before_run 做了决策，若批准则继续完整流程
      if (!decision.approved) {
        return {
          success: false,
          abortedByHuman: true,
          failureReason: "Aborted by human at before_run gate (resumed)",
          durationMs: Date.now() - startTime,
        };
      }

      // 若用户提供了 specPatch，更新 ChangeSpec
      const changeSpec = decision.specPatch
        ? { ...checkpoint.changeSpec, ...decision.specPatch, updatedAt: Date.now() }
        : checkpoint.changeSpec;

      // 从 Phase 3 继续（跳过 Guards 和 before_run HumanGate）
      return this.runFromPhase3(changeSpec, runId, signal);
    }

    if (checkpoint.waitingAt === "after_run") {
      // 用户在 after_run 做了决策
      if (!decision.approved) {
        return {
          success: false,
          output: checkpoint.agentOutput,
          abortedByHuman: true,
          failureReason: "Aborted by human at after_run gate (resumed)",
          durationMs: Date.now() - startTime,
        };
      }

      // 批准：直接完成，保存经验
      const changeSpec = checkpoint.changeSpec;
      await this.memory?.saveAfterTask({
        title: changeSpec.title,
        content: [
          `成功完成变更（用户确认）：${changeSpec.title}`,
          checkpoint.agentOutput ? `Agent 输出摘要：${checkpoint.agentOutput.slice(0, 200)}` : "",
        ].filter(Boolean).join("\n"),
        outcome: "success",
        changeSpecId: changeSpec.id,
        involvedEntities: changeSpec.tasks.map((t) => t.description).slice(0, 5),
        importance: 0.7,
      });

      return {
        success: true,
        output: checkpoint.agentOutput,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: false,
      failureReason: `Unknown waitingAt phase: ${checkpoint.waitingAt}`,
      durationMs: Date.now() - startTime,
    };
  }

  // ── 私有/受保护方法 ────────────────────────────────────────────────────────

  /**
   * 从 Phase 3（AgentLoop 执行）开始运行
   * 用于 before_run checkpoint 恢复后继续执行
   */
  private async runFromPhase3(
    changeSpec: ChangeSpec,
    runId: string,
    signal?: AbortSignal
  ): Promise<HarnessRunResult> {
    const startTime = Date.now();

    const [projectPrompt, memoryPrompt] = await Promise.all([
      this.buildProjectPrompt(),
      this.memory?.loadForTask(`${changeSpec.title}\n${changeSpec.proposal.what}`) ?? Promise.resolve(null),
    ]);
    const systemPromptOverride = combinePromptSections(projectPrompt, memoryPrompt);

    const context: HarnessContext = {
      changeSpec,
      phase: "running",
      metadata: {},
    };

    try {
      const userMessage = this.buildUserMessage(changeSpec);
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
          const shouldRetry = await this.runHumanGates("on_error", context, runId, []);
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

      // Checkpoints
      context.phase = "checkpointing";
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

      // after_run HumanGate
      const messages = this.contextManager?.getMessages() ?? [];
      const shouldFinalize = await this.runHumanGates("after_run", context, runId, messages);
      if (!shouldFinalize) {
        return {
          success: false,
          output,
          abortedByHuman: true,
          failureReason: "Aborted by human at after_run gate",
          durationMs: Date.now() - startTime,
        };
      }

      await this.memory?.saveAfterTask({
        title: changeSpec.title,
        content: [
          `成功完成变更：${changeSpec.title}`,
          `任务数：${changeSpec.tasks.length}，全部完成。`,
          output ? `Agent 输出摘要：${output.slice(0, 200)}` : "",
        ].filter(Boolean).join("\n"),
        outcome: "success",
        changeSpecId: changeSpec.id,
        involvedEntities: changeSpec.tasks.map((t) => t.description).slice(0, 5),
        importance: 0.7,
      });

      return { success: true, output, durationMs: Date.now() - startTime };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.memory?.saveAfterTask({
        title: changeSpec.title,
        content: `执行异常中止：${error.message}`,
        outcome: "failure",
        changeSpecId: changeSpec.id,
        importance: 0.5,
      });
      return { success: false, failureReason: error.message, durationMs: Date.now() - startTime };
    }
  }

  /**
   * 运行指定触发时机的所有 HumanGates
   *
   * @param trigger 触发时机
   * @param context 当前执行上下文
   * @param runId 运行唯一标识（用于 checkpoint）
   * @param messages 当前消息历史（用于 checkpoint 序列化）
   * @returns true 表示继续，false 表示中止
   */
  private async runHumanGates(
    trigger: HumanGateTrigger,
    context: HarnessContext,
    runId: string,
    messages: Message[]
  ): Promise<boolean> {
    const gates = this.config.humanGates.filter((g) => g.trigger === trigger);
    if (gates.length === 0) return true;

    context.phase = "waiting_human" as HarnessPhase;

    for (const gate of gates) {
      const prompt =
        typeof gate.prompt === "function" ? gate.prompt(context) : gate.prompt;

      const decision: HumanDecision = await this.requestHumanDecision(
        prompt,
        context,
        runId,
        trigger,
        messages
      );

      const shouldContinue = await gate.onDecision(decision, context);
      if (!shouldContinue) return false;

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
   * 基类实现：默认自动批准（不阻塞）。
   * 子类（SSEHarnessRunner）覆盖此方法，实现：
   *   1. 将状态序列化到 CheckpointStore
   *   2. 推送 SSE human_gate 事件
   *   3. 挂起 Promise，等待 /ai/resume/:runId 回调
   *
   * @param prompt 展示给用户的提示信息
   * @param context 当前执行上下文
   * @param runId 运行唯一标识
   * @param trigger 触发时机（用于 checkpoint 记录）
   * @param messages 当前消息历史（用于 checkpoint 序列化）
   */
  protected async requestHumanDecision(
    _prompt: string,
    _context: HarnessContext,
    _runId: string,
    _trigger: HumanGateTrigger,
    _messages: Message[]
  ): Promise<HumanDecision> {
    // 默认自动批准，不阻塞
    return { approved: true };
  }

  /**
   * 将 ChangeSpec 转化为 AgentLoop 的用户消息
   */
  private buildUserMessage(spec: ChangeSpec): MessageContent {
    return ChangeSpecBuilder.toMarkdown(spec);
  }

  /**
   * 加载 ProjectSpec 并构建 prompt 片段
   */
  private async buildProjectPrompt(): Promise<string | null> {
    if (!this.specLoader) return null;

    let projectSpec: ProjectSpec | null = null;
    try {
      projectSpec = await this.specLoader.load();
    } catch {
      return null;
    }

    if (!projectSpec) return null;
    return buildProjectSystemPrompt(projectSpec);
  }
}

// ─── ProjectSpec → system prompt 拼接 ────────────────────────────────────────

function buildProjectSystemPrompt(spec: ProjectSpec): string {
  const lines: string[] = [];

  lines.push(`# 项目规范：${spec.projectName}`);

  if (spec.description) {
    lines.push("", spec.description);
  }

  if (spec.conventions.length > 0) {
    lines.push("", "## 编码惯例");
    for (const c of spec.conventions) lines.push(`- ${c}`);
  }

  if (spec.prohibitions.length > 0) {
    lines.push("", "## 禁止事项");
    for (const p of spec.prohibitions) lines.push(`- ${p}`);
  }

  if (spec.agentGuidelines.length > 0) {
    lines.push("", "## Agent 行为指引");
    for (const g of spec.agentGuidelines) lines.push(`- ${g}`);
  }

  return lines.join("\n");
}

// ─── combinePromptSections ────────────────────────────────────────────────────

function combinePromptSections(
  ...sections: Array<string | null>
): string | null {
  const validSections = sections.filter(
    (s): s is string => s != null && s.length > 0
  );
  if (validSections.length === 0) return null;
  return validSections.join("\n\n");
}
