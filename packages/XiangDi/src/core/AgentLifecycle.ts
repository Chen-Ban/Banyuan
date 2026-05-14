/**
 * 相地 · Agent 生命周期状态机
 *
 * 参考设计：
 *   - OpenAI Assistants API：Run 状态模型（queued → in_progress → completed）
 *   - Anthropic Agentic Loop：循环模式（think → act → observe）
 *   - 可观测性最佳实践：事件驱动 + 状态快照
 *
 * 设计原则：
 *   1. 务实：只定义 MVP 真正需要的状态，不过度设计
 *   2. 可观测：每次状态变迁产生事件，外部可订阅
 *   3. 可中断：任何状态都可以被外部 abort
 *   4. 精简：Phase（宏观）+ Step（微观），两层足矣
 *
 * 状态流转：
 *
 *   idle ──→ initializing ──→ running ──→ completing ──→ completed
 *                              │    ↑
 *                              │    └── loop ──┐
 *                              │               │
 *                              ├─ thinking ────┤
 *                              ├─ acting ──────┤
 *                              └─ observing ───┘
 *
 *   任何状态 ──→ errored | cancelled
 */

// ─── Agent Phase（主阶段）────────────────────────────────────────────────────

/**
 * Agent 主阶段（对应 OpenAI Run Status 的简化版）
 *
 * 精简为 6 种，覆盖完整生命周期：
 *   - idle：空闲
 *   - initializing：准备上下文（加载知识、构建 prompt）
 *   - running：主循环执行中（thinking / acting / observing 在 Step 层区分）
 *   - completing：收尾（checkpoint 验证、保存记忆）
 *   - completed / errored / cancelled：终态
 */
export type AgentPhase =
  | "idle"
  | "initializing"
  | "running"
  | "completing"
  | "completed"
  | "errored"
  | "cancelled";

// ─── Agent Step（细粒度步骤）─────────────────────────────────────────────────

/**
 * Agent 细粒度步骤
 *
 * 对齐 ReAct 循环的三个核心动作 + 初始化/收尾步骤。
 * 比之前的 17 种精简为 9 种，每种都有明确的用途：
 *
 *   - idle：无操作
 *   - preparing：初始化阶段（加载知识 + 构建 prompt）
 *   - thinking：LLM 正在推理
 *   - acting：正在执行工具
 *   - observing：处理工具结果，准备下一轮
 *   - responding：LLM 给出最终回复（end_turn）
 *   - checkpointing：验证输出质量
 *   - saving：保存记忆/经验
 *   - waiting_human：等待人工确认
 */
export type AgentStep =
  | "idle"
  | "preparing"
  | "thinking"
  | "acting"
  | "observing"
  | "responding"
  | "checkpointing"
  | "saving"
  | "waiting_human";

// ─── 状态变迁事件 ─────────────────────────────────────────────────────────────

/**
 * 状态变迁事件
 */
export interface LifecycleEvent {
  /** 事件序号 */
  seq: number;
  /** 时间戳 */
  timestamp: number;
  /** 变迁前 phase */
  fromPhase: AgentPhase;
  /** 变迁后 phase */
  toPhase: AgentPhase;
  /** 当前步骤 */
  step: AgentStep;
  /** 循环轮次 */
  iteration: number;
  /** 附加详情 */
  detail?: LifecycleEventDetail;
}

/**
 * 事件详情
 */
export type LifecycleEventDetail =
  | { kind: "llm_start"; model: string }
  | { kind: "llm_done"; durationMs: number; stopReason: string; tokensUsed?: number }
  | { kind: "tool_start"; toolName: string; toolId: string }
  | { kind: "tool_done"; toolName: string; toolId: string; durationMs: number; isError: boolean }
  | { kind: "error"; error: Error; recoverable: boolean }
  | { kind: "cancelled"; reason: string }
  | { kind: "human_gate"; gateName: string; prompt: string }
  | { kind: "info"; message: string };

// ─── Agent 状态快照 ──────────────────────────────────────────────────────────

/**
 * Agent 完整状态快照
 */
export interface AgentStateSnapshot {
  runId: string;
  phase: AgentPhase;
  step: AgentStep;
  iteration: number;
  maxIterations: number;
  startedAt: number;
  stepStartedAt: number;
  /** 累计 LLM 调用次数 */
  llmCallCount: number;
  /** 累计工具调用次数 */
  toolCallCount: number;
  /** 累计 token 消耗 */
  totalTokensUsed: number;
  /** 累计 LLM 耗时 */
  totalLlmDurationMs: number;
  /** 累计工具耗时 */
  totalToolDurationMs: number;
  /** 当前执行的工具名 */
  activeToolName?: string;
  /** 当前 LLM provider */
  activeProviderId?: string;
  /** 错误信息 */
  error?: Error;
  /** 取消原因 */
  cancelReason?: string;
}

// ─── 生命周期管理器 ──────────────────────────────────────────────────────────

export type LifecycleListener = (event: LifecycleEvent) => void;

/**
 * AgentLifecycle 管理器
 *
 * 独立组件，不依赖 AgentLoop 具体实现。
 * 通过 subscribe() 暴露事件，通过 getSnapshot() 暴露状态。
 */
export class AgentLifecycle {
  private phase: AgentPhase = "idle";
  private step: AgentStep = "idle";
  private iteration = 0;
  private maxIterations = 20;
  private seq = 0;
  private startedAt = 0;
  private stepStartedAt = 0;

  private llmCallCount = 0;
  private toolCallCount = 0;
  private totalTokensUsed = 0;
  private totalLlmDurationMs = 0;
  private totalToolDurationMs = 0;

  private activeToolName?: string;
  private activeProviderId?: string;
  private error?: Error;
  private cancelReason?: string;
  private runId = "";

  private listeners: LifecycleListener[] = [];
  private history: LifecycleEvent[] = [];
  private readonly maxHistorySize: number;

  constructor(options?: { maxHistorySize?: number }) {
    this.maxHistorySize = options?.maxHistorySize ?? 200;
  }

  // ── 订阅 ──────────────────────────────────────────────────────────────────

  subscribe(listener: LifecycleListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ── 通用状态变迁 ──────────────────────────────────────────────────────────

  private transition(toPhase: AgentPhase, toStep: AgentStep, detail?: LifecycleEventDetail): void {
    const fromPhase = this.phase;
    this.phase = toPhase;
    this.step = toStep;
    this.stepStartedAt = Date.now();

    const event: LifecycleEvent = {
      seq: ++this.seq,
      timestamp: Date.now(),
      fromPhase,
      toPhase,
      step: toStep,
      iteration: this.iteration,
      detail,
    };

    this.history.push(event);
    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }

    this.emitEvent(event);
  }

  // ── 语义化状态切换 ────────────────────────────────────────────────────────

  /** 开始一次新 run */
  start(runId: string, maxIterations: number): void {
    this.runId = runId;
    this.maxIterations = maxIterations;
    this.iteration = 0;
    this.startedAt = Date.now();
    this.llmCallCount = 0;
    this.toolCallCount = 0;
    this.totalTokensUsed = 0;
    this.totalLlmDurationMs = 0;
    this.totalToolDurationMs = 0;
    this.error = undefined;
    this.cancelReason = undefined;
    this.activeToolName = undefined;

    this.transition("initializing", "preparing");
  }

  /** 初始化完成，进入主循环 */
  beginLoop(): void {
    this.transition("running", "thinking");
  }

  /** 新一轮循环 */
  nextIteration(): void {
    this.iteration++;
    this.transition("running", "thinking");
  }

  /** 开始 LLM 推理 */
  beginThinking(model: string): void {
    this.llmCallCount++;
    this.transition("running", "thinking", { kind: "llm_start", model });
  }

  /** LLM 推理完成 */
  doneThinking(durationMs: number, stopReason: string, tokensUsed?: number): void {
    this.totalLlmDurationMs += durationMs;
    if (tokensUsed) this.totalTokensUsed += tokensUsed;
    this.transition("running", "thinking", {
      kind: "llm_done",
      durationMs,
      stopReason,
      tokensUsed,
    });
  }

  /** 开始执行工具 */
  beginActing(toolName: string, toolId: string): void {
    this.toolCallCount++;
    this.activeToolName = toolName;
    this.transition("running", "acting", { kind: "tool_start", toolName, toolId });
  }

  /** 工具执行完成 */
  doneActing(toolName: string, toolId: string, durationMs: number, isError: boolean): void {
    this.totalToolDurationMs += durationMs;
    this.activeToolName = undefined;
    this.transition("running", "acting", {
      kind: "tool_done",
      toolName,
      toolId,
      durationMs,
      isError,
    });
  }

  /** 进入观察阶段（处理工具结果） */
  beginObserving(): void {
    this.transition("running", "observing");
  }

  /** LLM 输出最终回复 */
  responding(): void {
    this.transition("running", "responding");
  }

  /** Checkpoint 验证 */
  beginCheckpoint(): void {
    this.transition("completing", "checkpointing");
  }

  /** 保存记忆 */
  beginSaving(): void {
    this.transition("completing", "saving");
  }

  /** 等待人工 */
  waitHuman(gateName: string, prompt: string): void {
    this.transition("running", "waiting_human", {
      kind: "human_gate",
      gateName,
      prompt,
    });
  }

  /** 完成 */
  complete(): void {
    this.transition("completed", "idle");
  }

  /** 异常 */
  fail(error: Error, recoverable = false): void {
    this.error = error;
    this.transition("errored", "idle", { kind: "error", error, recoverable });
  }

  /** 取消 */
  cancel(reason = "User cancelled"): void {
    this.cancelReason = reason;
    this.transition("cancelled", "idle", { kind: "cancelled", reason });
  }

  // ── 查询 ──────────────────────────────────────────────────────────────────

  getSnapshot(): AgentStateSnapshot {
    return {
      runId: this.runId,
      phase: this.phase,
      step: this.step,
      iteration: this.iteration,
      maxIterations: this.maxIterations,
      startedAt: this.startedAt,
      stepStartedAt: this.stepStartedAt,
      llmCallCount: this.llmCallCount,
      toolCallCount: this.toolCallCount,
      totalTokensUsed: this.totalTokensUsed,
      totalLlmDurationMs: this.totalLlmDurationMs,
      totalToolDurationMs: this.totalToolDurationMs,
      activeToolName: this.activeToolName,
      activeProviderId: this.activeProviderId,
      error: this.error,
      cancelReason: this.cancelReason,
    };
  }

  getPhase(): AgentPhase { return this.phase; }
  getStep(): AgentStep { return this.step; }
  getHistory(): readonly LifecycleEvent[] { return this.history; }
  getStepElapsedMs(): number { return Date.now() - this.stepStartedAt; }
  getTotalElapsedMs(): number { return this.startedAt ? Date.now() - this.startedAt : 0; }

  setActiveProvider(providerId: string): void {
    this.activeProviderId = providerId;
  }

  isTerminal(): boolean {
    return this.phase === "completed" || this.phase === "errored" || this.phase === "cancelled";
  }

  isRunning(): boolean {
    return this.phase === "running" || this.phase === "initializing" || this.phase === "completing";
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  private emitEvent(event: LifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 单个监听器错误不影响其他
      }
    }
  }
}
