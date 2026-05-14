/**
 * 相地 · 流式桥接器
 *
 * 将 LLM 的流式响应转化为结构化事件，
 * 如引水入渠，使其有序流淌至调用方。
 *
 * 同时桥接 AgentLifecycle 生命周期事件，
 * 使 UI 层可通过统一的事件流订阅 Agent 的全部可观测信息。
 */

import type {
  StreamCallback,
  TypedStreamEvent,
  TextDeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
  LifecycleStreamEvent,
} from "./types.js";
import type { LifecycleEvent, AgentStateSnapshot } from "./AgentLifecycle.js";

export class StreamBridge {
  private callbacks: StreamCallback[] = [];

  /**
   * 订阅流式事件（包括生命周期事件）
   */
  subscribe(callback: StreamCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * 发布文本增量
   */
  emitTextDelta(text: string): void {
    this.emit({ type: "text_delta", data: { text } } satisfies TextDeltaEvent);
  }

  /**
   * 发布工具调用
   */
  emitToolCall(
    id: string,
    name: string,
    input: Record<string, unknown>
  ): void {
    this.emit({
      type: "tool_call",
      data: { id, name, input },
    } satisfies ToolCallEvent);
  }

  /**
   * 发布工具结果
   */
  emitToolResult(
    tool_use_id: string,
    result: unknown,
    is_error: boolean
  ): void {
    this.emit({
      type: "tool_result",
      data: { tool_use_id, result, is_error },
    } satisfies ToolResultEvent);
  }

  /**
   * 发布完成事件
   */
  emitDone(finalMessage: string): void {
    this.emit({
      type: "done",
      data: { finalMessage },
    } satisfies DoneEvent);
  }

  /**
   * 发布错误事件
   */
  emitError(error: Error): void {
    this.emit({ type: "error", data: { error } } satisfies ErrorEvent);
  }

  /**
   * 发布生命周期事件
   *
   * 由 AgentLifecycle 的 listener 触发，将生命周期状态变迁
   * 桥接到统一的流式事件通道中。
   *
   * 使用方式：
   *   lifecycle.subscribe((event) => stream.emitLifecycle(event, lifecycle.getSnapshot()));
   */
  emitLifecycle(event: LifecycleEvent, snapshot: AgentStateSnapshot): void {
    this.emit({
      type: "lifecycle",
      data: { event, snapshot },
    } satisfies LifecycleStreamEvent);
  }

  private emit(event: TypedStreamEvent): void {
    for (const cb of this.callbacks) {
      try {
        cb(event);
      } catch {
        // 单个订阅者的错误不应影响其他订阅者
      }
    }
  }
}
