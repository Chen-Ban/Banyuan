# ADR-007：KnowledgeStore 生产级 RAG 实现选型

**状态**：已采纳  
**决策日期**：2026-05-14  
**决策者**：Banyuan 核心团队

---

## 背景

ADR-005 确立了 KnowledgeStore 的 Tool 模式架构（按需检索，而非管线注入）。
但彼时的 `MemoryKnowledgeStore` 实现仅使用 Jaccard 系数做关键词匹配，
存在以下问题：

1. **语义理解缺失**：无法处理同义词、近义词，"按钮颜色" 无法匹配 "Button variant"
2. **中文支持弱**：简单分词对中文短语理解不足
3. **无关系推理**：无法回答"修改 ProductCard 会影响哪些页面"这类关联查询
4. **无持久化**：每次重启需重新加载知识，大规模知识库启动慢

## 决策

采用三层技术栈实现生产级 RAG + GraphRAG 混合检索：

### 1. Embedding：`@huggingface/transformers` + `multilingual-e5-small`

**选型理由**：
- 本地 ONNX 推理，无需调用外部 API，无网络延迟和费用
- `multilingual-e5-small` 支持中英文及 100+ 语言，384 维，~470MB
- E5 系列模型的 query/passage 前缀设计，检索质量显著优于通用模型
- 首次使用自动下载并缓存，后续启动无需重新下载

**放弃的方案**：
- OpenAI/DeepSeek Embeddings API：有网络依赖和费用，不适合离线桌面场景
- `sentence-transformers`（Python）：需要 Python 运行时，增加部署复杂度
- `all-MiniLM-L6-v2`：英文优化，中文效果差

### 2. 向量存储：`@lancedb/lancedb`

**选型理由**：
- 嵌入式列式向量数据库，无需启动独立服务（对比 Chroma、Qdrant）
- 内置 BM25 全文检索（FTS），一个库同时支持向量 + 关键词两种检索
- 数据以 Arrow 格式持久化到本地磁盘，重启后无需重新 embed
- 支持 RRF（Reciprocal Rank Fusion）内置混合检索
- 纯 Node.js 包，无 native addon 依赖问题

**放弃的方案**：
- `vectra`（sqlite-vec）：BM25 支持弱，需要额外集成
- `chromadb`：需要独立服务，不适合桌面嵌入场景
- `hnswlib-node`：仅向量检索，无 BM25

### 3. 图存储：`graphology` + `graphology-traversal`

**选型理由**：
- 纯 JavaScript 图数据结构，无需 Neo4j 等外部图数据库
- 标准化 API，支持有向/无向/混合图
- 内置 BFS/DFS 遍历，满足子图检索和影响分析需求
- 支持 JSON 序列化，可持久化到文件
- 生态丰富（PageRank、社区发现等算法库）

**放弃的方案**：
- Neo4j：需要独立服务，过重
- `ngraph.graph`：API 不够标准化，生态较小

## 架构设计

```
HybridKnowledgeStore（三通道 RRF 融合）
├── 通道 1：向量检索（LanceDBVectorStore）
│   └── TransformersEmbeddingProvider（multilingual-e5-small）
├── 通道 2：BM25 全文检索（LanceDB 内置 FTS）
│   └── 与向量检索共用同一 LanceDB 表，内部 RRF 融合
└── 通道 3：图检索（GraphologyGraphStore）
    └── BFS 子图扩展 + 影响分析

路由策略（LLM Router / RuleBasedRouter）：
  "vector"  → 通道 1 + 2（向量 + BM25）
  "graph"   → 通道 3（图检索）
  "hybrid"  → 全部三通道，最终 RRF 融合
```

## 实现细节

### E5 模型的 query/passage 前缀

E5 系列模型要求：
- 查询文本：`"query: " + text`（用于检索时的 embed）
- 文档文本：`"passage: " + text`（用于写入时的 embed）

`TransformersEmbeddingProvider` 的 `embed()` 方法自动添加 `query:` 前缀，
`embedPassage()` 方法添加 `passage:` 前缀。
`LanceDBVectorStore.upsertTexts()` 内部自动使用 `embedPassage()`。

### BM25 索引重建策略

LanceDB 的 FTS 索引在写入后需要显式重建（`createFtsIndex`）。
当前实现在每次 `upsert` 后自动重建，适合知识库构建阶段（批量写入）。
若需要高频增量写入，可改为定时重建或手动触发。

### RRF 融合参数

- `k = 60`：RRF 经典常数，平衡高排名和低排名结果的影响
- `vectorWeight = 0.6`：向量/BM25 通道权重（默认略高于图检索）
- `graphWeight = 0.4`：图检索通道权重

## 影响

### 正面影响

- 语义检索质量大幅提升，支持中英文混合查询
- 知识库持久化，重启后无需重新 embed
- 图检索支持多页面关联分析，为复杂变更提供更丰富的上下文
- 三通道 RRF 融合，综合了语义、关键词、关系三个维度

### 负面影响 / 权衡

- 首次使用需下载 multilingual-e5-small 模型（~470MB），需要网络
- 内存占用增加（模型加载约 200MB）
- 首次 embed 有冷启动延迟（模型加载 ~2s，后续 ~50ms/条）
- 增加了三个新依赖（@lancedb/lancedb、@huggingface/transformers、graphology）

### 向后兼容

- `MemoryKnowledgeStore` 和 `InMemoryGraphStore` 保留，用于测试和小数据量场景
- `KnowledgeStore` 接口不变，现有代码无需修改
- `HybridKnowledgeStore` 新增可选的 `embeddingProvider` 参数，不传时降级为旧行为

## 参考

- [E5 论文：Text Embeddings by Weakly-Supervised Contrastive Pre-training](https://arxiv.org/abs/2212.03533)
- [LanceDB 文档：Hybrid Search](https://lancedb.github.io/lancedb/hybrid_search/hybrid_search/)
- [RRF 论文：Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods](https://dl.acm.org/doi/10.1145/1571941.1572114)
- [GraphRAG 论文：From Local to Global: A Graph RAG Approach to Query-Focused Summarization](https://arxiv.org/abs/2404.16130)
- [graphology 文档](https://graphology.github.io/)
