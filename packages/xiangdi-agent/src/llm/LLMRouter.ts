/**
 * 相地 · LLM 动态路由层（LLMRouter）
 *
 * 在 LLMClient 之上的代理层，提供：
 *   1. 异常检测：识别限额（429）、超时、模型错误等问题
 *   2. 健康状态追踪：记录每个 provider 的可用性和延迟
 *   3. 切换信号发射：当检测到问题时产生 RoutingSignal
 *   4. 回退口子：预留 provider 切换接口，MVP 阶段不实际切换
 *
 * 注意：底层重试由 openai SDK 的 maxRetries 参数负责（默认 2 次）。
 * LLMRouter 不再手写重试循环，只在 SDK 抛出最终错误后记录健康状态并发射信号。
 *
 * MVP 行为：
 *   - 始终使用 primary provider（当前为 DeepSeek）
 *   - 检测到问题时记录事件、发射信号，但继续使用原 provider
 *   - 不做真正的 fallback 切换
 *
 * 未来扩展：
 *   - 注册多个 provider（DeepSeek / OpenAI / Claude / 本地模型）
 *   - 检测到问题后自动切换到健康的 provider
 *   - 基于成本/延迟/质量的智能路由
 *   - 负载均衡
 *
 * 使用示例：
 * ```ts
 * const router = new LLMRouter({
 *   primary: deepseekClient,
 *   onSignal: (signal) => console.log("LLM issue detected:", signal),
 * });
 *
 * // 当作普通 LLMClient 使用，对 MasterGraph 透明
 * const response = await router.createMessage(messages, tools);
 * ```
 */

import type { LLMClient, LLMResponse, OnTokenCallback } from "../core/llmTypes.js";
import type { Message } from "../core/types.js";

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/**
 * LLM Provider 描述
 */
export interface LLMProvider {
  /** 唯一标识，如 "deepseek"、"openai"、"claude" */
  id: string;
  /** LLMClient 实现 */
  client: LLMClient;
  /** 优先级（数值越小优先级越高），默认 0 */
  priority?: number;
  /** 该 provider 支持的模型列表（可选，用于精确路由） */
  models?: string[];
}

/**
 * Provider 健康状态
 */
export interface ProviderHealth {
  /** Provider ID */
  providerId: string;
  /** 当前状态 */
  status: "healthy" | "degraded" | "unavailable";
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 最近 N 次请求的平均延迟（ms） */
  avgLatencyMs: number;
  /** 最后一次成功时间 */
  lastSuccessAt: number | null;
  /** 最后一次失败时间 */
  lastFailureAt: number | null;
  /** 最后一次失败原因 */
  lastFailureReason: string | null;
  /** 最近的请求延迟记录（滑动窗口） */
  latencyWindow: number[];
}

/**
 * 路由信号：当检测到问题时发射
 */
export interface RoutingSignal {
  /** 信号类型 */
  type: RoutingSignalType;
  /** 产生信号的 provider */
  providerId: string;
  /** 信号描述 */
  message: string;
  /** 时间戳 */
  timestamp: number;
  /** 建议动作（MVP 阶段仅为建议，不自动执行） */
  suggestedAction: SuggestedAction;
  /** 原始错误信息 */
  errorDetail?: string;
  /** 当时的 provider 健康状态快照 */
  healthSnapshot: ProviderHealth;
}

export type RoutingSignalType =
  | "rate_limited"        // 429 限额
  | "timeout"             // 请求超时
  | "server_error"        // 5xx 服务端错误
  | "model_error"         // 模型返回异常（空响应、格式错误等）
  | "high_latency"        // 延迟过高（超过阈值）
  | "consecutive_failures"; // 连续多次失败

export type SuggestedAction =
  | "retry"               // 建议重试当前 provider
  | "switch_provider"     // 建议切换到其他 provider
  | "wait_and_retry"      // 建议等待后重试（限额场景）
  | "alert_user";         // 建议通知用户

/**
 * 信号监听回调
 */
export type SignalListener = (signal: RoutingSignal) => void;

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LLMRouterConfig {
  /** 主 provider（必选） */
  primary: LLMProvider | LLMClient;
  /** 备选 providers（MVP 阶段注册但不自动切换） */
  fallbacks?: LLMProvider[];
  /** 信号监听回调 */
  onSignal?: SignalListener;
  /** 高延迟阈值（ms），超过此值触发 high_latency 信号，默认 30000 */
  highLatencyThresholdMs?: number;
  /** 连续失败多少次触发 consecutive_failures 信号，默认 3 */
  consecutiveFailureThreshold?: number;
  /** 延迟滑动窗口大小，默认 10 */
  latencyWindowSize?: number;
  /** 是否自动切换（MVP 阶段应为 false），默认 false */
  autoSwitch?: boolean;
}

// ─── LLMRouter ────────────────────────────────────────────────────────────────

/**
 * LLM 动态路由器
 *
 * 实现 LLMClient 接口，对 MasterGraph 完全透明。
 * MVP 阶段：检测异常、记录健康状态、发射信号，不做真正切换。
 * 底层重试由 openai SDK 负责，Router 只处理 SDK 最终抛出的错误。
 */
export class LLMRouter implements LLMClient {
  private readonly providers: Map<string, LLMProvider> = new Map();
  private readonly healthMap: Map<string, ProviderHealth> = new Map();
  private readonly signalHistory: RoutingSignal[] = [];
  private readonly onSignal: SignalListener | null;

  private readonly highLatencyThresholdMs: number;
  private readonly consecutiveFailureThreshold: number;
  private readonly latencyWindowSize: number;
  private readonly autoSwitch: boolean;

  private activeProviderId: string;

  constructor(config: LLMRouterConfig) {
    // 注册 primary
    const primary = normalizeLLMProvider(config.primary, "primary");
    this.providers.set(primary.id, primary);
    this.healthMap.set(primary.id, createInitialHealth(primary.id));
    this.activeProviderId = primary.id;

    // 注册 fallbacks
    if (config.fallbacks) {
      for (const fb of config.fallbacks) {
        this.providers.set(fb.id, fb);
        this.healthMap.set(fb.id, createInitialHealth(fb.id));
      }
    }

    this.onSignal = config.onSignal ?? null;
    this.highLatencyThresholdMs = config.highLatencyThresholdMs ?? 30_000;
    this.consecutiveFailureThreshold = config.consecutiveFailureThreshold ?? 3;
    this.latencyWindowSize = config.latencyWindowSize ?? 10;
    this.autoSwitch = config.autoSwitch ?? false;
  }

  // ── LLMClient 接口实现 ──────────────────────────────────────────────────────

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: unknown[];
    temperature?: number;
  }): Promise<LLMResponse> {
    const provider = this.getActiveProvider();
    const health = this.healthMap.get(provider.id)!;
    const startTime = Date.now();

    try {
      const response = await provider.client.createMessage(params);
      const latency = Date.now() - startTime;

      // 成功：更新健康状态
      this.recordSuccess(health, latency);

      // 检查高延迟
      if (latency > this.highLatencyThresholdMs) {
        this.emitSignal({
          type: "high_latency",
          providerId: provider.id,
          message: `请求延迟 ${latency}ms 超过阈值 ${this.highLatencyThresholdMs}ms`,
          suggestedAction: "retry",
          healthSnapshot: { ...health },
        });
      }

      // 检查模型返回质量
      const qualityIssue = checkResponseQuality(response);
      if (qualityIssue) {
        this.emitSignal({
          type: "model_error",
          providerId: provider.id,
          message: qualityIssue,
          suggestedAction: "retry",
          errorDetail: qualityIssue,
          healthSnapshot: { ...health },
        });
      }

      return response;
    } catch (err) {
      const latency = Date.now() - startTime;
      const error = err instanceof Error ? err : new Error(String(err));

      // 失败：更新健康状态（此时 SDK 已完成内部重试）
      this.recordFailure(health, error.message);

      // 分类错误并发射信号
      const signalType = classifyError(error, latency, this.highLatencyThresholdMs);
      const suggestedAction = determineSuggestedAction(
        signalType,
        health.consecutiveFailures,
        this.consecutiveFailureThreshold
      );

      this.emitSignal({
        type: signalType,
        providerId: provider.id,
        message: `请求失败（SDK 重试已耗尽）: ${error.message}`,
        suggestedAction,
        errorDetail: error.message,
        healthSnapshot: { ...health },
      });

      // 连续失败信号
      if (health.consecutiveFailures >= this.consecutiveFailureThreshold) {
        this.emitSignal({
          type: "consecutive_failures",
          providerId: provider.id,
          message: `连续失败 ${health.consecutiveFailures} 次，已达阈值`,
          suggestedAction: "switch_provider",
          healthSnapshot: { ...health },
        });

        // 未来：autoSwitch 为 true 时，这里执行真正的切换
        if (this.autoSwitch) {
          const fallback = this.findHealthyFallback(provider.id);
          if (fallback) {
            this.activeProviderId = fallback.id;
          }
        }
      }

      throw error;
    }
  }

  async createMessageStream(
    params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Message[];
      tools?: unknown[];
      temperature?: number;
    },
    onToken: OnTokenCallback
  ): Promise<LLMResponse> {
    const provider = this.getActiveProvider();
    const health = this.healthMap.get(provider.id)!;
    const startTime = Date.now();

    try {
      const response = await provider.client.createMessageStream(params, onToken);
      const latency = Date.now() - startTime;

      this.recordSuccess(health, latency);

      if (latency > this.highLatencyThresholdMs) {
        this.emitSignal({
          type: "high_latency",
          providerId: provider.id,
          message: `流式请求延迟 ${latency}ms 超过阈值 ${this.highLatencyThresholdMs}ms`,
          suggestedAction: "retry",
          healthSnapshot: { ...health },
        });
      }

      return response;
    } catch (err) {
      const latency = Date.now() - startTime;
      const error = err instanceof Error ? err : new Error(String(err));

      this.recordFailure(health, error.message);

      const signalType = classifyError(error, latency, this.highLatencyThresholdMs);
      const suggestedAction = determineSuggestedAction(
        signalType,
        health.consecutiveFailures,
        this.consecutiveFailureThreshold
      );

      this.emitSignal({
        type: signalType,
        providerId: provider.id,
        message: `流式请求失败: ${error.message}`,
        suggestedAction,
        errorDetail: error.message,
        healthSnapshot: { ...health },
      });

      throw error;
    }
  }

  // ── 公开查询接口 ──────────────────────────────────────────────────────────

  /** 获取所有 provider 的健康状态 */
  getHealthStatus(): Map<string, ProviderHealth> {
    return new Map(this.healthMap);
  }

  /** 获取当前活跃的 provider ID */
  getActiveProviderId(): string {
    return this.activeProviderId;
  }

  /** 获取信号历史（最近 N 条） */
  getSignalHistory(limit = 20): RoutingSignal[] {
    return this.signalHistory.slice(-limit);
  }

  /** 手动切换 provider（供外部控制，MVP 阶段可通过 UI/CLI 调用） */
  switchTo(providerId: string): boolean {
    if (!this.providers.has(providerId)) return false;
    this.activeProviderId = providerId;
    return true;
  }

  /** 手动重置某个 provider 的健康状态（标记为可用） */
  resetHealth(providerId: string): void {
    const health = this.healthMap.get(providerId);
    if (health) {
      health.status = "healthy";
      health.consecutiveFailures = 0;
      health.lastFailureReason = null;
    }
  }

  /** 注册新的 fallback provider（运行时动态注册） */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.healthMap.has(provider.id)) {
      this.healthMap.set(provider.id, createInitialHealth(provider.id));
    }
  }

  // ── 内部方法 ──────────────────────────────────────────────────────────────

  private getActiveProvider(): LLMProvider {
    return this.providers.get(this.activeProviderId)!;
  }

  private findHealthyFallback(excludeId: string): LLMProvider | null {
    const candidates = [...this.providers.values()]
      .filter((p) => p.id !== excludeId)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    for (const candidate of candidates) {
      const health = this.healthMap.get(candidate.id);
      if (health && health.status !== "unavailable") {
        return candidate;
      }
    }
    return null;
  }

  private recordSuccess(health: ProviderHealth, latencyMs: number): void {
    health.status = "healthy";
    health.consecutiveFailures = 0;
    health.lastSuccessAt = Date.now();

    health.latencyWindow.push(latencyMs);
    if (health.latencyWindow.length > this.latencyWindowSize) {
      health.latencyWindow.shift();
    }
    health.avgLatencyMs =
      health.latencyWindow.reduce((a, b) => a + b, 0) / health.latencyWindow.length;
  }

  private recordFailure(health: ProviderHealth, reason: string): void {
    health.consecutiveFailures++;
    health.lastFailureAt = Date.now();
    health.lastFailureReason = reason;

    if (health.consecutiveFailures >= this.consecutiveFailureThreshold) {
      health.status = "unavailable";
    } else if (health.consecutiveFailures >= 1) {
      health.status = "degraded";
    }
  }

  private emitSignal(partial: Omit<RoutingSignal, "timestamp">): void {
    const signal: RoutingSignal = {
      ...partial,
      timestamp: Date.now(),
    };

    this.signalHistory.push(signal);
    if (this.signalHistory.length > 100) {
      this.signalHistory.splice(0, this.signalHistory.length - 100);
    }

    if (this.onSignal) {
      try {
        this.onSignal(signal);
      } catch {
        // 监听器错误不影响主流程
      }
    }
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

function normalizeLLMProvider(
  input: LLMProvider | LLMClient,
  defaultId: string
): LLMProvider {
  if ("createMessage" in input && !("client" in input)) {
    return { id: defaultId, client: input, priority: 0 };
  }
  return input as LLMProvider;
}

function createInitialHealth(providerId: string): ProviderHealth {
  return {
    providerId,
    status: "healthy",
    consecutiveFailures: 0,
    avgLatencyMs: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    latencyWindow: [],
  };
}

function classifyError(
  error: Error,
  latencyMs: number,
  timeoutThreshold: number
): RoutingSignalType {
  const msg = error.message.toLowerCase();

  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many")) {
    return "rate_limited";
  }
  if (msg.includes("timeout") || msg.includes("aborted") || latencyMs >= timeoutThreshold) {
    return "timeout";
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
    return "server_error";
  }
  if (msg.includes("model") || msg.includes("invalid") || msg.includes("not found")) {
    return "model_error";
  }

  return "server_error";
}

function determineSuggestedAction(
  signalType: RoutingSignalType,
  consecutiveFailures: number,
  threshold: number
): SuggestedAction {
  if (consecutiveFailures >= threshold) {
    return "switch_provider";
  }

  switch (signalType) {
    case "rate_limited":
      return "wait_and_retry";
    case "timeout":
    case "server_error":
      return consecutiveFailures >= 2 ? "switch_provider" : "retry";
    case "model_error":
      return "alert_user";
    default:
      return "retry";
  }
}

function checkResponseQuality(response: LLMResponse): string | null {
  if (!response.content || response.content.length === 0) {
    return "LLM 返回空 content";
  }

  const hasNonEmptyText = response.content.some(
    (c) => c.type === "text" && c.text.trim().length > 0
  );
  const hasToolUse = response.content.some((c) => c.type === "tool_use");

  if (!hasNonEmptyText && !hasToolUse) {
    return "LLM 返回内容为空（无文本且无工具调用）";
  }

  return null;
}
