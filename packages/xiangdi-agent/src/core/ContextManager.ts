/**
 * 相地 · 上下文管理器
 *
 * 园林营造须记山形水势，上下文管理器维护对话历史，
 * 并在超出窗口时裁剪，保留关键记忆。
 */

import type { Message, MessageContent, ToolUseContent, ToolResultContent } from "./types.js";

export interface ContextManagerOptions {
  /**
   * 最大保留的消息条数（不含 system prompt）
   * 超出时从最早的非 system 消息开始裁剪
   */
  maxMessages?: number;
}

export class ContextManager {
  private messages: Message[] = [];
  private readonly maxMessages: number;

  constructor(options: ContextManagerOptions = {}) {
    this.maxMessages = options.maxMessages ?? 100;
  }

  /**
   * 追加一条消息
   */
  push(role: Message["role"], content: MessageContent): this {
    this.messages.push({ role, content });
    this.trim();
    return this;
  }

  /**
   * 批量追加消息
   */
  pushMany(messages: Message[]): this {
    this.messages.push(...messages);
    this.trim();
    return this;
  }

  /**
   * 获取当前所有消息（不含 system）
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * 清空历史
   */
  clear(): this {
    this.messages = [];
    return this;
  }

  /**
   * 消息数量
   */
  get length(): number {
    return this.messages.length;
  }

  /**
   * 从消息内容中提取所有 tool_use id
   */
  private extractToolUseIds(content: MessageContent): string[] {
    if (!Array.isArray(content)) return [];
    return (content as Array<unknown>)
      .filter((c): c is ToolUseContent => (c as ToolUseContent).type === "tool_use")
      .map((c) => c.id);
  }

  /**
   * 从消息内容中提取所有 tool_result 引用的 tool_use_id
   */
  private extractToolResultIds(content: MessageContent): string[] {
    if (!Array.isArray(content)) return [];
    return (content as Array<unknown>)
      .filter((c): c is ToolResultContent => (c as ToolResultContent).type === "tool_result")
      .map((c) => c.tool_use_id);
  }

  /**
   * 裁剪超出窗口的消息
   *
   * 策略：从头部找到第一个"安全切割点"后再移除。
   * 安全切割点定义：某个位置之前的所有 tool_use 都已有对应的 tool_result。
   * 这样可以保证裁剪后的消息列表满足 Anthropic API 的配对约束，
   * 避免出现孤立的 tool_use 或 tool_result 导致 400 错误。
   *
   * TODO: 未来可升级为摘要压缩策略
   */
  private trim(): void {
    if (this.messages.length <= this.maxMessages) return;

    const excess = this.messages.length - this.maxMessages;

    // 收集前 excess 条消息中所有 tool_use id
    const pendingToolUseIds = new Set<string>();
    for (let i = 0; i < excess; i++) {
      const ids = this.extractToolUseIds(this.messages[i].content);
      ids.forEach((id) => pendingToolUseIds.add(id));
    }

    if (pendingToolUseIds.size === 0) {
      // 没有 tool_use，直接裁剪
      this.messages.splice(0, excess);
      return;
    }

    // 向后扫描，找到所有 pendingToolUseIds 都被 tool_result 覆盖的安全切割点
    let safeIndex = excess;
    const resolvedIds = new Set<string>();

    for (let i = excess; i < this.messages.length; i++) {
      const resultIds = this.extractToolResultIds(this.messages[i].content);
      resultIds.forEach((id) => {
        if (pendingToolUseIds.has(id)) resolvedIds.add(id);
      });

      if (resolvedIds.size === pendingToolUseIds.size) {
        // 所有 tool_use 都已有对应 tool_result，i+1 是安全切割点
        safeIndex = i + 1;
        break;
      }
    }

    // 从头部移除到安全切割点
    this.messages.splice(0, safeIndex);
  }
}
