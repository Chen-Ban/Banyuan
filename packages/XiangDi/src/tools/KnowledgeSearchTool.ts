/**
 * 相地 · 知识检索工具
 *
 * 内置基础工具：知识库按需检索。
 *
 * 架构变迁：
 *   原先 KnowledgeStore 作为管线（pipeline）在 HarnessRunner 中自动注入 system prompt，
 *   即"无脑塞入"模式。现重构为 Tool 模式，由 LLM 主动发起检索调用。
 *
 * 优势：
 *   - 按需加载：SpecPlanner 已明确当前任务涉及哪些组件，LLM 按需检索对应知识
 *   - Token 节省：不再将所有可能相关的知识塞入上下文
 *   - 可观测性：检索行为通过 tool_call 事件暴露，便于调试
 *
 * 典型场景：
 *   - SpecPlanner 输出 "需要 Button 和 Card 组件" → Agent 调用 knowledge_search 获取这两个组件的 JSON Schema 规范
 *   - 用户要求 "渐变背景" → Agent 检索项目中渐变相关的设计规范
 *   - 生成海报布局 → Agent 检索排版规范和栅格系统知识
 *
 * 设计原则：
 *   - 接口复用：底层依然使用 KnowledgeStore 接口，已有实现（Memory/Hybrid/Vector）无需更改
 *   - 结果格式化：返回结构化的 KnowledgeChunk，LLM 可直接消费
 *   - 输入引导：Tool description 指导 LLM 何时该检索、如何构造查询
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import type { KnowledgeStore, KnowledgeChunk } from "../knowledge/types.js";
import { ToolRegistry } from "../core/ToolRegistry.js";

// ─── 工具输入/输出类型 ─────────────────────────────────────────────────────────

export interface KnowledgeSearchInput {
  /** 检索查询，描述需要什么知识。例如 "Button 组件的 JSON Schema 定义" */
  query: string;
  /** 返回结果数量，1-10，默认 5 */
  topK?: number;
  /** 可选的过滤条件，按 source 类型筛选，如 "component_schema"、"design_spec" */
  category?: string;
}

export interface KnowledgeSearchOutput {
  /** 检索到的知识片段列表 */
  chunks: Array<{
    /** 知识内容 */
    content: string;
    /** 来源标识 */
    source: string;
    /** 相关性分数 0-1 */
    score: number;
  }>;
  /** 返回的片段数 */
  totalChunks: number;
  /** 原始查询 */
  query: string;
}

// ─── 工具常量 ──────────────────────────────────────────────────────────────────

export const KNOWLEDGE_SEARCH_TOOL_NAME = "knowledge_search" as const;

export const KNOWLEDGE_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: KNOWLEDGE_SEARCH_TOOL_NAME,
  description:
    "检索项目知识库，获取组件规范、设计规范、JSON Schema 定义等参考知识。" +
    "当需要了解特定组件的属性结构、布局规则、样式约束时使用。" +
    "查询应具体明确，例如 'Button 组件 variant 属性' 或 '海报排版间距规范'。" +
    "注意：不要用此工具查询画布当前状态（应使用 get_app_state），" +
    "也不要查询实时外部信息（应使用 web_search）。",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "检索查询词。应描述需要的具体知识，越具体结果越精准。" +
          "例如：'Card 组件的 JSON Schema 定义和可选属性'",
      },
      topK: {
        type: "number",
        description: "返回结果数量，1-10，默认 5",
      },
      category: {
        type: "string",
        description:
          "可选的知识类别过滤。" +
          "常见值：'schema'（节点类型与属性定义）、" +
          "'composition'（UI 组合模式，如登录表单、商品卡片）、" +
          "'theme'（设计主题与 token，如颜色、字号、间距）",
        enum: ["schema", "composition", "theme"],
      },
    },
    required: ["query"],
  },
};

// ─── 工具 Handler 工厂 ────────────────────────────────────────────────────────

/**
 * 创建 KnowledgeSearch 工具的 handler
 *
 * @param store KnowledgeStore 实现（MemoryKnowledgeStore / HybridKnowledgeStore / 自定义实现）
 * @returns ToolHandler，可注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const store = new MemoryKnowledgeStore();
 * await store.add([...componentSchemas]);
 *
 * const handler = createKnowledgeSearchHandler(store);
 * registry.register(KNOWLEDGE_SEARCH_TOOL_DEFINITION, handler);
 * ```
 */
export function createKnowledgeSearchHandler(
  store: KnowledgeStore
): ToolHandler<KnowledgeSearchInput, KnowledgeSearchOutput> {
  return async (input: KnowledgeSearchInput): Promise<KnowledgeSearchOutput> => {
    const topK = Math.min(Math.max(input.topK ?? 5, 1), 10);

    // 构造过滤条件
    const filter: Record<string, unknown> | undefined = input.category
      ? { category: input.category }
      : undefined;

    const chunks: KnowledgeChunk[] = await store.query(input.query, {
      topK,
      minScore: 0.05, // 低阈值，让 LLM 自己判断哪些有用
      filter,
    });

    return {
      chunks: chunks.map((c) => ({
        content: c.content,
        source: c.source,
        score: c.score,
      })),
      totalChunks: chunks.length,
      query: input.query,
    };
  };
}

// ─── 便捷注册函数 ─────────────────────────────────────────────────────────────

/**
 * 将 KnowledgeSearch 工具注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * const store = new MemoryKnowledgeStore();
 * registerKnowledgeSearchTool(registry, store);
 * ```
 */
export function registerKnowledgeSearchTool(
  registry: ToolRegistry,
  store: KnowledgeStore
): void {
  const handler = createKnowledgeSearchHandler(store);
  registry.register(
    KNOWLEDGE_SEARCH_TOOL_DEFINITION,
    handler as unknown as ToolHandler
  );
}
