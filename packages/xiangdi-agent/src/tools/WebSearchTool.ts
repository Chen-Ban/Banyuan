/**
 * 相地 · Web Search 工具
 *
 * 内置基础工具：网络搜索。
 *
 * 当 LLM 遇到不认识的设计概念、风格术语、技术实现方式时，
 * 可主动调用此工具获取实时信息。
 *
 * 典型场景：
 *   - 用户说"拟态风格按钮"，Agent 需搜索 Neumorphism 的视觉特征
 *   - 用户说"glassmorphism 卡片"，Agent 需了解毛玻璃效果参数
 *   - 用户说"仿 Stripe 的定价表"，Agent 需搜索参考设计
 *
 * 设计原则：
 *   - 接口抽象：不绑定具体搜索引擎，通过 SearchProvider 注入
 *   - 结果精简：返回摘要而非完整网页，节省 token
 *   - 可配置：支持结果数量、语言、超时等参数
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";

// ─── 搜索结果类型 ─────────────────────────────────────────────────────────────

export interface SearchResult {
  /** 结果标题 */
  title: string;
  /** 链接 URL */
  url: string;
  /** 摘要/snippet */
  snippet: string;
}

export interface SearchResponse {
  /** 搜索查询 */
  query: string;
  /** 搜索结果列表 */
  results: SearchResult[];
}

// ─── 搜索引擎抽象 ─────────────────────────────────────────────────────────────

/**
 * 搜索引擎 Provider 接口
 *
 * XiangDi 不绑定具体搜索服务，由调用方注入实现。
 * 可对接：Google Custom Search、Bing、Tavily、SerpAPI、自建搜索等。
 */
export interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
}

export interface SearchOptions {
  /** 返回结果数量，默认 5 */
  maxResults?: number;
  /** 搜索语言/地区偏好 */
  locale?: string;
  /** 超时 ms */
  timeoutMs?: number;
}

// ─── 工具输入/输出类型 ─────────────────────────────────────────────────────────

export interface WebSearchInput {
  /** 搜索查询词 */
  query: string;
  /** 返回结果数量，默认 5 */
  maxResults?: number;
}

export interface WebSearchOutput {
  results: SearchResult[];
  /** 结果总数 */
  totalResults: number;
}

// ─── 工具常量 ──────────────────────────────────────────────────────────────────

export const WEB_SEARCH_TOOL_NAME = "web_search" as const;

export const WEB_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "搜索互联网获取实时信息。当遇到不熟悉的设计风格、UI 术语、技术概念、" +
    "或需要参考现有设计时使用。返回搜索结果的标题、链接和摘要。" +
    "示例：搜索 'neumorphism design style CSS' 了解拟态设计的实现方式。",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "搜索查询词。应使用英文或中英混合以获得更好的结果。" +
          "例如：'neumorphism button CSS box-shadow'",
      },
      maxResults: {
        type: "number",
        description: "返回结果数量，1-10，默认 5",
      },
    },
    required: ["query"],
  },
};

// ─── 工具 Handler 工厂 ────────────────────────────────────────────────────────

/**
 * 创建 WebSearch 工具的 handler
 *
 * @param provider 搜索引擎实现（由调用方注入）
 * @returns ToolHandler，可注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const provider = new TavilySearchProvider({ apiKey: "..." });
 * const handler = createWebSearchHandler(provider);
 * registry.register(WEB_SEARCH_TOOL_DEFINITION, handler);
 * ```
 */
export function createWebSearchHandler(
  provider: SearchProvider
): ToolHandler<WebSearchInput, WebSearchOutput> {
  return async (input: WebSearchInput): Promise<WebSearchOutput> => {
    const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10);

    const response = await provider.search(input.query, { maxResults });

    return {
      results: response.results.slice(0, maxResults),
      totalResults: response.results.length,
    };
  };
}

// ─── 便捷注册函数 ─────────────────────────────────────────────────────────────

import { ToolRegistry } from "../core/ToolRegistry.js";

/**
 * 将 WebSearch 工具注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registerWebSearchTool(registry, mySearchProvider);
 * ```
 */
export function registerWebSearchTool(
  registry: ToolRegistry,
  provider: SearchProvider
): void {
  const handler = createWebSearchHandler(provider);
  registry.register(
    WEB_SEARCH_TOOL_DEFINITION,
    handler as unknown as ToolHandler
  );
}
