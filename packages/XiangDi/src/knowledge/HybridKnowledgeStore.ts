/**
 * 相地 · 混合知识库（HybridKnowledgeStore）
 *
 * 核心创新：三通道 RRF 融合的 RAG + GraphRAG 混合检索。
 *
 * 检索通道：
 *   1. 向量检索（Vector）：基于 embedding 的语义相似度
 *      → 适合"Button 组件怎么用"等局部知识查询
 *   2. BM25 全文检索（FTS）：基于词频的关键词匹配
 *      → 适合精确术语、组件名称、API 名称等查询
 *   3. 图检索（Graph）：基于知识图谱的关系推理
 *      → 适合"修改 X 会影响哪些页面"等关联查询
 *
 * 融合策略：Reciprocal Rank Fusion (RRF)
 *   - 每个通道独立检索，返回排序列表
 *   - RRF 公式：score = weight / (rank + k)，k=60
 *   - 三路结果按 RRF 分数合并，去重，归一化
 *
 * 路由策略（LLM Router）：
 *   - "vector"：仅向量 + BM25（两通道）
 *   - "graph"：仅图检索（一通道）
 *   - "hybrid"：全部三通道
 *
 * 降级策略：
 *   - 若 graphStore 未配置 → 自动降级为向量 + BM25
 *   - 若 Router 调用失败 → 默认使用 hybrid 策略
 *   - 若某通道检索失败 → 其他通道兜底，不影响整体结果
 *
 * 与 LanceDBVectorStore 的集成：
 *   - 若 vectorStore 是 LanceDBVectorStore 实例，
 *     则自动使用其 searchWithText() 方法（向量 + BM25 内置融合）
 *   - 否则退化为纯向量检索
 */

import type {
  KnowledgeChunk,
  KnowledgeStore,
  KnowledgeQueryOptions,
  GraphKnowledgeStore,
  RetrievalRouter,
  RoutingDecision,
  HybridStoreConfig,
  SubGraph,
  EmbeddingProvider,
} from "./types.js";

// ─── 扩展配置（在 HybridStoreConfig 基础上增加 embedding 支持）────────────────

export interface HybridKnowledgeStoreConfig extends HybridStoreConfig {
  /**
   * Embedding 提供者（用于将查询文本转为向量）
   * 若 vectorStore 是 LanceDBVectorStore，则必须提供此参数
   */
  embeddingProvider?: EmbeddingProvider;
}

// ─── HybridKnowledgeStore ─────────────────────────────────────────────────────

export class HybridKnowledgeStore implements KnowledgeStore {
  private readonly vectorStore: KnowledgeStore;
  private readonly graphStore: GraphKnowledgeStore | null;
  private readonly router: RetrievalRouter;
  private readonly vectorWeight: number;
  private readonly embeddingProvider: EmbeddingProvider | null;

  constructor(config: HybridKnowledgeStoreConfig) {
    this.vectorStore = config.vectorStore;
    this.graphStore = config.graphStore ?? null;
    this.router = config.router;
    this.vectorWeight = config.vectorWeight ?? 0.5;
    this.embeddingProvider = config.embeddingProvider ?? null;
  }

  async query(
    query: string,
    options?: KnowledgeQueryOptions
  ): Promise<KnowledgeChunk[]> {
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 0;

    // ── Step 1: 路由决策 ──────────────────────────────────────────────────
    let decision: RoutingDecision;
    try {
      decision = await this.router.route(query);
    } catch {
      decision = {
        strategy: this.graphStore ? "hybrid" : "vector",
        reasoning: "Router fallback due to error",
      };
    }

    // 若无 graphStore，强制降级为 vector
    if (!this.graphStore && decision.strategy !== "vector") {
      decision = { ...decision, strategy: "vector" };
    }

    // ── Step 2: 执行检索 ──────────────────────────────────────────────────
    switch (decision.strategy) {
      case "vector":
        return this.executeVectorSearch(query, topK, minScore);

      case "graph":
        return this.executeGraphSearch(query, topK, minScore, decision.graphEntryHints);

      case "hybrid":
        return this.executeHybridSearch(query, topK, minScore, decision.graphEntryHints);
    }
  }

  // ── 向量检索（含 BM25）────────────────────────────────────────────────────

  private async executeVectorSearch(
    query: string,
    topK: number,
    minScore: number
  ): Promise<KnowledgeChunk[]> {
    try {
      // 优先使用 LanceDBVectorStore 的混合检索（向量 + BM25）
      const lanceStore = this.vectorStore as LanceDBLike;
      if (lanceStore.searchWithText && this.embeddingProvider) {
        const queryVector = await this.embeddingProvider.embed(query);
        const results = await lanceStore.searchWithText(query, queryVector, topK, minScore);
        return results.map((r) => ({
          content: String(r.payload["content"] ?? ""),
          source: String(r.payload["source"] ?? ""),
          score: r.score,
          metadata: r.payload,
        }));
      }

      // 降级：使用标准 KnowledgeStore 接口
      return this.vectorStore.query(query, { topK, minScore });
    } catch {
      return [];
    }
  }

  // ── 图检索 ────────────────────────────────────────────────────────────────

  private async executeGraphSearch(
    query: string,
    topK: number,
    minScore: number,
    entryHints?: string[]
  ): Promise<KnowledgeChunk[]> {
    if (!this.graphStore) return [];

    try {
      const searchQuery = entryHints?.join(" ") || query;
      const subGraph = await this.graphStore.querySubGraph(searchQuery, {
        maxHops: 2,
        maxEntities: topK * 2,
      });
      return subGraphToChunks(subGraph, topK, minScore);
    } catch {
      return [];
    }
  }

  // ── 三通道混合检索 ────────────────────────────────────────────────────────

  private async executeHybridSearch(
    query: string,
    topK: number,
    minScore: number,
    entryHints?: string[]
  ): Promise<KnowledgeChunk[]> {
    // 并行执行所有通道
    const [vectorResults, graphResults] = await Promise.all([
      this.executeVectorSearch(query, topK * 2, 0), // 扩大候选集，minScore 后置过滤
      this.executeGraphSearch(query, topK * 2, 0, entryHints),
    ]);

    // 三通道 RRF 融合
    return rrfMerge(
      vectorResults,
      graphResults,
      this.vectorWeight,
      topK,
      minScore
    );
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 将 SubGraph 转化为 KnowledgeChunk 数组
 * 每个实体生成一个 chunk，关系信息嵌入到 content 中
 */
function subGraphToChunks(
  subGraph: SubGraph,
  topK: number,
  minScore: number
): KnowledgeChunk[] {
  const { entities, relations } = subGraph;
  if (entities.length === 0) return [];

  const chunks: KnowledgeChunk[] = [];

  for (const entity of entities) {
    const relatedRelations = relations.filter(
      (r) => r.sourceId === entity.id || r.targetId === entity.id
    );

    const lines: string[] = [];
    lines.push(`[${entity.type}] ${entity.name}`);

    if (entity.description) {
      lines.push(entity.description);
    }

    if (relatedRelations.length > 0) {
      lines.push("");
      lines.push("关联关系：");
      for (const rel of relatedRelations.slice(0, 5)) {
        const otherEntity = entities.find(
          (e) => e.id === (rel.sourceId === entity.id ? rel.targetId : rel.sourceId)
        );
        const otherName = otherEntity?.name ?? rel.targetId;
        const direction = rel.sourceId === entity.id ? "→" : "←";
        lines.push(`  ${direction} [${rel.type}] ${otherName}`);
      }
    }

    // 启发式分数：实体完整度 + 连通度
    const richness = entity.description ? 0.3 : 0;
    const connectivity = Math.min(relatedRelations.length / 5, 0.5);
    const score = 0.2 + richness + connectivity; // 0.2 ~ 1.0

    if (score >= minScore) {
      chunks.push({
        content: lines.join("\n"),
        source: `[GraphRAG] ${entity.type}/${entity.name}`,
        score,
        metadata: {
          entityId: entity.id,
          entityType: entity.type,
          relationsCount: relatedRelations.length,
        },
      });
    }
  }

  chunks.sort((a, b) => b.score - a.score);
  return chunks.slice(0, topK);
}

/**
 * 两路结果的 RRF 融合
 * 使用加权 Reciprocal Rank Fusion
 */
function rrfMerge(
  vectorResults: KnowledgeChunk[],
  graphResults: KnowledgeChunk[],
  vectorWeight: number,
  topK: number,
  minScore: number
): KnowledgeChunk[] {
  const graphWeight = 1 - vectorWeight;
  const k = 60; // RRF 经典常数

  const merged = new Map<string, { chunk: KnowledgeChunk; rrfScore: number }>();

  // 向量/BM25 结果（已经是融合后的）
  for (let i = 0; i < vectorResults.length; i++) {
    const chunk = vectorResults[i];
    const rrfScore = vectorWeight / (i + 1 + k);
    const key = chunkKey(chunk);
    merged.set(key, { chunk, rrfScore });
  }

  // 图检索结果
  for (let i = 0; i < graphResults.length; i++) {
    const chunk = graphResults[i];
    const rrfScore = graphWeight / (i + 1 + k);
    const key = chunkKey(chunk);

    const existing = merged.get(key);
    if (existing) {
      existing.rrfScore += rrfScore;
    } else {
      merged.set(key, { chunk, rrfScore });
    }
  }

  const sorted = [...merged.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);

  const maxRRF = sorted[0]?.rrfScore ?? 1;

  return sorted
    .map(({ chunk, rrfScore }) => ({
      ...chunk,
      score: maxRRF > 0 ? rrfScore / maxRRF : 0,
    }))
    .filter((c) => c.score >= minScore);
}

function chunkKey(chunk: KnowledgeChunk): string {
  return chunk.source + "|" + chunk.content.slice(0, 80);
}

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

interface LanceDBLike extends KnowledgeStore {
  searchWithText?: (
    queryText: string,
    queryVector: number[],
    topK: number,
    minScore?: number
  ) => Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>>;
}
