/**
 * 相地 · LLM 检索路由器
 *
 * 使用 LLM（DeepSeek）动态判断查询应使用哪种检索策略。
 *
 * 判断逻辑：
 *   - 若查询涉及"某个组件怎么用"、"API 参数是什么"等局部知识 → vector
 *   - 若查询涉及"修改X会影响哪些页面"、"这些组件的依赖关系"等关联推理 → graph
 *   - 若不确定或两者都有 → hybrid
 *
 * 优化：
 *   - 路由决策使用轻量级 prompt（< 500 tokens），延迟极低
 *   - 支持缓存：相同 query 模式可复用决策
 *   - 失败时默认 hybrid，确保不影响主流程
 */

import type { LLMClient } from "../core/llmTypes.js";
import type { Message } from "../core/types.js";
import type {
  RetrievalRouter,
  RoutingDecision,
  RetrievalStrategy,
  RouterContext,
} from "./types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface RetrievalRouterConfig {
  /** LLM 客户端（用于路由决策，建议使用轻量模型） */
  llmClient: LLMClient;
  /** 模型名称，默认 "deepseek-v4-pro" */
  model?: string;
  /** 是否启用决策缓存，默认 true */
  enableCache?: boolean;
  /** 缓存最大条目数，默认 100 */
  cacheSize?: number;
}

// ─── LLMRetrievalRouter ───────────────────────────────────────────────────────

export class LLMRetrievalRouter implements RetrievalRouter {
  private readonly llmClient: LLMClient;
  private readonly model: string;
  private readonly cache: Map<string, RoutingDecision>;
  private readonly cacheSize: number;
  private readonly enableCache: boolean;

  constructor(config: RetrievalRouterConfig) {
    this.llmClient = config.llmClient;
    this.model = config.model ?? "deepseek-v4-pro";
    this.enableCache = config.enableCache ?? true;
    this.cacheSize = config.cacheSize ?? 100;
    this.cache = new Map();
  }

  async route(query: string, context?: RouterContext): Promise<RoutingDecision> {
    // 检查缓存
    const cacheKey = this.buildCacheKey(query, context);
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // 调用 LLM 做路由决策
    const decision = await this.callLLMForRouting(query, context);

    // 写入缓存
    if (this.enableCache) {
      if (this.cache.size >= this.cacheSize) {
        // LRU：删除最早插入的
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(cacheKey, decision);
    }

    return decision;
  }

  // ── LLM 调用 ──────────────────────────────────────────────────────────────

  private async callLLMForRouting(
    query: string,
    context?: RouterContext
  ): Promise<RoutingDecision> {
    const systemPrompt = ROUTER_SYSTEM_PROMPT;
    const userMessage = this.buildUserMessage(query, context);

    const messages: Message[] = [
      { role: "user", content: userMessage },
    ];

    const response = await this.llmClient.createMessage({
      model: this.model,
      max_tokens: 200,
      system: systemPrompt,
      messages,
      temperature: 0,
    });

    // 解析 LLM 输出
    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    return this.parseRoutingResponse(text);
  }

  private buildUserMessage(query: string, context?: RouterContext): string {
    let message = `查询：${query}`;

    if (context) {
      if (context.multiPage) {
        message += `\n特征：涉及多个页面`;
      }
      if (context.proposal) {
        message += `\n变更描述：${context.proposal}`;
      }
      if (context.entityHints?.length) {
        message += `\n可能涉及的实体：${context.entityHints.join(", ")}`;
      }
    }

    return message;
  }

  private parseRoutingResponse(text: string): RoutingDecision {
    const lower = text.toLowerCase();

    // 尝试解析 JSON 格式响应
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          strategy?: string;
          reasoning?: string;
          graphEntryHints?: string[];
        };
        if (parsed.strategy && isValidStrategy(parsed.strategy)) {
          return {
            strategy: parsed.strategy as RetrievalStrategy,
            reasoning: parsed.reasoning ?? "",
            graphEntryHints: parsed.graphEntryHints,
          };
        }
      }
    } catch {
      // JSON 解析失败，用关键词匹配
    }

    // 关键词匹配 fallback
    let strategy: RetrievalStrategy = "hybrid";
    if (lower.includes("vector") && !lower.includes("graph")) {
      strategy = "vector";
    } else if (lower.includes("graph") && !lower.includes("vector")) {
      strategy = "graph";
    }

    return {
      strategy,
      reasoning: text.slice(0, 200),
    };
  }

  // ── 缓存 ──────────────────────────────────────────────────────────────────

  private buildCacheKey(query: string, context?: RouterContext): string {
    // 使用查询的前 100 字符 + 上下文标志位作为 key
    const queryKey = query.slice(0, 100);
    const contextKey = context
      ? `${context.multiPage ? "M" : ""}${context.entityHints?.length ?? 0}`
      : "";
    return `${queryKey}|${contextKey}`;
  }

  /** 清空缓存 */
  clearCache(): void {
    this.cache.clear();
  }
}

// ─── 路由 System Prompt ───────────────────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `你是一个检索策略路由器。根据用户的查询内容，判断应该使用哪种检索策略。

策略说明：
- "vector"：语义向量检索。适合查找具体的组件文档、API 用法、样式属性等局部知识。
- "graph"：知识图谱检索。适合分析实体间的依赖关系、影响范围、多页面关联等结构化推理。
- "hybrid"：混合检索。当查询既需要具体知识又需要关系推理时使用。

判断规则：
1. 查询中出现"影响"、"依赖"、"关联"、"哪些页面"、"所有引用"等关系词 → graph
2. 查询中出现"怎么用"、"参数"、"属性"、"样式"、"文档"等知识词 → vector  
3. 涉及多页面修改或组件复用分析 → graph
4. 不确定时 → hybrid

请以 JSON 格式回答：{"strategy": "vector|graph|hybrid", "reasoning": "一句话理由", "graphEntryHints": ["可选的入口实体关键词"]}`;

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function isValidStrategy(s: string): s is RetrievalStrategy {
  return s === "vector" || s === "graph" || s === "hybrid";
}

// ─── 规则路由器（无需 LLM，用于低延迟/离线场景）──────────────────────────────

/**
 * 基于规则的检索路由器
 * 通过关键词匹配判断策略，无需 LLM 调用，延迟极低。
 * 适合对延迟敏感或 LLM 不可用的场景。
 */
export class RuleBasedRouter implements RetrievalRouter {
  async route(query: string, context?: RouterContext): Promise<RoutingDecision> {
    const lower = query.toLowerCase();

    // 图检索关键词
    const graphKeywords = [
      "影响", "依赖", "关联", "引用", "哪些页面",
      "所有", "级联", "传播", "共享", "复用",
      "impact", "depends", "references", "affects", "shared",
    ];

    // 向量检索关键词
    const vectorKeywords = [
      "怎么用", "参数", "属性", "样式", "文档",
      "示例", "用法", "接口", "配置", "类型",
      "how to", "usage", "property", "style", "docs",
    ];

    const graphScore = graphKeywords.filter((k) => lower.includes(k)).length;
    const vectorScore = vectorKeywords.filter((k) => lower.includes(k)).length;

    // 上下文辅助判断
    if (context?.multiPage) {
      return {
        strategy: "graph",
        reasoning: "多页面场景，使用图检索分析关联",
        graphEntryHints: context.entityHints,
      };
    }

    if (graphScore > vectorScore) {
      return {
        strategy: "graph",
        reasoning: `匹配到 ${graphScore} 个图检索关键词`,
        graphEntryHints: context?.entityHints,
      };
    }

    if (vectorScore > graphScore) {
      return {
        strategy: "vector",
        reasoning: `匹配到 ${vectorScore} 个向量检索关键词`,
      };
    }

    return {
      strategy: "hybrid",
      reasoning: "无法确定最佳策略，使用混合检索",
    };
  }
}
