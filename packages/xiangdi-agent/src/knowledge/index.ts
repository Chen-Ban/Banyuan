/**
 * 相地 · 知识库检索模块
 *
 * 提供知识库接口类型定义。
 * 实现由 apps/knowledge-server 独立提供（ADR-040）。
 */

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
