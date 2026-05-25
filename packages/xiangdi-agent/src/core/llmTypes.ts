/**
 * 相地 · LLM 类型定义
 *
 * LLM 调用层的核心类型接口，被整个 XiangDi 项目广泛使用。
 */

import type { ConflictReport } from "./ConflictDetector.js";
import type { DisambiguationOptions } from "./DisambiguationHandler.js";

// ─── 最小化 Anthropic SDK 类型（避免强依赖，运行时由调用方注入）─────────────

export interface LLMClient {
  createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: import("./types.js").Message[];
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
