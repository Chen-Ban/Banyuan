/**
 * 相地 · 上下文管理器
 *
 * 园林营造须记山形水势，上下文管理器维护对话历史，
 * 并在超出窗口时裁剪，保留关键记忆。
 */

import type { Message, MessageContent } from "./types.js";

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
   * 裁剪超出窗口的消息
   * 策略：保留最新的 maxMessages 条，但不能从 tool_use / tool_result 对中间截断
   */
  private trim(): void {
    if (this.messages.length <= this.maxMessages) return;

    const excess = this.messages.length - this.maxMessages;
    // 简单策略：从头部移除 excess 条
    // TODO: 未来可升级为摘要压缩策略
    this.messages.splice(0, excess);
  }
}
