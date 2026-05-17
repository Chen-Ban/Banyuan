/**
 * 相地 · SSEHarnessRunner
 *
 * HarnessRunner 的 SSE 子类，覆盖 requestHumanDecision()，实现：
 *   1. 将当前状态序列化到 CheckpointStore（断点持久化）
 *   2. 通过 SSE 推送 human_gate 事件给前端（携带 runId + prompt）
 *   3. 挂起 Promise，等待 /ai/resume/:runId 回调
 *
 * 进程重启后的恢复流程：
 *   前端 → POST /ai/resume/:runId { approved, comment, specPatch }
 *        → SSEHarnessRunner.resume(runId, decision)
 *        → 从 CheckpointStore 读取状态
 *        → 继续执行
 *
 * SSE 事件格式：
 * ```
 * event: human_gate
 * data: { "runId": "...", "trigger": "before_run", "prompt": "..." }
 * ```
 *
 * 使用示例：
 * ```ts
 * const runner = new SSEHarnessRunner(
 *   loop, client,
 *   { humanGates: [HumanGates.reviewProposal()] },
 *   undefined, memory, checkpointStore,
 *   (event, data) => sseWrite(res, event, data)
 * );
 * const result = await runner.run(spec, runId);
 * ```
 */

import type { AgentLoop, LLMClient } from "../core/AgentLoop.js";
import type { Message } from "../core/types.js";
import type { ChangeSpec, ProjectSpecLoader } from "../spec/types.js";
import type { HarnessConfig, HarnessContext, HumanDecision, HumanGateTrigger } from "./types.js";
import type { MemoryManager } from "../memory/types.js";
import type { CheckpointStore } from "./checkpoint.js";
import { ContextManager } from "../core/ContextManager.js";
import { HarnessRunner } from "./HarnessRunner.js";

// ─── SSE 写入函数类型 ─────────────────────────────────────────────────────────

/**
 * SSE 写入函数
 * 由调用方（ai.ts 路由）提供，负责将事件写入 HTTP 响应流
 */
export type SSEWriteFn = (event: string, data: unknown) => void;

// ─── human_gate SSE 事件数据 ──────────────────────────────────────────────────

export interface HumanGateSSEData {
  /** 运行唯一标识，前端用此 ID 调用 POST /ai/resume/:runId */
  runId: string;
  /** 触发时机 */
  trigger: HumanGateTrigger;
  /** 展示给用户的提示信息 */
  prompt: string;
}

// ─── 挂起的 Promise 注册表 ────────────────────────────────────────────────────

/**
 * 全局注册表：runId → resolve 函数
 *
 * 当 /ai/resume/:runId 被调用时，通过此注册表找到对应的 Promise 并 resolve。
 *
 * 注意：这是进程内的内存注册表。
 *   - 若进程重启，注册表清空，挂起的 Promise 丢失。
 *   - 此时 resume() 方法会从 CheckpointStore 读取状态，重建执行上下文。
 *   - 因此 CheckpointStore 是跨进程恢复的关键，内存注册表仅用于同进程内的快速恢复。
 */
const pendingGates = new Map<string, (decision: HumanDecision) => void>();

/**
 * 注入人工决策（由 /ai/resume/:runId 路由调用）
 *
 * @param runId 运行唯一标识
 * @param decision 用户的决策
 * @returns true 表示找到了对应的挂起 Promise，false 表示未找到（可能进程已重启）
 */
export function injectHumanDecision(runId: string, decision: HumanDecision): boolean {
  const resolve = pendingGates.get(runId);
  if (!resolve) return false;
  pendingGates.delete(runId);
  resolve(decision);
  return true;
}

// ─── SSEHarnessRunner ─────────────────────────────────────────────────────────

export class SSEHarnessRunner extends HarnessRunner {
  private readonly sseWrite: SSEWriteFn;
  /** 等待超时（ms），超时后自动 abort，默认 30 分钟 */
  private readonly gateTimeoutMs: number;

  constructor(
    agentLoop: AgentLoop,
    llmClient: LLMClient,
    config: HarnessConfig = {},
    specLoader?: ProjectSpecLoader,
    memory?: MemoryManager,
    checkpointStore?: CheckpointStore,
    sseWrite?: SSEWriteFn,
    gateTimeoutMs?: number,
    contextManager?: ContextManager
  ) {
    super(agentLoop, llmClient, config, specLoader, memory, checkpointStore, contextManager);
    this.sseWrite = sseWrite ?? (() => {});
    this.gateTimeoutMs = gateTimeoutMs ?? 30 * 60 * 1000; // 30 分钟
  }

  /**
   * 覆盖基类的 requestHumanDecision
   *
   * 执行流程：
   *   1. 将当前状态序列化到 CheckpointStore（断点持久化）
   *   2. 推送 human_gate SSE 事件给前端
   *   3. 挂起 Promise，等待 injectHumanDecision(runId, decision) 被调用
   *   4. 若超时，自动 abort 并标记 checkpoint 为 aborted
   */
  protected override async requestHumanDecision(
    prompt: string,
    context: HarnessContext,
    runId: string,
    trigger: HumanGateTrigger,
    messages: Message[]
  ): Promise<HumanDecision> {
    // ── 1. 序列化到 CheckpointStore ──────────────────────────────────────────
    if (this.checkpointStore) {
      const now = Date.now();
      await this.checkpointStore.save({
        runId,
        waitingAt: trigger,
        gatePrompt: prompt,
        changeSpec: context.changeSpec,
        messages,
        agentOutput: context.result,
        createdAt: now,
        expiresAt: now + this.gateTimeoutMs,
        status: "pending",
      });
    }

    // ── 2. 推送 human_gate SSE 事件 ──────────────────────────────────────────
    const sseData: HumanGateSSEData = { runId, trigger, prompt };
    this.sseWrite("human_gate", sseData);

    // ── 3. 挂起 Promise，等待 injectHumanDecision ────────────────────────────
    const decision = await new Promise<HumanDecision>((resolve, reject) => {
      pendingGates.set(runId, resolve);

      // 超时自动 abort
      const timer = setTimeout(() => {
        if (pendingGates.has(runId)) {
          pendingGates.delete(runId);
          // 标记 checkpoint 为 aborted（异步，不阻塞）
          this.checkpointStore?.markAborted(runId).catch(() => {});
          reject(new Error(`HumanGate timeout after ${this.gateTimeoutMs}ms (runId: ${runId})`));
        }
      }, this.gateTimeoutMs);

      // 若 Promise 被 resolve（正常决策），清除超时计时器
      const originalResolve = resolve;
      pendingGates.set(runId, (d: HumanDecision) => {
        clearTimeout(timer);
        originalResolve(d);
      });
    });

    return decision;
  }
}
