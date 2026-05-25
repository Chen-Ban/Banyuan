/**
 * Agent 记忆服务
 *
 * 负责 Agent 记忆（Episode + Fact）的完整生命周期管理：
 *   写入：接收 XiangDi memory_update SSE 事件，持久化到 MongoDB
 *   读取：语义检索（embedding cosine similarity）+ 评分排序，构建记忆上下文
 *   维护：惰性触发 episode 压缩 + fact 衰减
 *
 * 检索策略：
 *   - 优先使用 embedding 向量做 cosine similarity（通过 Knowledge Service）
 *   - embedding 不可用时降级为关键词匹配
 *   - 最终评分 = 语义相关度 × W1 + 时间衰减 × W2 + 重要度/置信度 × W3
 *
 * 设计原则：
 *   - 所有写入异步 fire-and-forget，不阻塞 SSE 响应
 *   - 读取降级容错：embedding 失败 → 关键词匹配；全部失败 → 返回 null
 *   - 维护惰性触发：recall 时检查距上次维护 > 7 天则异步执行
 */

import AgentMemory, {
  IAgentMemory,
  IEpisode,
  IFact,
  EpisodeOutcome,
  FactCategory,
} from '../models/AgentMemory.js'
import knowledgeClient from './KnowledgeClient.js'

// ─── 输入类型（来自 SSE memory_update 事件）─────────────────────────────────────

export interface MemoryUpdateInput {
  episode: {
    title: string
    content: string
    outcome: EpisodeOutcome
    lessons: string[]
    involvedEntities: string[]
    tags: string[]
    importance: number
  } | null
  facts: Array<{
    category: FactCategory
    content: string
    confidence: number
  }>
}

// ─── 配置常量 ─────────────────────────────────────────────────────────────────

const MAX_EPISODES = 200
const MAX_FACTS = 500
const CONSOLIDATE_KEEP_RECENT = 100
const CONSOLIDATE_IMPORTANCE_THRESHOLD = 0.5
const FACT_SIMILARITY_THRESHOLD = 0.7
const FACT_DECAY_DAYS = 30
const FACT_DECAY_MIN_REFS = 3
const FACT_DECAY_AMOUNT = 0.05
const MAINTAIN_INTERVAL_DAYS = 7
const EPISODE_HALF_LIFE_DAYS = 30
const RECALL_EPISODES_TOP_K = 3
const RECALL_FACTS_TOP_K = 5
const RECALL_FACTS_MIN_CONFIDENCE = 0.3

// ─── MemoryService ─────────────────────────────────────────────────────────────

class MemoryService {
  // ═══════════════════════════════════════════════════════════════════════════
  // 写入
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 处理 memory_update SSE 事件，持久化 episode 和 facts
   */
  async handleMemoryUpdate(appId: string, data: MemoryUpdateInput): Promise<void> {
    const memory = await this.getOrCreate(appId)

    if (data.episode) {
      const episodeId = crypto.randomUUID()

      // 为 episode content 生成 embedding
      const embedding = await knowledgeClient.embedPassage(
        `${data.episode.title} ${data.episode.content} ${data.episode.lessons.join(' ')}`
      )

      const episode: IEpisode = {
        episodeId,
        title: data.episode.title,
        content: data.episode.content,
        outcome: data.episode.outcome,
        lessons: data.episode.lessons,
        involvedEntities: data.episode.involvedEntities,
        tags: data.episode.tags,
        importance: data.episode.importance,
        embedding,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      }

      memory.episodes.push(episode)

      // 超限压缩
      if (memory.episodes.length > MAX_EPISODES) {
        this.consolidateEpisodes(memory)
      }

      // 写入关联的 facts
      for (const factInput of data.facts) {
        await this.upsertFact(memory, factInput, [episodeId])
      }
    } else if (data.facts.length > 0) {
      // 没有 episode 但有独立 facts（少见但可能）
      for (const factInput of data.facts) {
        await this.upsertFact(memory, factInput, [])
      }
    }

    await memory.save()
  }

  /**
   * Upsert 单条 fact：相似则合并，否则新增
   */
  private async upsertFact(
    memory: IAgentMemory,
    input: { category: FactCategory; content: string; confidence: number },
    derivedFrom: string[]
  ): Promise<void> {
    const similar = this.findSimilarFact(memory.facts, input.content)

    if (similar) {
      // 合并：置信度累加（上限 1），引用计数+1
      similar.confidence = Math.min(1, similar.confidence + input.confidence * 0.2)
      similar.referenceCount++
      similar.derivedFrom.push(...derivedFrom)
      similar.updatedAt = new Date()
    } else {
      // 新增
      const embedding = await knowledgeClient.embedPassage(input.content)

      memory.facts.push({
        factId: crypto.randomUUID(),
        category: input.category,
        content: input.content,
        confidence: input.confidence,
        referenceCount: 0,
        derivedFrom,
        embedding,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 超限淘汰
    if (memory.facts.length > MAX_FACTS) {
      this.evictLowValueFacts(memory)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 读取
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 检索与 query 相关的记忆，返回格式化文本（注入 L3 上下文层）
   * 返回 null 表示无可用记忆
   */
  async recall(appId: string, query: string): Promise<string | null> {
    const memory = await AgentMemory.findOne({ appId })
    if (!memory || (memory.episodes.length === 0 && memory.facts.length === 0)) {
      return null
    }

    // 惰性维护
    this.lazyMaintain(memory)

    // 获取 query embedding
    const queryEmbedding = await knowledgeClient.embedQuery(query)

    // 检索 episodes
    const episodes = this.scoreAndRankEpisodes(memory.episodes, query, queryEmbedding)

    // 检索 facts
    const facts = this.scoreAndRankFacts(memory.facts, query, queryEmbedding)

    if (episodes.length === 0 && facts.length === 0) {
      return null
    }

    // 更新命中记录
    const now = new Date()
    for (const ep of episodes) {
      const doc = memory.episodes.find((e) => e.episodeId === ep.episodeId)
      if (doc) doc.lastAccessedAt = now
    }
    for (const f of facts) {
      const doc = memory.facts.find((fact) => fact.factId === f.factId)
      if (doc) doc.referenceCount++
    }
    // 异步保存，不阻塞返回
    memory.save().catch((err) => console.error('[MemoryService] save recall updates failed:', err))

    return this.formatMemoryContext(episodes, facts)
  }

  /**
   * 对 episodes 评分排序，返回 top-K
   * score = relevance × 0.5 + recency × 0.2 + importance × 0.3
   */
  private scoreAndRankEpisodes(
    episodes: IEpisode[],
    query: string,
    queryEmbedding: number[] | null
  ): IEpisode[] {
    const now = Date.now()
    const scored = episodes.map((ep) => {
      const relevance = queryEmbedding && ep.embedding
        ? this.cosineSimilarity(queryEmbedding, ep.embedding)
        : this.keywordRelevance(query, `${ep.title} ${ep.content} ${ep.lessons.join(' ')}`)

      const elapsedDays = (now - new Date(ep.lastAccessedAt).getTime()) / 86400000
      const recency = Math.pow(0.5, elapsedDays / EPISODE_HALF_LIFE_DAYS)

      const score = relevance * 0.5 + recency * 0.2 + ep.importance * 0.3
      return { episode: ep, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, RECALL_EPISODES_TOP_K)
      .filter((s) => s.score > 0.1)
      .map((s) => s.episode)
  }

  /**
   * 对 facts 评分排序，返回 top-K
   * score = relevance × 0.6 + confidence × 0.3 + min(refCount/10, 0.3) × 0.1
   */
  private scoreAndRankFacts(
    facts: IFact[],
    query: string,
    queryEmbedding: number[] | null
  ): IFact[] {
    const scored = facts
      .filter((f) => f.confidence >= RECALL_FACTS_MIN_CONFIDENCE)
      .map((f) => {
        const relevance = queryEmbedding && f.embedding
          ? this.cosineSimilarity(queryEmbedding, f.embedding)
          : this.keywordRelevance(query, f.content)

        const refBonus = Math.min(f.referenceCount / 10, 0.3)
        const score = relevance * 0.6 + f.confidence * 0.3 + refBonus * 0.1
        return { fact: f, score }
      })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, RECALL_FACTS_TOP_K)
      .filter((s) => s.score > 0.1)
      .map((s) => s.fact)
  }

  /**
   * 格式化记忆上下文为文本（注入 system prompt）
   * 按类别分组：用户偏好（最醒目）→ 相关经验 → 相关知识
   */
  private formatMemoryContext(episodes: IEpisode[], facts: IFact[]): string {
    // 分离偏好 Fact 和其他 Fact
    const prefFacts = facts.filter((f) => f.category === 'user_preference')
    const otherFacts = facts.filter((f) => f.category !== 'user_preference')

    const sections: string[] = []

    // 用户偏好段落（最醒目，放最前）
    if (prefFacts.length > 0) {
      sections.push('### 用户偏好（请严格遵守）')
      for (const f of prefFacts) {
        sections.push(`- ${f.content}`)
      }
    }

    // 相关经验
    if (episodes.length > 0) {
      if (sections.length > 0) sections.push('')
      sections.push('### 相关经验')
      let idx = 1
      for (const ep of episodes) {
        const outcomeEmoji = ep.outcome === 'success' ? '✓' : ep.outcome === 'failure' ? '✗' : '~'
        sections.push(`${idx}. [${outcomeEmoji}] ${ep.title}`)
        if (ep.lessons.length > 0) {
          sections.push(`   教训：${ep.lessons.join('；')}`)
        }
        idx++
      }
    }

    // 其他知识
    if (otherFacts.length > 0) {
      if (sections.length > 0) sections.push('')
      sections.push('### 相关知识')
      for (const f of otherFacts) {
        sections.push(`- ${f.content} (${f.category})`)
      }
    }

    return sections.join('\n')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 维护
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 惰性维护：距上次维护超过 7 天则异步触发
   */
  private lazyMaintain(memory: IAgentMemory): void {
    const daysSinceLastMaintain =
      (Date.now() - new Date(memory.lastMaintainedAt).getTime()) / 86400000
    if (daysSinceLastMaintain < MAINTAIN_INTERVAL_DAYS) return

    // 异步 fire-and-forget
    setImmediate(() => {
      this.maintain(memory).catch((err) =>
        console.error('[MemoryService] maintain failed:', err)
      )
    })
  }

  /**
   * 执行维护：episode 压缩 + fact 衰减
   */
  private async maintain(memory: IAgentMemory): Promise<void> {
    // Episode 压缩
    if (memory.episodes.length > CONSOLIDATE_KEEP_RECENT) {
      this.consolidateEpisodes(memory)
    }

    // Fact 衰减
    const now = Date.now()
    memory.facts = memory.facts.filter((f) => {
      const daysSinceUpdate = (now - new Date(f.updatedAt).getTime()) / 86400000
      if (daysSinceUpdate > FACT_DECAY_DAYS && f.referenceCount < FACT_DECAY_MIN_REFS) {
        f.confidence -= FACT_DECAY_AMOUNT
        f.updatedAt = new Date()
        return f.confidence > 0
      }
      return true
    })

    memory.lastMaintainedAt = new Date()
    await memory.save()
  }

  /**
   * 压缩 episodes：保留最近 N 条 + 高重要度旧条目，淘汰其余
   */
  private consolidateEpisodes(memory: IAgentMemory): void {
    // 按创建时间排序（最新在前）
    const sorted = [...memory.episodes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    const kept: IEpisode[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i < CONSOLIDATE_KEEP_RECENT) {
        // 保留最近 N 条
        kept.push(sorted[i])
      } else if (sorted[i].importance >= CONSOLIDATE_IMPORTANCE_THRESHOLD) {
        // 保留高重要度旧条目
        kept.push(sorted[i])
      }
      // 其余丢弃（低重要度旧条目）
    }

    memory.episodes = kept
  }

  /**
   * 淘汰低价值 facts（超容量时移除最低 20%）
   */
  private evictLowValueFacts(memory: IAgentMemory): void {
    const evictCount = Math.ceil(memory.facts.length * 0.2)

    // 按价值排序：confidence × log2(referenceCount + 2)
    const scored = memory.facts.map((f) => ({
      fact: f,
      value: f.confidence * Math.log2(f.referenceCount + 2),
    }))
    scored.sort((a, b) => a.value - b.value)

    const evictIds = new Set(scored.slice(0, evictCount).map((s) => s.fact.factId))
    memory.facts = memory.facts.filter((f) => !evictIds.has(f.factId))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 获取或创建 AgentMemory 文档
   */
  private async getOrCreate(appId: string): Promise<IAgentMemory> {
    let memory = await AgentMemory.findOne({ appId })
    if (!memory) {
      memory = new AgentMemory({
        appId,
        episodes: [],
        facts: [],
        lastMaintainedAt: new Date(),
      })
    }
    return memory
  }

  /**
   * 查找相似 fact（关键词相似度 > threshold 判定为相似）
   */
  private findSimilarFact(facts: IFact[], content: string): IFact | null {
    const queryTokens = this.tokenize(content)
    for (const f of facts) {
      const factTokens = this.tokenize(f.content)
      const similarity = this.tokenSimilarity(queryTokens, factTokens)
      if (similarity > FACT_SIMILARITY_THRESHOLD) {
        return f
      }
    }
    return null
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    return denominator === 0 ? 0 : dotProduct / denominator
  }

  /**
   * 关键词相关度（embedding 不可用时的降级方案）
   */
  private keywordRelevance(query: string, text: string): number {
    const queryTokens = this.tokenize(query)
    const textTokens = this.tokenize(text)
    return this.tokenSimilarity(queryTokens, textTokens)
  }

  /**
   * Token 集合相似度
   */
  private tokenSimilarity(tokensA: string[], tokensB: string[]): number {
    if (tokensA.length === 0) return 0
    const setB = new Set(tokensB)
    let matchCount = 0
    for (const token of tokensA) {
      if (setB.has(token)) {
        matchCount += 1.0
      } else {
        // 子串模糊匹配
        for (const b of setB) {
          if (b.includes(token) || token.includes(b)) {
            matchCount += 0.5
            break
          }
        }
      }
    }
    return Math.min(matchCount / tokensA.length, 1)
  }

  /**
   * 简单分词（中英文混合）
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  }
}

// ─── 导出单例 ─────────────────────────────────────────────────────────────────

export default new MemoryService()
