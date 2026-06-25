/**
 * ContextBuilder — 按需检索式上下文分层组装服务（V2）
 *
 * 核心改进（相比 V1 暴力时间窗口）：
 *   - 检索维度：语义相似度 + 时间近因混合排序
 *   - 检索单元：dialogue（每个对话的 summary，含 embedding）
 *   - 命中后展开：top-k 相关 dialogue → 取该 dialogue 对应的原始 messages 放入 L4
 *   - 兜底保留：最近 M 个 dialogue 强制保留（保证对话连贯性）
 *
 * 五层上下文中的定位：
 *   L3: contextSummary（未选中 dialogue 的摘要拼接）→ 动态生成，无需预计算
 *   L4: recentMessages（命中的 dialogue 原始消息 ∪ 最近 M 个 dialogue）
 *
 * 检索算法：
 *   1. 对当前 prompt 调用知识服务获取 query vector
 *   2. 遍历 dialogues[]，计算 cosineSimilarity(query, dialogue.summary.embedding)
 *   3. 混合排序：score = α * semantic_score + (1-α) * recency_score
 *      - semantic_score: cosine similarity（0~1）
 *      - recency_score: 1 / (1 + time_decay_factor * days_ago)
 *   4. 取 top-k 个 dialogue + 最近 M 个 dialogue（去重合并）→ L4
 *   5. 剩余 dialogue 的 summary 拼接 → L3（contextSummary）
 *
 * Token 预算模型（双层水位动态计算）：
 *   1. 获取当前模型的总上下文窗口（MODEL_CONTEXT_WINDOWS）
 *   2. 两层预算：
 *      - 推荐预算 = 总窗口 × RECOMMENDED_USAGE_RATIO(40%) − L1 − L2 − L5（弹性扩展的目标水位）
 *      - 可用预算 = 总窗口 − L1 − L2 − L5（硬上限，超出则向前端报警）
 *   3. 刚性保障校验：如果最近 M 个 dialogue token 已超出 **可用预算** → 抛出 ContextBudgetOverflowError
 *   4. 弹性填充 top-k：以 dialogue 为原子粒度（整个放入/整个跳过），目标不超出 **推荐预算**
 *
 * 降级策略：
 *   - 如果 dialogues[] 为空（旧数据/首轮对话），返回空上下文
 *   - 如果 embedding 调用失败，回退到纯时间窗口
 *   - 如果 dialogue 无 embedding（embedding 生成失败过），仅参与时间近因排序
 */

import Dialogue, { type IDialogueDoc } from '../models/Dialogue.js'
import type { IMessage } from '../models/types/index.js'
import knowledgeClient from './KnowledgeClient.js'
import { logger } from '../utils/logger.js'

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
  'deepseek-chat': 1000000, // 映射到 deepseek-v4-flash 非思考模式
  'deepseek-reasoner': 1000000, // 映射到 deepseek-v4-flash 思考模式
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

/** 最少保留的最近对话数（强制保留，不被检索覆盖） */
const MIN_RECENT_DIALOGUES = 3

/** 语义检索 top-k 候选数量上限（不含强制保留的最近 M 个） */
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

/**
 * 估算单条消息的 token 数
 * V2：消息内容从 IMessage 中提取（userContent.prompt 或 assistantContent 序列化）
 */
function estimateMessageTokens(msg: IMessage): number {
  if (msg.role === 'user' && msg.userContent) {
    return estimateTokens(msg.userContent.prompt) + 4
  }
  if (msg.role === 'assistant' && msg.assistantContent) {
    // 只计算 text 类型的内容块（工具调用等不作为上下文传递）
    const textBlocks = msg.assistantContent.filter((b) => b.type === 'text')
    const text = textBlocks.map((b) => (b as { type: 'text'; text: string }).text).join('')
    return estimateTokens(text) + 4
  }
  return 4
}

/**
 * 将 IMessage 转换为 LLM 上下文格式
 */
function messageToContextFormat(msg: IMessage): { role: 'user' | 'assistant'; content: string } | null {
  if (msg.role === 'user' && msg.userContent) {
    return { role: 'user', content: msg.userContent.prompt }
  }
  if (msg.role === 'assistant' && msg.assistantContent) {
    const textBlocks = msg.assistantContent.filter((b) => b.type === 'text')
    const text = textBlocks.map((b) => (b as { type: 'text'; text: string }).text).join('')
    if (text) {
      return { role: 'assistant', content: text }
    }
  }
  return null
}

// ─── 向量工具 ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0,
    normA = 0,
    normB = 0
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
   * 未选中 dialogue 的摘要拼接文本（注入 XiangDi 的 memoryHint 参数）
   * 若历史为空或无可用 summary，则为 null
   */
  contextSummary: string | null

  /**
   * 检索命中 + 最近保留的对话消息（裁剪后），注入 XiangDi 的 previousMessages 参数
   * 按时间序排列（从旧到新）
   */
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

// ─── 错误类型 ──────────────────────────────────────────────────────────────────

/**
 * 刚性保障（最近 M 个 dialogue）超出 L3+L4 可用预算时抛出的错误。
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
    },
  ) {
    super(message)
    this.name = 'ContextBudgetOverflowError'
    this.details = details
  }
}

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

interface ScoredDialogue {
  dialogue: IDialogueDoc
  index: number // dialogues[] 中的位置
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
    // 从独立 Dialogue 集合查询已完成的对话（phase=done）
    const dialogues = (await Dialogue.find({
      appId,
      phase: 'done',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()) as unknown as IDialogueDoc[]

    if (!dialogues || dialogues.length === 0) {
      return {
        contextSummary: null,
        recentMessages: [],
      }
    }

    // 按时间正序排列（最早在前）
    dialogues.reverse()

    // 如果所有 dialogue 都没有 summary（旧数据或首轮对话），回退到时间窗口模式
    const hasSummaries = dialogues.some((d) => d.summary?.text)
    if (!hasSummaries) {
      return this.buildFallback(dialogues, options)
    }

    // 尝试按需检索模式
    try {
      return await this.buildWithRetrieval(dialogues, currentPrompt, options)
    } catch (err) {
      // 预算溢出错误需要向上抛出（由 AiService 转为 SSE error 发给前端）
      if (err instanceof ContextBudgetOverflowError) {
        throw err
      }
      logger.error('[ContextBuilder] 按需检索失败，回退到时间窗口模式:', err)
      return this.buildFallback(dialogues, options)
    }
  }

  // ─── 预算计算 ──────────────────────────────────────────────────────────────

  /**
   * 计算 L3+L4 的双层预算
   */
  private computeBudget(options?: ContextBuildOptions): {
    recommendedBudget: number
    availableBudget: number
    modelContextWindow: number
  } {
    const modelName = options?.modelName ?? 'deepseek-v4-pro'
    const modelContextWindow = MODEL_CONTEXT_WINDOWS[modelName] ?? DEFAULT_CONTEXT_WINDOW

    // 扣除已知的 L1 / L2 / L5 占用
    const l1Tokens = options?.systemPromptTokens ?? 2500
    const l2Tokens = options?.agentMemoryTokens ?? 0
    const l5Tokens = options?.currentPromptTokens ?? 0
    const fixedLayerTokens = l1Tokens + l2Tokens + l5Tokens

    // 推荐预算：modelWindow × 40% − L1 − L2 − L5（弹性扩展目标）
    const recommendedBudget = Math.max(
      0,
      Math.floor(modelContextWindow * RECOMMENDED_USAGE_RATIO) - fixedLayerTokens,
    )

    // 可用预算：modelWindow − L1 − L2 − L5（硬上限，超出报警）
    const availableBudget = Math.max(0, modelContextWindow - fixedLayerTokens)

    return { recommendedBudget, availableBudget, modelContextWindow }
  }

  // ─── V2：按需检索模式 ──────────────────────────────────────────────────────

  private async buildWithRetrieval(
    dialogues: IDialogueDoc[],
    currentPrompt?: string,
    options?: ContextBuildOptions,
  ): Promise<LayeredContext> {
    const now = new Date()

    // 0. 计算双层预算
    const { recommendedBudget, availableBudget, modelContextWindow } = this.computeBudget(options)

    // 1. 获取 query embedding（当前 prompt 的语义向量）
    let queryEmbedding: number[] | null = null
    if (currentPrompt) {
      queryEmbedding = await this.getQueryEmbedding(currentPrompt)
    }

    // 2. 对每个 dialogue 计算混合分数
    const scoredDialogues: ScoredDialogue[] = dialogues.map((dialogue, index) => {
      // 语义分数
      let semanticScore = 0
      const dialogueEmbedding = dialogue.summary?.embedding ?? null
      if (queryEmbedding && dialogueEmbedding) {
        semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, dialogueEmbedding))
      }

      // 时间近因分数：距今天数越少分数越高
      const daysAgo = (now.getTime() - new Date(dialogue.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      const recencyScore = 1 / (1 + TIME_DECAY_FACTOR * daysAgo)

      // 混合分数
      const hasEmbedding = queryEmbedding !== null && dialogueEmbedding != null
      const mixedScore = hasEmbedding
        ? SEMANTIC_WEIGHT * semanticScore + (1 - SEMANTIC_WEIGHT) * recencyScore
        : recencyScore // 无 embedding 时仅用时间近因

      return { dialogue, index, semanticScore, recencyScore, mixedScore }
    })

    // 3. 分离"最近 M 个 dialogue"（强制保留）和"可检索 dialogue"
    const totalDialogues = scoredDialogues.length
    const recentCount = Math.min(MIN_RECENT_DIALOGUES, totalDialogues)
    const forcedRecent = scoredDialogues.slice(-recentCount) // 最后 M 个
    const retrievable = scoredDialogues.slice(0, -recentCount) // 前面的可检索

    // 4. 从可检索 dialogue 中取 top-k（按 mixedScore 降序）
    const topK = retrievable.sort((a, b) => b.mixedScore - a.mixedScore).slice(0, SEMANTIC_TOP_K)

    // 5. 展开 L4 消息（优先级：最近 M 个 dialogue 刚性保障 → 弹性预算填 top-k）
    let recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    let totalTokens = 0
    const selectedSet = new Set<number>()

    // 5a. 先展开最近 M 个 dialogue（刚性保障，对话连贯性底线）
    const recentByTime = [...forcedRecent].sort((a, b) => a.index - b.index)
    for (const sd of recentByTime) {
      const dialogueMsgs = sd.dialogue.messages ?? []
      const dialogueTokens = dialogueMsgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

      totalTokens += dialogueTokens
      selectedSet.add(sd.index)
      for (const m of dialogueMsgs) {
        const formatted = messageToContextFormat(m)
        if (formatted) {
          recentMessages.push(formatted)
        }
      }
    }

    // 5a-校验：刚性保障超出 **可用预算（硬上限）** 时，才向前端抛出报警
    if (totalTokens > availableBudget) {
      throw new ContextBudgetOverflowError(
        `刚性保障（最近 ${recentCount} 个对话）token 数 ${totalTokens} 超出模型可用预算 ${availableBudget}` +
          `（模型窗口 ${modelContextWindow}，扣除 L1+L2+L5 后剩余 ${availableBudget}）。` +
          `请考虑清理历史对话或切换到更大上下文窗口的模型。`,
        {
          rigidTokens: totalTokens,
          availableBudget,
          recommendedBudget,
          modelContextWindow,
          recentRounds: recentCount,
        },
      )
    }

    // 5b. 弹性填充 top-k（按相关性从高到低，以 dialogue 为粒度，skip 而非 break）
    const topKFiltered = topK
      .filter((sd) => !selectedSet.has(sd.index))
      .sort((a, b) => b.mixedScore - a.mixedScore)

    const topKSelected: ScoredDialogue[] = []
    for (const sd of topKFiltered) {
      const dialogueMsgs = sd.dialogue.messages ?? []
      const dialogueTokens = dialogueMsgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

      // 以 dialogue 为原子粒度：放得下就放（目标不超 recommendedBudget），放不下就跳过
      if (totalTokens + dialogueTokens > recommendedBudget) {
        continue
      }

      totalTokens += dialogueTokens
      selectedSet.add(sd.index)
      topKSelected.push(sd)
    }

    // 5c. 合并 top-k 和最近 M 个 dialogue，按时间序重建 recentMessages
    if (topKSelected.length > 0) {
      // 有 top-k 命中需要合并，重建完整的时间序消息
      const allSelected = scoredDialogues
        .filter((sd) => selectedSet.has(sd.index))
        .sort((a, b) => a.index - b.index)

      recentMessages = []
      for (const sd of allSelected) {
        const dialogueMsgs = sd.dialogue.messages ?? []
        for (const m of dialogueMsgs) {
          const formatted = messageToContextFormat(m)
          if (formatted) {
            recentMessages.push(formatted)
          }
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

    // 6. 构建 contextSummary（L3）—— 未选中 dialogue 的摘要拼接
    const unselectedDialogues = scoredDialogues.filter((sd) => !selectedSet.has(sd.index))
    const contextSummary = this.buildContextSummary(unselectedDialogues)

    return {
      contextSummary,
      recentMessages,
    }
  }

  // ─── V1 回退：暴力时间窗口模式 ─────────────────────────────────────────────

  private buildFallback(dialogues: IDialogueDoc[], options?: ContextBuildOptions): LayeredContext {
    // 回退模式也使用动态预算（如果有 options），否则用保守估计
    const { recommendedBudget } = this.computeBudget(options)
    const tokenBudget = recommendedBudget > 0 ? recommendedBudget * FALLBACK_THRESHOLD_RATIO : 15000

    // 将所有 dialogue 的消息展平为时间序列表
    const allMessages: IMessage[] = []
    for (const dialogue of dialogues) {
      for (const msg of dialogue.messages ?? []) {
        allMessages.push(msg)
      }
    }

    if (allMessages.length === 0) {
      return { contextSummary: null, recentMessages: [] }
    }

    const minRecentCount = MIN_RECENT_DIALOGUES * 2 // 一个 dialogue 约 2 条消息

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

    const recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const m of recentForOutput) {
      const formatted = messageToContextFormat(m)
      if (formatted) {
        recentMessages.push(formatted)
      }
    }

    return {
      contextSummary: null, // 无 summary 数据时无法生成摘要
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
   * 将未选中 dialogue 的 summary 拼接为 L3 上下文摘要
   */
  private buildContextSummary(unselectedDialogues: ScoredDialogue[]): string | null {
    if (unselectedDialogues.length === 0) return null

    const summaries = unselectedDialogues
      .filter((sd) => sd.dialogue.summary?.text)
      .map((sd) => sd.dialogue.summary!.text)

    if (summaries.length === 0) return null

    return `## 历史对话摘要（${summaries.length} 轮）\n\n${summaries.join('\n\n')}`
  }
}

export default new ContextBuilder()
