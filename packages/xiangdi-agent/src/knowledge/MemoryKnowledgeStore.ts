/**
 * 相地 · 内存态知识库
 *
 * 基于简单的关键词匹配（TF-IDF 简化版）实现的 KnowledgeStore。
 * 适用于：
 *   - 单元测试与集成测试
 *   - 知识量较小（< 1000 条）的场景
 *   - 快速原型验证
 *
 * 生产环境建议使用向量数据库实现（如 sqlite-vec / Chroma / Pinecone）。
 *
 * 使用示例：
 * ```ts
 * const store = new MemoryKnowledgeStore();
 * await store.add([
 *   { id: "btn-1", content: "Button 组件支持 variant 属性...", source: "组件文档" },
 *   { id: "input-1", content: "Input 组件支持 placeholder...", source: "组件文档" },
 * ]);
 *
 * const results = await store.query("按钮的颜色怎么改", { topK: 3 });
 * ```
 */

import type {
  KnowledgeChunk,
  KnowledgeEntry,
  KnowledgeQueryOptions,
  MutableKnowledgeStore,
} from "./types.js";

// ─── MemoryKnowledgeStore ─────────────────────────────────────────────────────

export class MemoryKnowledgeStore implements MutableKnowledgeStore {
  private entries: Map<string, KnowledgeEntry> = new Map();

  async query(
    query: string,
    options?: KnowledgeQueryOptions
  ): Promise<KnowledgeChunk[]> {
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 0;

    if (this.entries.size === 0) return [];

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    // 计算每个条目与查询的相关性分数
    const scored: Array<{ entry: KnowledgeEntry; score: number }> = [];

    for (const entry of this.entries.values()) {
      const entryTerms = tokenize(entry.content + " " + entry.source);
      const score = computeRelevance(queryTerms, entryTerms);

      if (score > minScore) {
        scored.push({ entry, score });
      }
    }

    // 按分数降序，取 top-K
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ entry, score }) => ({
      content: entry.content,
      source: entry.source,
      score,
      metadata: entry.metadata,
    }));
  }

  async add(entries: KnowledgeEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
  }

  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.entries.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async size(): Promise<number> {
    return this.entries.size;
  }
}

// ─── 文本处理工具 ──────────────────────────────────────────────────────────────

/**
 * 简单的分词：按空白 + 标点拆分，转小写，过滤短词
 * 支持中文：每个汉字作为单独的 token
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 提取中文字符作为单独 token
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) ?? [];
  tokens.push(...chineseChars);

  // 提取英文/数字词汇
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  tokens.push(...words.filter((w) => w.length >= 2));

  return tokens;
}

/**
 * 计算查询词与文档词的相关性分数（Jaccard 系数变体）
 * 返回 0-1 之间的分数
 */
function computeRelevance(queryTerms: string[], docTerms: string[]): number {
  if (queryTerms.length === 0 || docTerms.length === 0) return 0;

  const docSet = new Set(docTerms);
  let matchCount = 0;

  for (const term of queryTerms) {
    if (docSet.has(term)) {
      matchCount++;
    }
  }

  // 使用查询覆盖率作为主要分数（查询中有多少词命中了文档）
  const queryCoverage = matchCount / queryTerms.length;

  // 轻微惩罚过长文档（避免包含所有关键词的超长文档总是排第一）
  const lengthPenalty = Math.min(1, 100 / docTerms.length);

  return queryCoverage * 0.9 + queryCoverage * lengthPenalty * 0.1;
}
