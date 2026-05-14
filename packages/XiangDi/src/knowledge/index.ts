/**
 * 相地 · 知识库检索模块
 *
 * 提供按需检索的知识注入能力，让 Agent 在执行任务时
 * 获得"当前最相关的参考知识"而非"所有知识的全量注入"。
 *
 * 架构：RAG + GraphRAG 混合检索，LLM 动态路由
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │                   HybridKnowledgeStore                       │
 *   │                                                              │
 *   │  ┌─────────────────────┐  LLM Router  ┌──────────────────┐  │
 *   │  │  LanceDBVectorStore  │ ←──────────→ │ GraphologyGraph  │  │
 *   │  │  向量检索 + BM25 FTS │              │ Store (GraphRAG) │  │
 *   │  └─────────────────────┘              └──────────────────┘  │
 *   │           ↑                                    ↑             │
 *   │  TransformersEmbeddingProvider                 │             │
 *   │  (multilingual-e5-small, 本地 ONNX)            │             │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * 三层信息来源各司其职：
 *   ProjectSpec（全局约束）+ KnowledgeStore（按需知识）+ 工具调用（实时状态）
 *
 * 快速上手：
 * ```ts
 * import {
 *   TransformersEmbeddingProvider,
 *   LanceDBVectorStore,
 *   GraphologyGraphStore,
 *   HybridKnowledgeStore,
 *   RuleBasedRouter,
 * } from "xiangdi";
 *
 * const embedding = new TransformersEmbeddingProvider();
 * const vectorStore = new LanceDBVectorStore(embedding);
 * const graphStore = new GraphologyGraphStore();
 * const router = new RuleBasedRouter();
 *
 * const knowledge = new HybridKnowledgeStore({
 *   vectorStore,
 *   graphStore,
 *   router,
 *   embeddingProvider: embedding,
 * });
 *
 * // 写入知识
 * await vectorStore.upsertTexts([
 *   { id: "btn-1", content: "Button 组件支持 variant 属性...", source: "组件文档" },
 * ]);
 *
 * // 检索
 * const chunks = await knowledge.query("按钮颜色怎么改", { topK: 5 });
 * ```
 */

// ─── 类型定义 ──────────────────────────────────────────────────────────────────
export type {
  // 基础检索类型
  KnowledgeChunk,
  KnowledgeStore,
  KnowledgeQueryOptions,
  KnowledgeEntry,
  MutableKnowledgeStore,
  // 向量检索类型
  EmbeddingProvider,
  VectorStore,
  VectorItem,
  VectorSearchResult,
  // 图检索类型（GraphRAG）
  GraphEntity,
  GraphRelation,
  SubGraph,
  GraphKnowledgeStore,
  GraphQueryOptions,
  ImpactAnalysisOptions,
  // 混合检索路由类型
  RetrievalStrategy,
  RoutingDecision,
  HybridStoreConfig,
  RetrievalRouter,
  RouterContext,
} from "./types.js";

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * 内存态知识库（关键词匹配，用于测试/小数据量）
 * 无需外部依赖，适合单元测试和快速原型
 */
export { MemoryKnowledgeStore } from "./MemoryKnowledgeStore.js";

/**
 * 混合知识库（三通道 RRF：向量 + BM25 + 图，LLM 动态路由）
 * 生产环境推荐使用，配合 LanceDBVectorStore + GraphologyGraphStore
 */
export { HybridKnowledgeStore } from "./HybridKnowledgeStore.js";
export type { HybridKnowledgeStoreConfig } from "./HybridKnowledgeStore.js";

/**
 * LanceDB 向量存储（嵌入式，向量 + BM25 混合检索）
 * 基于 @lancedb/lancedb，数据持久化到本地磁盘
 */
export { LanceDBVectorStore } from "./LanceDBVectorStore.js";
export type { LanceDBVectorStoreConfig } from "./LanceDBVectorStore.js";

/**
 * Transformers Embedding Provider（本地 ONNX 推理）
 * 基于 @huggingface/transformers，使用 multilingual-e5-small 模型
 * 支持中英文，384 维，首次使用时自动下载模型（~470MB）
 */
export { TransformersEmbeddingProvider } from "./TransformersEmbeddingProvider.js";

/**
 * Graphology 图知识库（GraphRAG，内存图 + JSON 持久化）
 * 基于 graphology，支持 BFS 子图检索、影响分析、邻居查询
 */
export { GraphologyGraphStore } from "./GraphologyGraphStore.js";
export type { GraphologyGraphStoreConfig } from "./GraphologyGraphStore.js";

/**
 * 内存态图知识库（BFS 子图检索 + 影响分析）
 * 无需外部依赖，适合测试和小规模场景
 * @deprecated 生产环境请使用 GraphologyGraphStore
 */
export { InMemoryGraphStore } from "./InMemoryGraphStore.js";

/**
 * LLM 检索路由器（DeepSeek 驱动的动态策略判断）
 * RuleBasedRouter：基于规则的轻量路由器（无需 LLM，低延迟）
 */
export { LLMRetrievalRouter, RuleBasedRouter } from "./LLMRetrievalRouter.js";
export type { RetrievalRouterConfig } from "./LLMRetrievalRouter.js";
