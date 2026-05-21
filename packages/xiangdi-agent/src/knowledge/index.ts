/**
 * 相地 · 知识库检索模块
 *
 * 提供按需检索的知识注入能力，让 Agent 在执行任务时
 * 获得"当前最相关的参考知识"而非"所有知识的全量注入"。
 *
 * 三层信息来源各司其职：
 *   ProjectSpec（全局约束）+ KnowledgeStore（按需知识）+ 工具调用（实时状态）
 *
 * 快速上手：
 * ```ts
 * import { LanceDBKnowledgeStore } from "@banyuan/xiangdi-agent";
 *
 * const store = new LanceDBKnowledgeStore();
 *
 * // 写入知识
 * await store.add([
 *   { id: "btn-1", content: "Button 组件支持 variant 属性...", source: "组件文档" },
 * ]);
 *
 * // 检索（向量 + BM25 自动融合）
 * const chunks = await store.query("按钮颜色怎么改", { topK: 5 });
 * ```
 *
 * GraphRAG（可选，用于关系推理）：
 * ```ts
 * import { GraphologyGraphStore } from "@banyuan/xiangdi-agent";
 *
 * const graph = new GraphologyGraphStore();
 * await graph.addEntities([...]);
 * await graph.addRelations([...]);
 *
 * // 影响分析：修改 ProductCard 会影响哪些页面？
 * const impact = await graph.analyzeImpact(["comp-card"], { direction: "backward" });
 * ```
 */

// ─── 类型定义 ──────────────────────────────────────────────────────────────────
export type {
  KnowledgeChunk,
  KnowledgeStore,
  KnowledgeQueryOptions,
  KnowledgeEntry,
  MutableKnowledgeStore,
  GraphEntity,
  GraphRelation,
  SubGraph,
  GraphKnowledgeStore,
  GraphQueryOptions,
  ImpactAnalysisOptions,
} from "./types.js";

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * LanceDB 知识库（生产推荐）
 * 向量检索 + BM25 全文检索，RRF 融合，数据持久化到本地磁盘
 * 内置 multilingual-e5-small 本地 ONNX 推理（支持中英文）
 */
export { LanceDBKnowledgeStore } from "./LanceDBKnowledgeStore.js";
export type { LanceDBKnowledgeStoreConfig } from "./LanceDBKnowledgeStore.js";

/**
 * 内存态知识库（关键词匹配，用于测试/小数据量）
 * 无需外部依赖，适合单元测试和快速原型
 */
export { MemoryKnowledgeStore } from "./MemoryKnowledgeStore.js";

/**
 * Graphology 图知识库（GraphRAG）
 * 基于 graphology，支持 BFS 子图检索、影响分析、邻居查询
 * 适合多页面关联修改、组件影响分析等需要关系推理的场景
 */
export { GraphologyGraphStore } from "./GraphologyGraphStore.js";
export type { GraphologyGraphStoreConfig } from "./GraphologyGraphStore.js";

/**
 * LLM 检索路由器（用于 GraphRAG 场景的策略判断）
 * RuleBasedRouter：基于规则的轻量路由器（无需 LLM，低延迟）
 */
export { LLMRetrievalRouter, RuleBasedRouter } from "./LLMRetrievalRouter.js";
export type { RetrievalRouterConfig } from "./LLMRetrievalRouter.js";

// ─── 种子数据工具 ──────────────────────────────────────────────────────────────

/**
 * 知识种子加载工具
 * 提供种子文件格式定义和转换函数
 */
export { seedToEntry, seedsToEntries } from "./seeds/index.js";
export type { SeedCategory, SeedFile } from "./seeds/index.js";
