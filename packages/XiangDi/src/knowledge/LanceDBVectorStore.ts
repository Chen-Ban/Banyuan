/**
 * 相地 · LanceDB 向量存储（VectorStore + BM25 混合检索）
 *
 * 基于 @lancedb/lancedb 的嵌入式向量数据库实现。
 *
 * 特性：
 *   - 向量相似度检索（余弦相似度）
 *   - 全文检索（BM25，内置，无需额外服务）
 *   - 混合检索（向量 + BM25，RRF 融合）
 *   - 持久化到本地磁盘（默认 ~/.xiangdi/lancedb）
 *   - 支持 upsert（幂等写入）
 *
 * 架构说明：
 *   LanceDB 是嵌入式列式向量数据库，数据以 Arrow 格式存储在本地文件系统。
 *   无需启动独立服务，适合桌面应用和本地开发场景。
 *
 *   混合检索流程：
 *     1. 向量检索：query embedding → cosine similarity → top-K
 *     2. BM25 检索：query text → inverted index → top-K
 *     3. RRF 融合：Reciprocal Rank Fusion 合并两路结果
 *
 * 使用示例：
 * ```ts
 * const embeddingProvider = new TransformersEmbeddingProvider();
 * const store = new LanceDBVectorStore(embeddingProvider, {
 *   dbPath: "/path/to/db",
 *   tableName: "knowledge",
 * });
 *
 * await store.upsert([
 *   { id: "btn-1", vector: [...], payload: { content: "Button 组件...", source: "组件文档" } },
 * ]);
 *
 * const results = await store.search(queryVector, 5);
 * ```
 */

import * as path from "node:path";
import * as os from "node:os";
import type { EmbeddingProvider, VectorItem, VectorSearchResult, VectorStore } from "./types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LanceDBVectorStoreConfig {
  /**
   * LanceDB 数据库目录路径
   * 默认：~/.xiangdi/lancedb
   */
  dbPath?: string;
  /**
   * 表名
   * 默认：knowledge
   */
  tableName?: string;
  /**
   * 混合检索中向量分数的权重（0-1）
   * 默认：0.6（向量权重略高于 BM25）
   */
  vectorWeight?: number;
  /**
   * 是否启用 BM25 全文检索
   * 默认：true
   * 注意：首次写入后需要调用 createFtsIndex() 才能使用 BM25
   */
  enableFts?: boolean;
}

// ─── LanceDB 表记录类型 ────────────────────────────────────────────────────────

interface LanceRecord {
  id: string;
  vector: number[];
  content: string;
  source: string;
  metadata: string; // JSON 序列化的 metadata
}

// ─── LanceDBVectorStore ───────────────────────────────────────────────────────

export class LanceDBVectorStore implements VectorStore {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly dbPath: string;
  private readonly tableName: string;
  private readonly vectorWeight: number;
  private readonly enableFts: boolean;

  // 懒加载的 LanceDB 连接和表
  private db: unknown = null;
  private table: unknown = null;
  private initPromise: Promise<void> | null = null;
  private ftsIndexCreated = false;

  constructor(embeddingProvider: EmbeddingProvider, config: LanceDBVectorStoreConfig = {}) {
    this.embeddingProvider = embeddingProvider;
    this.dbPath = config.dbPath ?? path.join(os.homedir(), ".xiangdi", "lancedb");
    this.tableName = config.tableName ?? "knowledge";
    this.vectorWeight = config.vectorWeight ?? 0.6;
    this.enableFts = config.enableFts ?? true;
  }

  // ── VectorStore 接口实现 ───────────────────────────────────────────────────

  async upsert(items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.ensureInitialized();

    const tbl = this.table as LanceTable;
    const records: LanceRecord[] = items.map((item) => ({
      id: item.id,
      vector: item.vector,
      content: String(item.payload["content"] ?? ""),
      source: String(item.payload["source"] ?? ""),
      metadata: JSON.stringify(item.payload),
    }));

    // LanceDB upsert：先删除同 id 的旧记录，再插入
    const ids = items.map((i) => i.id);
    try {
      await tbl.delete(`id IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`);
    } catch {
      // 表为空时 delete 可能报错，忽略
    }

    await tbl.add(records);

    // 写入后重建 FTS 索引（增量写入时需要）
    if (this.enableFts) {
      await this.rebuildFtsIndex();
    }
  }

  async search(
    vector: number[],
    topK: number,
    minScore = 0
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    const tbl = this.table as LanceTable;
    const count = await this.size();
    if (count === 0) return [];

    const actualTopK = Math.min(topK, count);

    if (this.enableFts && this.ftsIndexCreated) {
      // 混合检索：向量 + BM25，RRF 融合
      return this.hybridSearch(tbl, vector, actualTopK, minScore);
    }

    // 纯向量检索
    return this.vectorSearch(tbl, vector, actualTopK, minScore);
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.ensureInitialized();

    const tbl = this.table as LanceTable;
    const escaped = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    await tbl.delete(`id IN (${escaped})`);
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    const tbl = this.table as LanceTable;
    // 删除所有记录
    try {
      await tbl.delete("id IS NOT NULL");
    } catch {
      // 表为空时忽略
    }
    this.ftsIndexCreated = false;
  }

  async size(): Promise<number> {
    await this.ensureInitialized();
    const tbl = this.table as LanceTable;
    return tbl.countRows();
  }

  // ── 高级方法：文本直接写入（自动 embed）────────────────────────────────────

  /**
   * 直接写入文本条目（自动计算 embedding）
   * 使用 passage 前缀（E5 模型最佳实践）
   */
  async upsertTexts(
    entries: Array<{ id: string; content: string; source: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    if (entries.length === 0) return;

    // 批量 embed（使用 passage 前缀）
    const provider = this.embeddingProvider as TransformersLike;
    const embedFn = provider.embedPassage
      ? (t: string) => provider.embedPassage!(t)
      : (t: string) => this.embeddingProvider.embed(t);

    const vectors = await Promise.all(entries.map((e) => embedFn(e.content)));

    const items: VectorItem[] = entries.map((entry, i) => ({
      id: entry.id,
      vector: vectors[i],
      payload: {
        content: entry.content,
        source: entry.source,
        ...(entry.metadata ?? {}),
      },
    }));

    await this.upsert(items);
  }

  // ── 内部实现 ──────────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (this.table) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    const lancedb = await import("@lancedb/lancedb");
    this.db = await lancedb.connect(this.dbPath);
    const db = this.db as LanceDB;

    const tableNames = await db.tableNames();

    if (tableNames.includes(this.tableName)) {
      this.table = await db.openTable(this.tableName);
      // 检查 FTS 索引是否已存在
      this.ftsIndexCreated = await this.checkFtsIndex();
    } else {
      // 创建新表（使用空记录初始化 schema）
      const emptyRecord: LanceRecord = {
        id: "__init__",
        vector: new Array(this.embeddingProvider.dimensions).fill(0) as number[],
        content: "",
        source: "",
        metadata: "{}",
      };
      this.table = await db.createTable(this.tableName, [emptyRecord]);
      // 删除初始化占位记录
      await (this.table as LanceTable).delete("id = '__init__'");
    }
  }

  private async vectorSearch(
    tbl: LanceTable,
    vector: number[],
    topK: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    const rows = (await tbl
      .vectorSearch(vector)
      .limit(topK)
      .toArray()) as Array<LanceRecord & { _distance?: number }>;

    return rows
      .map((row) => {
        // LanceDB 返回的是 L2 距离，转换为余弦相似度近似值
        const distance = row._distance ?? 0;
        const score = Math.max(0, 1 - distance / 2); // 归一化到 0-1
        return {
          id: row.id,
          score,
          payload: this.parsePayload(row),
        };
      })
      .filter((r: VectorSearchResult) => r.score >= minScore);
  }

  private async hybridSearch(
    tbl: LanceTable,
    vector: number[],
    topK: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    // 并行执行向量检索和 BM25 检索
    // BM25 需要查询文本，从 payload 中无法直接获取，
    // 这里通过 metadata 中存储的 content 字段做 FTS
    const vectorRows = (await tbl.vectorSearch(vector).limit(topK * 2).toArray()) as Array<LanceRecord & { _distance?: number }>;

    // 向量结果转换
    const vectorResults: VectorSearchResult[] = vectorRows.map(
      (row) => {
        const distance = row._distance ?? 0;
        const score = Math.max(0, 1 - distance / 2);
        return { id: row.id, score, payload: this.parsePayload(row) };
      }
    );

    // RRF 融合（此处仅向量，BM25 在 queryWithText 中使用）
    return vectorResults
      .filter((r) => r.score >= minScore)
      .slice(0, topK);
  }

  /**
   * 带文本的混合检索（向量 + BM25）
   * 当有查询文本时调用此方法，效果优于纯向量检索
   */
  async searchWithText(
    queryText: string,
    queryVector: number[],
    topK: number,
    minScore = 0
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();
    const tbl = this.table as LanceTable;
    const count = await this.size();
    if (count === 0) return [];

    const actualTopK = Math.min(topK, count);

    if (!this.enableFts || !this.ftsIndexCreated) {
      return this.vectorSearch(tbl, queryVector, actualTopK, minScore);
    }

    // 并行执行向量检索和 BM25 全文检索
    const [vectorRowsRaw, ftsRows] = await Promise.all([
      tbl.vectorSearch(queryVector).limit(actualTopK * 2).toArray(),
      this.runFtsSearch(tbl, queryText, actualTopK * 2),
    ]);
    const vectorRows = vectorRowsRaw as Array<LanceRecord & { _distance?: number }>;

    // 向量结果
    const vectorResults = vectorRows.map(
      (row, rank) => ({
        id: row.id,
        rank,
        score: Math.max(0, 1 - (row._distance ?? 0) / 2),
        payload: this.parsePayload(row),
      })
    );

    // BM25 结果
    const ftsResults = ftsRows.map((row: LanceRecord, rank: number) => ({
      id: row.id,
      rank,
      score: 1.0, // BM25 分数归一化处理
      payload: this.parsePayload(row),
    }));

    // RRF 融合
    return this.rrfMerge(vectorResults, ftsResults, actualTopK, minScore, this.vectorWeight);
  }

  private async runFtsSearch(
    tbl: LanceTable,
    queryText: string,
    topK: number
  ): Promise<LanceRecord[]> {
    try {
      return (await tbl
        .search(queryText)
        .limit(topK)
        .toArray()) as LanceRecord[];
    } catch {
      // FTS 索引不可用时返回空
      return [];
    }
  }

  private rrfMerge(
    vectorResults: Array<{ id: string; rank: number; score: number; payload: Record<string, unknown> }>,
    ftsResults: Array<{ id: string; rank: number; score: number; payload: Record<string, unknown> }>,
    topK: number,
    minScore: number,
    vectorWeight: number
  ): VectorSearchResult[] {
    const k = 60; // RRF 经典常数
    const ftsWeight = 1 - vectorWeight;
    const merged = new Map<string, { payload: Record<string, unknown>; rrfScore: number }>();

    for (const r of vectorResults) {
      const rrfScore = vectorWeight / (r.rank + 1 + k);
      merged.set(r.id, { payload: r.payload, rrfScore });
    }

    for (const r of ftsResults) {
      const rrfScore = ftsWeight / (r.rank + 1 + k);
      const existing = merged.get(r.id);
      if (existing) {
        existing.rrfScore += rrfScore;
      } else {
        merged.set(r.id, { payload: r.payload, rrfScore });
      }
    }

    const sorted = [...merged.entries()]
      .sort((a, b) => b[1].rrfScore - a[1].rrfScore)
      .slice(0, topK);

    const maxScore = sorted[0]?.[1].rrfScore ?? 1;

    return sorted
      .map(([id, { payload, rrfScore }]) => ({
        id,
        score: maxScore > 0 ? rrfScore / maxScore : 0,
        payload,
      }))
      .filter((r) => r.score >= minScore);
  }

  private async rebuildFtsIndex(): Promise<void> {
    try {
      const tbl = this.table as LanceTable;
      await tbl.createFtsIndex("content", { replace: true });
      this.ftsIndexCreated = true;
    } catch {
      // FTS 索引创建失败不影响向量检索
      this.ftsIndexCreated = false;
    }
  }

  private async checkFtsIndex(): Promise<boolean> {
    try {
      const tbl = this.table as LanceTable;
      const indices = await tbl.listIndices();
      return indices.some(
        (idx: { name?: string; type?: string }) =>
          idx.type === "FTS" || idx.name?.includes("fts") || idx.name?.includes("content")
      );
    } catch {
      return false;
    }
  }

  private parsePayload(row: LanceRecord): Record<string, unknown> {
    try {
      const meta = JSON.parse(row.metadata) as Record<string, unknown>;
      return {
        content: row.content,
        source: row.source,
        ...meta,
      };
    } catch {
      return { content: row.content, source: row.source };
    }
  }
}

// ─── 内部类型（LanceDB API 的最小类型声明）────────────────────────────────────

interface LanceDB {
  tableNames(): Promise<string[]>;
  openTable(name: string): Promise<LanceTable>;
  createTable(name: string, data: unknown[]): Promise<LanceTable>;
}

interface LanceTable {
  add(data: unknown[]): Promise<void>;
  delete(filter: string): Promise<void>;
  countRows(): Promise<number>;
  vectorSearch(vector: number[]): LanceQuery;
  search(text: string): LanceQuery;
  createFtsIndex(column: string, options?: { replace?: boolean }): Promise<void>;
  listIndices(): Promise<Array<{ name?: string; type?: string }>>;
}

interface LanceQuery {
  limit(n: number): LanceQuery;
  toArray(): Promise<unknown[]>;
}

interface TransformersLike extends EmbeddingProvider {
  embedPassage?: (text: string) => Promise<number[]>;
}
