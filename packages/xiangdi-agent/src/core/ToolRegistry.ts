/**
 * 相地 · 工具注册表
 *
 * 如园中工匠各司其职，工具注册表统筹所有可用工具，
 * 按名索引，供 MasterGraph 在 tools 节点中调度。
 */

import type {
  ToolDefinition,
  ToolHandler,
  RegisteredTool,
} from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  /**
   * 注册一个工具
   */
  register<TInput extends Record<string, unknown>, TOutput>(
    definition: ToolDefinition,
    handler: ToolHandler<TInput, TOutput>
  ): this {
    if (this.tools.has(definition.name)) {
      console.warn(
        `[XiangDi] Tool "${definition.name}" is already registered. Overwriting.`
      );
    }
    this.tools.set(definition.name, {
      definition,
      handler: handler as ToolHandler,
    });
    return this;
  }

  /**
   * 注销一个工具
   */
  unregister(name: string): this {
    this.tools.delete(name);
    return this;
  }

  /**
   * 获取工具处理器
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  /**
   * 获取所有工具的 LLM 定义（用于传给模型）
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * 执行一个工具调用
   */
  async execute(
    name: string,
    input: Record<string, unknown>
  ): Promise<{ result: unknown; is_error: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        result: `Tool "${name}" not found in registry.`,
        is_error: true,
      };
    }
    try {
      const result = await tool.handler(input);
      return { result, is_error: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: message, is_error: true };
    }
  }

  /**
   * 是否有已注册的工具
   */
  get isEmpty(): boolean {
    return this.tools.size === 0;
  }

  get size(): number {
    return this.tools.size;
  }
}
