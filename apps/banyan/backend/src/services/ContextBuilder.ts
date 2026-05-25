/**
 * ContextBuilder — 按需检索式上下文分层组装服务（V2）
 *
 * 核心改进（相比 V1 暴力时间窗口）：
 *   - 检索维度：语义相似度 + 时间近因混合排序
 *   - 检索单元：round（每轮对话的 roundSummary，含 embedding）
 *   - 命中后展开：top-k 相关 round → 取该 round 对应的原始 messages 放入 L4
 *   - 兜底保留：最近 M 轮强制保留（保证对话连贯性）
 *
 * 五层上下文中的定位：
 *   L3: contextSummary（未选中 round 的摘要拼接）→ 动态生成，无需预计算
 *   L4: recentMessages（命中的 round 原始消息 ∪ 最近 M 轮）
 *
 * 检索算法：
 *   1. 对当前 prompt 调用 XiangDi /ai/embed 获取 query vector
 *   2. 遍历 rounds[]，计算 cosineSimilarity(query, round.embedding)
 *   3. 混合排序：score = α * semantic_score + (1-α) * recency_score
 *      - semantic_score: cosine similarity（0~1）
 *      - recency_score: 1 / (1 + time_decay_factor * days_ago)
 *   4. 取 top-k 个 round + 最近 M 轮（去重合并）→ L4
 *   5. 剩余 round 的 roundSummary 拼接 → L3（contextSummary）
 *
 * Token 预算模型（双层水位动态计算）：
 *   1. 获取当前模型的总上下文窗口（MODEL_CONTEXT_WINDOWS）
 *   2. 两层预算：
 *      - 推荐预算 = 总窗口 × RECOMMENDED_USAGE_RATIO(40%) − L1 − L2 − L5（弹性扩展的目标水位）
 *      - 可用预算 = 总窗口 − L1 − L2 − L5（硬上限，超出则向前端报警）
 *   3. 刚性保障校验：如果最近 M 轮 token 已超出 **可用预算** → 抛出 ContextBudgetOverflowError
 *   4. 弹性填充 top-k：以 round 为原子粒度（整轮放入/整轮跳过），目标不超出 **推荐预算**
 *
 * 降级策略：
 *   - 如果 rounds[] 为空（旧数据/首轮对话），回退到 V1 时间窗口模式
 *   - 如果 embedding 调用失败，回退到纯时间窗口
 *   - 如果 round 无 embedding（embedding 生成失败过），仅参与时间近因排序
 */

import Conversation, { IMessage, IRound } from '../models/Conversation.js'
import knowledgeClient from './KnowledgeClient.js'

// ─── 模型上下文窗口配置 ──────────────────────────────────────────────────────────

/**
 * 各 LLM 模型的上下文窗口大小（tokens）
 *
 * 数据来源（官方文档）：
 *   - DeepSeek API Docs (api-docs.deepseek.com/zh-cn/quick_start/pricing)
 *     deepseek-v4-pro / deepseek-v4-flash / deepseek-chat: 上下文长度 1M (1,000,000 tokens)
 *   - Kimi API 开放平台 (platform.kimi.com/docs/models)
 *     kimi-k2.6: 上下文长度 256K (256,000 tokens)
 *
 * 注意：DeepSeek V4 虽然支持 1M 上下文，但实际使用中我们不会填满整个窗口，
 * 预算模型通过 RECOMMENDED_USAGE_RATIO 控制实际使用水位。
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-v4-pro': 1000000,
  'deepseek-v4-flash': 1000000,
  'deepseek-chat': 1000000,       // 映射到 deepseek-v4-flash 非思考模式
  'deepseek-reasoner': 1000000,   // 映射到 deepseek-v4-flash 思考模式
  'kimi-k2.6': 256000,
}

/** 默认上下文窗口（未知模型时的保守估计） */
const DEFAULT_CONTEXT_WINDOW = 256000

/**
 * 推荐上下文使用率
 *
 * LLM 在上下文使用率 ~40% 时性能最优（注意力分配更集中，
 * "lost in the middle" 效应最小），因此推荐总 token 用量不超过窗口的 40%。
 */
const RECOMMENDED_USAGE_RATIO = 0.4

// ─── 检索配置 ──────────────────────────────────────────────────────────────────

/** 最少保留的最近对话轮数（强制保留，不被检索覆盖） */
const MIN_RECENT_ROUNDS = 3

/** 语义检索 top-k 候选数量上限（不含强制保留的最近 M 轮） */
const SEMANTIC_TOP_K = 5

/** 混合排序中语义分数的权重（0-1，越大越偏语义） */
const SEMANTIC_WEIGHT = 0.6

/** 时间衰减因子：每天衰减多少（越大衰减越快） */
const TIME_DECAY_FACTOR = 0.1

/** V1 回退模式下 L4 占总预算的比例 */
const FALLBACK_THRESHOLD_RATIO = 0.7

// ─── Token 估算 ──────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 2)
}

function estimateMessageTokens(msg: { content: string | unknown }): number {
  if (typeof msg.content === 'string') {
    return estimateTokens(msg.content) + 4
  }
  const serialized = JSON.stringify(msg.content)
  return estimateTokens(serialized) + 4
}

// ─── 向量工具 ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── 输入类型 ──────────────────────────────────────────────────────────────────

/**
 * ContextBuilder 的输入参数——外部层的 token 占用信息
 * 由 AiService 在调用前计算并传入
 */
export interface ContextBuildOptions {
  /** 当前使用的 LLM 模型名称（用于查询上下文窗口大小） */
  modelName?: string

  /** L1 (SystemPrompt) 的 token 估算值 */
  systemPromptTokens?: number

  /** L2 (AgentMemory) 的 token 估算值 */
  agentMemoryTokens?: number

  /** L5 (CurrentPrompt) 的 token 估算值 */
  currentPromptTokens?: number
}

// ─── 输出类型 ──────────────────────────────────────────────────────────────────

/**
 * ContextBuilder 的输出——分层上下文
 */
export interface LayeredContext {
  /**
   * 未选中 round 的摘要拼接文本（注入 XiangDi 的 memoryHint 参数）
   * 若历史为空或无可用 roundSummary，则为 null
   */
  contextSummary: string | null

  /**
   * 检索命中 + 最近保留的对话消息（裁剪后），注入 XiangDi 的 previousMessages 参数
   * 按时间序排列（从旧到新）
   */
  recentMessages: Array<{ role: 'user' | 'assistant'; content: IMessage['content'] }>
}

// ─── 错误类型 ──────────────────────────────────────────────────────────────────

/**
 * 刚性保障（最近 M 轮）超出 L3+L4 可用预算时抛出的错误。
 * 前端应捕获此错误并向用户提示"对话历史过长"。
 */
export class ContextBudgetOverflowError extends Error {
  readonly code = 'CONTEXT_BUDGET_OVERFLOW'
  readonly details: {
    rigidTokens: number
    availableBudget: number
    recommendedBudget: number
    modelContextWindow: number
    recentRounds: number
  }

  constructor(
    message: string,
    details: {
      rigidTokens: number
      availableBudget: number
      recommendedBudget: number
      modelContextWindow: number
      recentRounds: number
    }
  ) {
    super(message)
    this.name = 'ContextBudgetOverflowError'
    this.details = details
  }
}

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

interface ScoredRound {
  round: IRound
  index: number // rounds[] 中的位置
  semanticScore: number
  recencyScore: number
  mixedScore: number
}

// ─── ContextBuilder 服务 ──────────────────────────────────────────────────────

class ContextBuilder {
  /**
   * 构建分层上下文（V2：按需检索模式）
   *
   * @param appId          应用 ID
   * @param currentPrompt  当前用户输入（用于语义检索）
   * @param options        外部层的 token 占用信息（L1/L2/L5 + 模型名）
   * @returns 分层上下文对象
   */
  async build(appId: string, currentPrompt?: string, options?: ContextBuildOptions): Promise<LayeredContext> {
    const conv = await Conversation.findOne({ appId }).select('messages messageCount rounds')

    if (!conv || conv.messages.length === 0) {
      return {
        contextSummary: null,
        recentMessages: [],
      }
    }

    const rounds = conv.rounds ?? []

    // 如果没有 rounds 数据（旧数据或首轮对话），回退到 V1 时间窗口模式
    if (rounds.length === 0) {
      return this.buildFallback(conv.messages, options)
    }

    // 尝试按需检索模式
    try {
      return await this.buildWithRetrieval(conv.messages, rounds, currentPrompt, options)
    } catch (err) {
      // 预算溢出错误需要向上抛出（由 AiService 转为 SSE error 发给前端）
      if (err instanceof ContextBudgetOverflowError) {
        throw err
      }
      console.error('[ContextBuilder] 按需检索失败，回退到时间窗口模式:', err)
      return this.buildFallback(conv.messages, options)
    }
  }

  // ─── 预算计算 ──────────────────────────────────────────────────────────────

  /**
   * 计算 L3+L4 的双层预算
   *
   * 双层水位模型：
   *   - recommendedBudget = modelWindow × 40% − L1 − L2 − L5
   *     弹性扩展的目标水位，LLM 在此区间内注意力性能最优
   *   - availableBudget = modelWindow − L1 − L2 − L5
   *     硬上限预算，仅当刚性保障超出此值时向前端报警
   *
   * 这两层预算确保：
   *   1. 正常情况下弹性填充以推荐预算为目标（~40% 窗口利用率）
   *   2. 只有极端情况（最近 M 轮就超出了模型实际容量）才报错
   */
  private computeBudget(options?: ContextBuildOptions): {
    recommendedBudget: number
    availableBudget: number
    modelContextWindow: number
  } {
    const modelName = options?.modelName ?? 'deepseek-v4-pro'
    const modelContextWindow = MODEL_CONTEXT_WINDOWS[modelName] ?? DEFAULT_CONTEXT_WINDOW

    // 扣除已知的 L1 / L2 / L5 占用
    const l1Tokens = options?.systemPromptTokens ?? 2500 // 默认估值：system prompt ~2500 tokens
    const l2Tokens = options?.agentMemoryTokens ?? 0
    const l5Tokens = options?.currentPromptTokens ?? 0
    const fixedLayerTokens = l1Tokens + l2Tokens + l5Tokens

    // 推荐预算：modelWindow × 40% − L1 − L2 − L5（弹性扩展目标）
    const recommendedBudget = Math.max(0, Math.floor(modelContextWindow * RECOMMENDED_USAGE_RATIO) - fixedLayerTokens)

    // 可用预算：modelWindow − L1 − L2 − L5（硬上限，超出报警）
    const availableBudget = Math.max(0, modelContextWindow - fixedLayerTokens)

    return { recommendedBudget, availableBudget, modelContextWindow }
  }

  // ─── V2：按需检索模式 ──────────────────────────────────────────────────────

  private async buildWithRetrieval(
    allMessages: IMessage[],
    rounds: IRound[],
    currentPrompt?: string,
    options?: ContextBuildOptions
  ): Promise<LayeredContext> {
    const now = new Date()

    // 0. 计算双层预算
    const { recommendedBudget, availableBudget, modelContextWindow } = this.computeBudget(options)

    // 1. 获取 query embedding（当前 prompt 的语义向量）
    let queryEmbedding: number[] | null = null
    if (currentPrompt) {
      queryEmbedding = await this.getQueryEmbedding(currentPrompt)
    }

    // 2. 对每个 round 计算混合分数
    const scoredRounds: ScoredRound[] = rounds.map((round, index) => {
      // 语义分数
      let semanticScore = 0
      if (queryEmbedding && round.embedding) {
        semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, round.embedding))
      }

      // 时间近因分数：距今天数越少分数越高
      const daysAgo = (now.getTime() - round.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      const recencyScore = 1 / (1 + TIME_DECAY_FACTOR * daysAgo)

      // 混合分数
      const hasEmbedding = queryEmbedding !== null && round.embedding !== null
      const mixedScore = hasEmbedding
        ? SEMANTIC_WEIGHT * semanticScore + (1 - SEMANTIC_WEIGHT) * recencyScore
        : recencyScore // 无 embedding 时仅用时间近因

      return { round, index, semanticScore, recencyScore, mixedScore }
    })

    // 3. 分离"最近 M 轮"（强制保留）和"可检索轮"
    const totalRounds = scoredRounds.length
    const recentCount = Math.min(MIN_RECENT_ROUNDS, totalRounds)
    const forcedRecent = scoredRounds.slice(-recentCount) // 最后 M 个
    const retrievable = scoredRounds.slice(0, -recentCount) // 前面的可检索

    // 4. 从可检索轮中取 top-k（按 mixedScore 降序）
    const topK = retrievable
      .sort((a, b) => b.mixedScore - a.mixedScore)
      .slice(0, SEMANTIC_TOP_K)

    // 5. 展开 L4 消息（优先级：最近 M 轮刚性保障 → 弹性预算填 top-k）
    let recentMessages: Array<{ role: 'user' | 'assistant'; content: IMessage['content'] }> = []
    let totalTokens = 0
    const selectedSet = new Set<number>()

    // 5a. 先展开最近 M 轮（刚性保障，对话连贯性底线）
    const recentByTime = [...forcedRecent].sort((a, b) => a.index - b.index)
    for (const sr of recentByTime) {
      const { startIndex, endIndex } = sr.round
      const roundMsgs = allMessages.slice(startIndex, endIndex)
      const roundTokens = roundMsgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

      totalTokens += roundTokens
      selectedSet.add(sr.index)
      for (const m of roundMsgs) {
        recentMessages.push({ role: m.role, content: m.content })
      }
    }

    // 5a-校验：刚性保障超出 **可用预算（硬上限）** 时，才向前端抛出报警
    // 注意：此处用 availableBudget（modelWindow − L1 − L2 − L5），而非 recommendedBudget
    if (totalTokens > availableBudget) {
      throw new ContextBudgetOverflowError(
        `刚性保障（最近 ${recentCount} 轮）token 数 ${totalTokens} 超出模型可用预算 ${availableBudget}` +
        `（模型窗口 ${modelContextWindow}，扣除 L1+L2+L5 后剩余 ${availableBudget}）。` +
        `请考虑清理历史对话或切换到更大上下文窗口的模型。`,
        { rigidTokens: totalTokens, availableBudget, recommendedBudget, modelContextWindow, recentRounds: recentCount }
      )
    }

    // 5b. 弹性填充 top-k（按相关性从高到低，以 round 为粒度，skip 而非 break）
    //     目标：totalTokens ≤ recommendedBudget（推荐预算，40% 水位）
    //     逻辑：如果当前 round 放得进就放，放不进则跳过继续尝试下一个
    const topKFiltered = topK
      .filter((sr) => !selectedSet.has(sr.index))
      .sort((a, b) => b.mixedScore - a.mixedScore)

    const topKSelected: ScoredRound[] = []
    for (const sr of topKFiltered) {
      const { startIndex, endIndex } = sr.round
      const roundMsgs = allMessages.slice(startIndex, endIndex)
      const roundTokens = roundMsgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

      // 以 round 为原子粒度：放得下就放（目标不超 recommendedBudget），放不下就跳过
      if (totalTokens + roundTokens > recommendedBudget) {
        continue
      }

      totalTokens += roundTokens
      selectedSet.add(sr.index)
      topKSelected.push(sr)
    }

    // 5c. 合并 top-k 和最近 M 轮，按时间序重建 recentMessages
    if (topKSelected.length > 0) {
      // 有 top-k 命中需要合并，重建完整的时间序消息
      const allSelected = scoredRounds
        .filter((sr) => selectedSet.has(sr.index))
        .sort((a, b) => a.index - b.index)

      recentMessages = []
      for (const sr of allSelected) {
        const { startIndex, endIndex } = sr.round
        const roundMsgs = allMessages.slice(startIndex, endIndex)
        for (const m of roundMsgs) {
          recentMessages.push({ role: m.role, content: m.content })
        }
      }
    }

    // 去掉最后一条（当前 user 消息，由 XiangDi 单独注入）
    if (recentMessages.length > 0) {
      const lastMsg = recentMessages[recentMessages.length - 1]
      if (lastMsg.role === 'user') {
        recentMessages = recentMessages.slice(0, -1)
      }
    }

    // 6. 构建 contextSummary（L3）—— 未选中 round 的摘要拼接
    const unselectedRounds = scoredRounds.filter((sr) => !selectedSet.has(sr.index))
    const contextSummary = this.buildContextSummary(unselectedRounds)

    return {
      contextSummary,
      recentMessages,
    }
  }

  // ─── V1 回退：暴力时间窗口模式 ─────────────────────────────────────────────

  private buildFallback(allMessages: IMessage[], options?: ContextBuildOptions): LayeredContext {
    // 回退模式也使用动态预算（如果有 options），否则用保守估计
    // 回退模式以推荐预算为目标（不会触发硬限制报警）
    const { recommendedBudget } = this.computeBudget(options)
    const tokenBudget = recommendedBudget > 0 ? recommendedBudget * FALLBACK_THRESHOLD_RATIO : 15000
    const minRecentCount = MIN_RECENT_ROUNDS * 2 // 一轮 = 2 条消息

    // 从最新消息往前取，直到填满预算
    let totalTokens = 0
    let startIndex = allMessages.length

    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessageTokens(allMessages[i])
      if (totalTokens + msgTokens > tokenBudget && allMessages.length - i >= minRecentCount) {
        break
      }
      totalTokens += msgTokens
      startIndex = i
    }

    const recentSlice = allMessages.slice(startIndex)
    const recentForOutput = recentSlice.slice(0, -1) // 去掉最后一条（当前 prompt）

    const recentMessages = recentForOutput.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    return {
      contextSummary: null, // 无 round 数据时无法生成摘要
      recentMessages,
    }
  }

  // ─── 工具方法 ──────────────────────────────────────────────────────────────

  /**
   * 通过知识服务获取 query embedding
   */
  private async getQueryEmbedding(text: string): Promise<number[] | null> {
    return knowledgeClient.embedQuery(text)
  }

  /**
   * 将未选中 round 的 roundSummary 拼接为 L3 上下文摘要
   */
  private buildContextSummary(unselectedRounds: ScoredRound[]): string | null {
    if (unselectedRounds.length === 0) return null

    const summaries = unselectedRounds
      .filter((sr) => sr.round.roundSummary)
      .map((sr) => sr.round.roundSummary)

    if (summaries.length === 0) return null

    return `## 历史对话摘要（${summaries.length} 轮）\n\n${summaries.join('\n\n')}`
  }
}

export default new ContextBuilder()
