/**
 * KnowledgeService — 知识库持久化与检索服务
 *
 * 基于 @lancedb/lancedb 的嵌入式向量数据库，结合本地 EmbeddingService 做向量化。
 *
 * ## 知识本质定义（ADR-040）
 *
 * 本服务存储和检索的"知识"是 BanvasGL 能力体系的完整认知，包含两个维度：
 *   - 语义维度（What）：每种组件是什么、能做什么、适合什么场景、有什么限制
 *   - 格式维度（How）：如何将语义理解表达为合法的 AI Projection JSON
 *
 * 知识分三层：
 *   - Schema 种子（能力认知）：语义+格式合一，格式维度自动生成，语义维度人工编写
 *   - Composition 种子（组合模式）：高质量 Few-shot 示例，LLM 生成 + 程序化验证 + 人工 review
 *   - Theme 种子（设计 Token）：可枚举的视觉配置值，人工维护
 *
 * 正确性验证：格式维度通过 fromAIProjection() 程序化验证；语义维度通过 code review。
 *
 * ## 知识归属边界（ADR-040）
 *
 * 本服务仅存储系统级知识（所有应用共享的 BanvasGL 能力认知）。
 * 应用级知识（设计风格/布局偏好）= appJSON 本身，不进入本服务的公共检索池。
 * 这保证了：隐私合规（用户数据不混入公共知识库）+ 架构简洁（无额外存储层）。
 *
 * ## 职责
 *
 *   - 知识条目的写入、删除、查询（CRUD）
 *   - 向量检索 + BM25 全文检索（RRF 融合）+ Cross-Encoder 精排
 *   - 按 BanvasGL 版本隔离知识表（knowledge_v{version}）
 *
 * ## 消费方
 *
 *   - xiangdi-server 的 knowledge_search 工具通过 HTTP API 回调本服务
 *   - 知识种子脚本通过 /knowledge/upsert API 写入
 *
 * ## 设计决策
 *
 *   - 独立服务，与 BanvasGL 版本强关联，便于追踪发版影响
 *   - 向量化由同进程的 EmbeddingService 完成（无需跨服务 HTTP 调用）
 *   - LanceDB 嵌入式模式，无需额外部署向量数据库
 *   - 表名规则：knowledge_v{banvasglVersion}，新版本自动创建新表
 */

import * as path from 'node:path'
import * as os from 'node:os'
import { version as banvasglVersion } from '@banyuan/banvasgl'
import { EmbeddingService, EMBEDDING_DIMENSIONS } from './EmbeddingService.js'
import { RerankerService, type RerankCandidate } from './RerankerService.js'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** 知识片段（检索结果） */
export interface KnowledgeChunk {
  content: string
  source: string
  score: number
  metadata?: Record<string, unknown>
}

/** 知识条目（写入用） */
export interface KnowledgeEntry {
  id: string
  content: string
  source: string
  metadata?: Record<string, unknown>
}

/** 检索选项 */
export interface KnowledgeQueryOptions {
  topK?: number
  minScore?: number
  filter?: Record<string, unknown>
  /**
   * 是否启用 Cross-Encoder 精排。
   * 启用后，粗排取 topK * rerankFactor 候选，再通过 Cross-Encoder 精排到 topK。
   * 默认 true（当知识条目足够多时自动启用）。
   */
  rerank?: boolean
  /**
   * 精排扩展因子：粗排阶段取 topK * rerankFactor 个候选送入 Cross-Encoder。
   * 默认 4（即取 4 倍候选做精排）。
   */
  rerankFactor?: number
}

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface KnowledgeServiceConfig {
  /** LanceDB 数据库目录路径，默认 ~/.banyan/lancedb */
  dbPath?: string
  /** 表名，默认通过 BanvasGL 版本动态生成 */
  tableName?: string
  /** 混合检索中向量分数的权重（0-1），默认 0.6 */
  vectorWeight?: number
}

// ─── 内部类型（LanceDB 抽象）──────────────────────────────────────────────────

interface LanceRecord {
  id: string
  vector: number[]
  content: string
  source: string
  metadata: string
}

interface LanceDB {
  tableNames(): Promise<string[]>
  openTable(name: string): Promise<LanceTable>
  createTable(name: string, data: unknown[]): Promise<LanceTable>
}

interface LanceTable {
  add(data: unknown[]): Promise<void>
  delete(filter: string): Promise<void>
  countRows(): Promise<number>
  vectorSearch(vector: number[]): LanceQuery
  search(text: string): LanceQuery
  createFtsIndex(column: string, options?: { replace?: boolean }): Promise<void>
  listIndices(): Promise<Array<{ name?: string; type?: string }>>
}

interface LanceQuery {
  limit(n: number): LanceQuery
  toArray(): Promise<unknown[]>
}

// ─── KnowledgeService ──────────────────────────────────────────────────────────

export class KnowledgeService {
  private readonly dbPath: string
  private readonly tableName: string
  private readonly vectorWeight: number
  private readonly embeddingService: EmbeddingService
  private readonly rerankerService: RerankerService

  private db: LanceDB | null = null
  private table: LanceTable | null = null
  private dbInitPromise: Promise<void> | null = null
  private ftsIndexCreated = false

  constructor(config: KnowledgeServiceConfig = {}) {
    this.dbPath = config.dbPath ?? path.join(os.homedir(), '.banyan', 'lancedb')
    this.tableName = config.tableName ?? this.getDefaultTableName()
    this.vectorWeight = config.vectorWeight ?? 0.6
    this.embeddingService = EmbeddingService.getInstance()
    this.rerankerService = RerankerService.getInstance()
  }

  // ── 公共 API ────────────────────────────────────────────────────────────────

  /**
   * 检索知识库
   *
   * 流程：粗排（Vector + BM25 → RRF 融合）→ 精排（Cross-Encoder Reranker）
   *
   * 当 rerank=true（默认）且候选数量 > topK 时，粗排阶段会多取候选，
   * 然后由 Cross-Encoder 对 (query, candidate) 对逐一打分，按精排分数重新排序。
   */
  async query(query: string, options?: KnowledgeQueryOptions): Promise<KnowledgeChunk[]> {
    const topK = options?.topK ?? 5
    const minScore = options?.minScore ?? 0
    const enableRerank = options?.rerank ?? true
    const rerankFactor = options?.rerankFactor ?? 4
    const categoryFilter = options?.filter?.['category'] as string | undefined

    await this.ensureDB()
    const count = await this.table!.countRows()
    if (count === 0) return []

    // 精排模式下，粗排阶段取更多候选
    const coarseTopK = enableRerank ? topK * rerankFactor : topK
    const fetchMultiplier = categoryFilter ? 3 : 1
    const actualTopK = Math.min(coarseTopK * fetchMultiplier, count)
    const queryVector = await this.embeddingService.embedQuery(query)

    let results: KnowledgeChunk[]
    if (this.ftsIndexCreated) {
      results = await this.hybridSearch(query, queryVector, actualTopK, minScore)
    } else {
      results = await this.vectorSearch(queryVector, actualTopK, minScore)
    }

    // 按 category 过滤
    if (categoryFilter) {
      results = results.filter((chunk) => {
        const meta = chunk.metadata as Record<string, unknown> | undefined
        return meta?.['category'] === categoryFilter
      })
    }

    // Cross-Encoder 精排
    if (enableRerank && results.length > 1) {
      results = await this.rerankResults(query, results, topK)
    }

    return results.slice(0, topK)
  }

  /**
   * 写入知识条目（upsert 语义：同 id 自动覆盖）
   */
  async upsert(entries: KnowledgeEntry[]): Promise<void> {
    if (entries.length === 0) return
    await this.ensureDB()

    const vectors = await this.embeddingService.embedPassageBatch(entries.map((e) => e.content))

    const records: LanceRecord[] = entries.map((entry, i) => ({
      id: entry.id,
      vector: vectors[i],
      content: entry.content,
      source: entry.source,
      metadata: JSON.stringify(entry.metadata ?? {}),
    }))

    // upsert：先删除同 id 旧记录，再插入
    const ids = entries.map((e) => e.id)
    try {
      await this.table!.delete(`id IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})`)
    } catch {
      // 表为空时 delete 可能报错，忽略
    }

    await this.table!.add(records)
    await this.rebuildFtsIndex()
  }

  /**
   * 删除知识条目
   */
  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.ensureDB()
    const escaped = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')
    await this.table!.delete(`id IN (${escaped})`)
  }

  /**
   * 清空知识库
   */
  async clear(): Promise<void> {
    await this.ensureDB()
    try {
      await this.table!.delete('id IS NOT NULL')
    } catch {
      // ignore
    }
    this.ftsIndexCreated = false
  }

  /**
   * 获取知识条目总数
   */
  async size(): Promise<number> {
    await this.ensureDB()
    return this.table!.countRows()
  }

  /**
   * 获取当前表名
   */
  getTableName(): string {
    return this.tableName
  }

  // ── 内部：版本化表名 ────────────────────────────────────────────────────────

  private getDefaultTableName(): string {
    // 优先从环境变量获取版本号，其次从 @banyuan/banvasgl 包导出的 version 获取
    const version = process.env.BANVASGL_VERSION ?? banvasglVersion
    return version ? `knowledge_v${version}` : 'knowledge'
  }

  // ── 内部：DB 初始化 ────────────────────────────────────────────────────────

  private async ensureDB(): Promise<void> {
    if (this.table) return
    if (this.dbInitPromise) return this.dbInitPromise
    this.dbInitPromise = this.initDB()
    return this.dbInitPromise
  }

  private async initDB(): Promise<void> {
    const lancedb = await import('@lancedb/lancedb')
    this.db = (await lancedb.connect(this.dbPath)) as unknown as LanceDB

    const tableNames = await this.db.tableNames()

    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName)
      this.ftsIndexCreated = await this.checkFtsIndex()
    } else {
      const placeholder: LanceRecord = {
        id: '__init__',
        vector: new Array(EMBEDDING_DIMENSIONS).fill(0) as number[],
        content: '',
        source: '',
        metadata: '{}',
      }
      this.table = await this.db.createTable(this.tableName, [placeholder])
      await this.table.delete("id = '__init__'")
    }

    console.log(`[KnowledgeService] 已连接 LanceDB, 表名: ${this.tableName}`)
  }

  // ── 内部：检索 ────────────────────────────────────────────────────────────

  private async vectorSearch(vector: number[], topK: number, minScore: number): Promise<KnowledgeChunk[]> {
    const rows = (await this.table!.vectorSearch(vector).limit(topK).toArray()) as Array<
      LanceRecord & { _distance?: number }
    >

    return rows
      .map((row) => {
        const distance = row._distance ?? 0
        const score = Math.max(0, 1 - distance / 2)
        return this.rowToChunk(row, score)
      })
      .filter((c) => c.score >= minScore)
  }

  private async hybridSearch(
    queryText: string,
    queryVector: number[],
    topK: number,
    minScore: number,
  ): Promise<KnowledgeChunk[]> {
    const [vectorRowsRaw, ftsRows] = await Promise.all([
      this.table!.vectorSearch(queryVector)
        .limit(topK * 2)
        .toArray(),
      this.runFtsSearch(queryText, topK * 2),
    ])

    const vectorRows = vectorRowsRaw as Array<LanceRecord & { _distance?: number }>

    const vectorResults = vectorRows.map((row, rank) => ({
      id: row.id,
      rank,
      chunk: this.rowToChunk(row, Math.max(0, 1 - (row._distance ?? 0) / 2)),
    }))

    const ftsResults = (ftsRows as LanceRecord[]).map((row, rank) => ({
      id: row.id,
      rank,
      chunk: this.rowToChunk(row, 1.0),
    }))

    return this.rrfMerge(vectorResults, ftsResults, topK, minScore)
  }

  private async runFtsSearch(queryText: string, topK: number): Promise<unknown[]> {
    try {
      return await this.table!.search(queryText).limit(topK).toArray()
    } catch {
      return []
    }
  }

  private rrfMerge(
    vectorResults: Array<{ id: string; rank: number; chunk: KnowledgeChunk }>,
    ftsResults: Array<{ id: string; rank: number; chunk: KnowledgeChunk }>,
    topK: number,
    minScore: number,
  ): KnowledgeChunk[] {
    const k = 60
    const ftsWeight = 1 - this.vectorWeight
    const merged = new Map<string, { chunk: KnowledgeChunk; rrfScore: number }>()

    for (const r of vectorResults) {
      merged.set(r.id, { chunk: r.chunk, rrfScore: this.vectorWeight / (r.rank + 1 + k) })
    }

    for (const r of ftsResults) {
      const rrfScore = ftsWeight / (r.rank + 1 + k)
      const existing = merged.get(r.id)
      if (existing) {
        existing.rrfScore += rrfScore
      } else {
        merged.set(r.id, { chunk: r.chunk, rrfScore })
      }
    }

    const sorted = [...merged.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, topK)

    const maxScore = sorted[0]?.rrfScore ?? 1

    return sorted
      .map(({ chunk, rrfScore }) => ({
        ...chunk,
        score: maxScore > 0 ? rrfScore / maxScore : 0,
      }))
      .filter((c) => c.score >= minScore)
  }

  private rowToChunk(row: LanceRecord, score: number): KnowledgeChunk {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>
    } catch {
      // ignore
    }
    return {
      content: row.content,
      source: row.source,
      score,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  }

  // ── 内部：Cross-Encoder 精排 ────────────────────────────────────────────────

  /**
   * 对粗排结果进行 Cross-Encoder 精排。
   * 将粗排的 KnowledgeChunk[] 转为 RerankCandidate 输入 RerankerService，
   * 然后用 Cross-Encoder 分数替换原始的粗排分数。
   */
  private async rerankResults(
    query: string,
    candidates: KnowledgeChunk[],
    topK: number,
  ): Promise<KnowledgeChunk[]> {
    try {
      // 构造 RerankCandidate（需要 content 字段）
      const rerankCandidates: Array<RerankCandidate & { _original: KnowledgeChunk }> = candidates.map(
        (chunk) => ({
          content: chunk.content,
          _original: chunk,
        }),
      )

      const reranked = await this.rerankerService.rerank(query, rerankCandidates, topK)

      return reranked.map((r) => ({
        ...r.item._original,
        score: r.score, // 用 Cross-Encoder 分数替换粗排分数
      }))
    } catch (err) {
      // 精排失败时降级返回粗排结果
      console.warn('[KnowledgeService] Cross-Encoder 精排失败，降级使用粗排结果:', err)
      return candidates.slice(0, topK)
    }
  }

  // ── 内部：FTS 索引 ────────────────────────────────────────────────────────

  private async rebuildFtsIndex(): Promise<void> {
    try {
      await this.table!.createFtsIndex('content', { replace: true })
      this.ftsIndexCreated = true
    } catch {
      this.ftsIndexCreated = false
    }
  }

  private async checkFtsIndex(): Promise<boolean> {
    try {
      const indices = await this.table!.listIndices()
      return indices.some(
        (idx) => idx.type === 'FTS' || idx.name?.includes('fts') || idx.name?.includes('content'),
      )
    } catch {
      return false
    }
  }
}

export default new KnowledgeService()
