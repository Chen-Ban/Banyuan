/**
 * Knowledge Server — 知识路由
 *
 * 对外提供：
 *   POST   /knowledge/search  — 语义检索（向量 + BM25 混合）
 *   POST   /knowledge/upsert  — 写入/更新知识条目
 *   POST   /knowledge/embed   — 文本向量化
 *   DELETE  /knowledge/entries — 删除知识条目
 *   GET    /knowledge/stats   — 知识库统计
 *
 * 消费方：
 *   - banyan 后端（round embedding + ContextBuilder 语义检索）
 *   - xiangdi-server（knowledge_search 工具回调）
 *   - 知识种子脚本（upsert）
 */

import Router from '@koa/router'
import knowledgeService from '../services/KnowledgeService.js'
import embeddingService from '../services/EmbeddingService.js'

const router = new Router({ prefix: '/knowledge' })

/**
 * POST /knowledge/search
 *
 * 知识库语义检索（支持 Cross-Encoder 精排）。
 *
 * Body: {
 *   query: string,
 *   topK?: number,        // 返回条数，默认 5，最大 10
 *   category?: string,    // 按类目过滤
 *   rerank?: boolean,     // 是否启用 Cross-Encoder 精排，默认 true
 *   rerankFactor?: number // 粗排扩展因子（取 topK*factor 候选做精排），默认 4
 * }
 * Response: { chunks: KnowledgeChunk[], totalChunks: number, query: string }
 */
router.post('/search', async (ctx) => {
  const { query, topK, category, rerank, rerankFactor } = ctx.request.body as {
    query?: string
    topK?: number
    category?: string
    rerank?: boolean
    rerankFactor?: number
  }

  if (!query || typeof query !== 'string') {
    ctx.status = 400
    ctx.body = { error: 'query 参数必须为非空字符串' }
    return
  }

  const filter = category ? { category } : undefined
  const chunks = await knowledgeService.query(query, {
    topK: Math.min(Math.max(topK ?? 5, 1), 10),
    minScore: 0.05,
    filter,
    rerank: rerank ?? true,
    rerankFactor: rerankFactor ?? 4,
  })

  ctx.body = {
    chunks: chunks.map((c) => ({
      content: c.content,
      source: c.source,
      score: c.score,
    })),
    totalChunks: chunks.length,
    query,
  }
})

/**
 * POST /knowledge/upsert
 *
 * 写入/更新知识条目。
 *
 * Body: { entries: KnowledgeEntry[] }
 * Response: { success: true, count: number }
 */
router.post('/upsert', async (ctx) => {
  const { entries } = ctx.request.body as {
    entries?: Array<{ id: string; content: string; source: string; metadata?: Record<string, unknown> }>
  }

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    ctx.status = 400
    ctx.body = { error: 'entries 参数必须为非空数组' }
    return
  }

  await knowledgeService.upsert(entries)
  ctx.body = { success: true, count: entries.length }
})

/**
 * DELETE /knowledge/entries
 *
 * 删除知识条目。
 *
 * Body: { ids: string[] }
 * Response: { success: true }
 */
router.delete('/entries', async (ctx) => {
  const { ids } = ctx.request.body as { ids?: string[] }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    ctx.status = 400
    ctx.body = { error: 'ids 参数必须为非空数组' }
    return
  }

  await knowledgeService.remove(ids)
  ctx.body = { success: true }
})

/**
 * GET /knowledge/stats
 *
 * 获取知识库统计信息。
 */
router.get('/stats', async (ctx) => {
  const count = await knowledgeService.size()
  const tableName = knowledgeService.getTableName()
  ctx.body = { totalEntries: count, tableName }
})

/**
 * POST /knowledge/embed
 *
 * 文本向量化接口。
 * 供 banyan 后端 ContextBuilder（round embedding）和外部脚本使用。
 *
 * Body: { texts: string[], mode: 'query' | 'passage' }
 * Response: { embeddings: number[][] }
 */
router.post('/embed', async (ctx) => {
  const { texts, mode } = ctx.request.body as { texts?: string[]; mode?: string }

  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    ctx.status = 400
    ctx.body = { error: 'texts 参数必须为非空数组' }
    return
  }

  if (texts.length > 32) {
    ctx.status = 400
    ctx.body = { error: 'texts 一次最多 32 条' }
    return
  }

  const embeddings =
    mode === 'query'
      ? await embeddingService.embedQueryBatch(texts)
      : await embeddingService.embedPassageBatch(texts)

  ctx.body = { embeddings }
})

export default router
