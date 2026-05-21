/**
 * 相地 · LanceDB 知识库
 *
 * 基于 @lancedb/lancedb 的嵌入式向量数据库，直接实现 MutableKnowledgeStore 接口。
 * 内部使用 @huggingface/transformers（multilingual-e5-small）做本地 ONNX 推理。
 *
 * 检索策略：向量检索 + BM25 全文检索，RRF 融合
 *   - 向量检索：query embedding → cosine similarity → top-K
 *   - BM25 检索：query text → inverted index → top-K
 *   - RRF 融合：Reciprocal Rank Fusion 合并两路结果
 *
 * 持久化：数据以 Arrow 格式存储在本地文件系统（默认 ~/.xiangdi/lancedb）
 *
 * 使用示例：
 * ```ts
 * const store = new LanceDBKnowledgeStore();
 *
 * await store.add([
 *   { id: "btn-1", content: "Button 组件支持 variant 属性...", source: "组件文档" },
 * ]);
 *
 * const chunks = await store.query("按钮颜色怎么改", { topK: 5 });
 * ```
 */

import * as path from "node:path";
import * as os from "node:os";
import type {
  KnowledgeChunk,
  KnowledgeEntry,
  KnowledgeQueryOptions,
  MutableKnowledgeStore,
} from "./types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LanceDBKnowledgeStoreConfig {
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
   * Embedding 模型 HuggingFace Hub ID
   * 默认：Xenova/multilingual-e5-small（384 维，支持中英文，~470MB）
   */
  modelId?: string;
}

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

interface LanceRecord {
  id: string;
  vector: number[];
  content: string;
  source: string;
  metadata: string; // JSON 序列化的 metadata
}

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

type EmbedPipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] } | Array<{ data: Float32Array | number[] }>>;

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "Xenova/multilingual-e5-small";
const EMBEDDING_DIMENSIONS = 384;
const QUERY_PREFIX = "query: ";
const PASSAGE_PREFIX = "passage: ";

// ─── LanceDBKnowledgeStore ────────────────────────────────────────────────────

export class LanceDBKnowledgeStore implements MutableKnowledgeStore {
  private readonly dbPath: string;
  private readonly tableName: string;
  private readonly vectorWeight: number;
  private readonly modelId: string;

  // 懒加载
  private db: LanceDB | null = null;
  private table: LanceTable | null = null;
  private dbInitPromise: Promise<void> | null = null;

  private pipeline: EmbedPipeline | null = null;
  private pipelineInitPromise: Promise<void> | null = null;

  private ftsIndexCreated = false;

  constructor(config: LanceDBKnowledgeStoreConfig = {}) {
    this.dbPath = config.dbPath ?? path.join(os.homedir(), ".xiangdi", "lancedb");
    this.tableName = config.tableName ?? "knowledge";
    this.vectorWeight = config.vectorWeight ?? 0.6;
    this.modelId = config.modelId ?? DEFAULT_MODEL_ID;
  }

  // ── MutableKnowledgeStore 接口 ─────────────────────────────────────────────

  async query(
    query: string,
    options?: KnowledgeQueryOptions
  ): Promise<KnowledgeChunk[]> {
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 0;
    const categoryFilter = options?.filter?.["category"] as string | undefined;

    await this.ensureDB();
    const count = await this.table!.countRows();
    if (count === 0) return [];

    // 若有 category 过滤，多取一些候选再过滤
    const fetchMultiplier = categoryFilter ? 3 : 1;
    const actualTopK = Math.min(topK * fetchMultiplier, count);
    const queryVector = await this.embed(QUERY_PREFIX + query);

    let results: KnowledgeChunk[];
    if (this.ftsIndexCreated) {
      results = await this.hybridSearch(query, queryVector, actualTopK, minScore);
    } else {
      results = await this.vectorSearch(queryVector, actualTopK, minScore);
    }

    // 按 metadata.category 过滤
    if (categoryFilter) {
      results = results.filter((chunk) => {
        const meta = chunk.metadata as Record<string, unknown> | undefined;
        return meta?.["category"] === categoryFilter;
      });
    }

    return results.slice(0, topK);
  }

  async add(entries: KnowledgeEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.ensureDB();

    // 批量 embed（使用 passage 前缀）
    const vectors = await this.embedBatch(
      entries.map((e) => PASSAGE_PREFIX + e.content)
    );

    const records: LanceRecord[] = entries.map((entry, i) => ({
      id: entry.id,
      vector: vectors[i],
      content: entry.content,
      source: entry.source,
      metadata: JSON.stringify(entry.metadata ?? {}),
    }));

    // upsert：先删除同 id 旧记录，再插入
    const ids = entries.map((e) => e.id);
    try {
      await this.table!.delete(
        `id IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`
      );
    } catch {
      // 表为空时 delete 可能报错，忽略
    }

    await this.table!.add(records);

    // 写入后重建 FTS 索引
    await this.rebuildFtsIndex();
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.ensureDB();
    const escaped = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    await this.table!.delete(`id IN (${escaped})`);
  }

  async clear(): Promise<void> {
    await this.ensureDB();
    try {
      await this.table!.delete("id IS NOT NULL");
    } catch {
      // 表为空时忽略
    }
    this.ftsIndexCreated = false;
  }

  async size(): Promise<number> {
    await this.ensureDB();
    return this.table!.countRows();
  }

  // ── 内部：DB 初始化 ────────────────────────────────────────────────────────

  private async ensureDB(): Promise<void> {
    if (this.table) return;
    if (this.dbInitPromise) return this.dbInitPromise;
    this.dbInitPromise = this.initDB();
    return this.dbInitPromise;
  }

  private async initDB(): Promise<void> {
    // 确保 embedding 已初始化（需要知道维度）
    await this.ensurePipeline();

    const lancedb = await import("@lancedb/lancedb");
    this.db = (await lancedb.connect(this.dbPath)) as unknown as LanceDB;

    const tableNames = await this.db.tableNames();

    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
      this.ftsIndexCreated = await this.checkFtsIndex();
    } else {
      // 用占位记录初始化 schema
      const placeholder: LanceRecord = {
        id: "__init__",
        vector: new Array(EMBEDDING_DIMENSIONS).fill(0) as number[],
        content: "",
        source: "",
        metadata: "{}",
      };
      this.table = await this.db.createTable(this.tableName, [placeholder]);
      await this.table.delete("id = '__init__'");
    }
  }

  // ── 内部：Embedding ────────────────────────────────────────────────────────

  private async ensurePipeline(): Promise<void> {
    if (this.pipeline) return;
    if (this.pipelineInitPromise) return this.pipelineInitPromise;
    this.pipelineInitPromise = this.loadPipeline();
    return this.pipelineInitPromise;
  }

  private async loadPipeline(): Promise<void> {
    const { pipeline } = await import("@huggingface/transformers");
    this.pipeline = (await pipeline("feature-extraction", this.modelId, {
      dtype: "fp32",
    })) as unknown as EmbedPipeline;
  }

  private async embed(text: string): Promise<number[]> {
    await this.ensurePipeline();
    const vecs = await this.runInference([text]);
    return vecs[0];
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensurePipeline();
    return this.runInference(texts);
  }

  private async runInference(texts: string[]): Promise<number[][]> {
    const output = await this.pipeline!(texts, { pooling: "mean", normalize: true });

    if (Array.isArray(output)) {
      return output.map((item) => Array.from(item.data as Float32Array));
    }

    const data = output.data as Float32Array;
    if (texts.length === 1) {
      return [Array.from(data)];
    }

    const result: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * EMBEDDING_DIMENSIONS;
      result.push(Array.from(data.slice(start, start + EMBEDDING_DIMENSIONS)));
    }
    return result;
  }

  // ── 内部：检索 ────────────────────────────────────────────────────────────

  private async vectorSearch(
    vector: number[],
    topK: number,
    minScore: number
  ): Promise<KnowledgeChunk[]> {
    const rows = (await this.table!
      .vectorSearch(vector)
      .limit(topK)
      .toArray()) as Array<LanceRecord & { _distance?: number }>;

    return rows
      .map((row) => {
        const distance = row._distance ?? 0;
        const score = Math.max(0, 1 - distance / 2);
        return this.rowToChunk(row, score);
      })
      .filter((c) => c.score >= minScore);
  }

  private async hybridSearch(
    queryText: string,
    queryVector: number[],
    topK: number,
    minScore: number
  ): Promise<KnowledgeChunk[]> {
    const [vectorRowsRaw, ftsRows] = await Promise.all([
      this.table!.vectorSearch(queryVector).limit(topK * 2).toArray(),
      this.runFtsSearch(queryText, topK * 2),
    ]);

    const vectorRows = vectorRowsRaw as Array<LanceRecord & { _distance?: number }>;

    const vectorResults = vectorRows.map((row, rank) => ({
      id: row.id,
      rank,
      chunk: this.rowToChunk(row, Math.max(0, 1 - (row._distance ?? 0) / 2)),
    }));

    const ftsResults = (ftsRows as LanceRecord[]).map((row, rank) => ({
      id: row.id,
      rank,
      chunk: this.rowToChunk(row, 1.0),
    }));

    return this.rrfMerge(vectorResults, ftsResults, topK, minScore);
  }

  private async runFtsSearch(queryText: string, topK: number): Promise<unknown[]> {
    try {
      return await this.table!.search(queryText).limit(topK).toArray();
    } catch {
      return [];
    }
  }

  private rrfMerge(
    vectorResults: Array<{ id: string; rank: number; chunk: KnowledgeChunk }>,
    ftsResults: Array<{ id: string; rank: number; chunk: KnowledgeChunk }>,
    topK: number,
    minScore: number
  ): KnowledgeChunk[] {
    const k = 60;
    const ftsWeight = 1 - this.vectorWeight;
    const merged = new Map<string, { chunk: KnowledgeChunk; rrfScore: number }>();

    for (const r of vectorResults) {
      merged.set(r.id, { chunk: r.chunk, rrfScore: this.vectorWeight / (r.rank + 1 + k) });
    }

    for (const r of ftsResults) {
      const rrfScore = ftsWeight / (r.rank + 1 + k);
      const existing = merged.get(r.id);
      if (existing) {
        existing.rrfScore += rrfScore;
      } else {
        merged.set(r.id, { chunk: r.chunk, rrfScore });
      }
    }

    const sorted = [...merged.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK);

    const maxScore = sorted[0]?.rrfScore ?? 1;

    return sorted
      .map(({ chunk, rrfScore }) => ({
        ...chunk,
        score: maxScore > 0 ? rrfScore / maxScore : 0,
      }))
      .filter((c) => c.score >= minScore);
  }

  private rowToChunk(row: LanceRecord, score: number): KnowledgeChunk {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // ignore
    }
    return {
      content: row.content,
      source: row.source,
      score,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  // ── 内部：FTS 索引 ────────────────────────────────────────────────────────

  private async rebuildFtsIndex(): Promise<void> {
    try {
      await this.table!.createFtsIndex("content", { replace: true });
      this.ftsIndexCreated = true;
    } catch {
      this.ftsIndexCreated = false;
    }
  }

  private async checkFtsIndex(): Promise<boolean> {
    try {
      const indices = await this.table!.listIndices();
      return indices.some(
        (idx) => idx.type === "FTS" || idx.name?.includes("fts") || idx.name?.includes("content")
      );
    } catch {
      return false;
    }
  }
}
