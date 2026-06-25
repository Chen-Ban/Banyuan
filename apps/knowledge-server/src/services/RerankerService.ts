/**
 * RerankerService — Cross-Encoder 精排服务
 *
 * 使用 @huggingface/transformers 加载 Xenova/ms-marco-MiniLM-L-6-v2（ONNX）做
 * Cross-Encoder 文本对打分，对粗排（RRF 融合）结果进行二次精排。
 *
 * Cross-Encoder 与 Bi-Encoder 的区别：
 *   - Bi-Encoder（EmbeddingService）分别编码 query 和 document，速度快但精度有限
 *   - Cross-Encoder 同时编码 (query, document) 对，精度更高但速度较慢
 *
 * 因此 Cross-Encoder 适合在粗排后对 top-N（如 20）候选结果做精排，
 * 输出最终 top-K（如 5）的高置信度结果。
 *
 * 模型选择：
 *   - Xenova/ms-marco-MiniLM-L-6-v2 — 轻量（22M 参数），NDCG@10=74.30
 *   - 已有 ONNX 量化版本可用，在 Node.js CPU 上推理延迟 <100ms/pair
 *
 * 设计为单例模式，与 EmbeddingService 类似，复用同一个 pipeline 实例。
 */

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** 待精排的候选项 */
export interface RerankCandidate {
  /** 候选文本内容 */
  content: string
  /** 附带信息，精排后原样返回 */
  [key: string]: unknown
}

/** 精排结果 */
export interface RerankResult<T extends RerankCandidate = RerankCandidate> {
  /** 原始候选项 */
  item: T
  /** Cross-Encoder 给出的相关性分数（sigmoid 归一化后 0~1） */
  score: number
  /** 精排后的排名（0-based） */
  rank: number
}

/** 配置 */
export interface RerankerServiceConfig {
  /**
   * Cross-Encoder 模型 HuggingFace Hub ID
   * 默认：Xenova/ms-marco-MiniLM-L-6-v2
   */
  modelId?: string
  /**
   * 精排时最多处理的候选对数量（防止候选过多时延迟飙升）
   * 默认：20
   */
  maxCandidates?: number
}

// ─── 内部类型（transformers.js pipeline 抽象）──────────────────────────────────

interface ClassificationOutput {
  label: string
  score: number
}

type ClassificationPipeline = (
  inputs: { text: string; text_pair: string } | Array<{ text: string; text_pair: string }>,
  options?: { topk?: number },
) => Promise<ClassificationOutput | ClassificationOutput[]>

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2'
const DEFAULT_MAX_CANDIDATES = 20

// ─── RerankerService ──────────────────────────────────────────────────────────

export class RerankerService {
  private static instance: RerankerService | null = null

  private readonly modelId: string
  private readonly maxCandidates: number
  private pipeline: ClassificationPipeline | null = null
  private pipelineInitPromise: Promise<void> | null = null

  constructor(config: RerankerServiceConfig = {}) {
    this.modelId = config.modelId ?? DEFAULT_MODEL_ID
    this.maxCandidates = config.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  }

  /**
   * 获取全局单例。
   */
  static getInstance(config?: RerankerServiceConfig): RerankerService {
    if (!RerankerService.instance) {
      RerankerService.instance = new RerankerService(config)
    }
    return RerankerService.instance
  }

  // ── 公共 API ────────────────────────────────────────────────────────────────

  /**
   * 对候选结果进行 Cross-Encoder 精排。
   *
   * @param query — 用户查询文本
   * @param candidates — 粗排候选列表（按粗排分数降序）
   * @param topK — 精排后返回的最终数量（默认等于 candidates 长度）
   * @returns 精排后的结果列表（按 Cross-Encoder 分数降序）
   */
  async rerank<T extends RerankCandidate>(
    query: string,
    candidates: T[],
    topK?: number,
  ): Promise<RerankResult<T>[]> {
    if (candidates.length === 0) return []

    // 截断：只对前 maxCandidates 个候选做精排
    const toRerank = candidates.slice(0, this.maxCandidates)
    const finalTopK = topK ?? toRerank.length

    await this.ensurePipeline()

    // 构造 (query, candidate.content) 文本对
    const pairs = toRerank.map((c) => ({
      text: query,
      text_pair: c.content,
    }))

    // 批量推理
    const scores = await this.batchScore(pairs)

    // 组装结果，按分数降序
    const results: RerankResult<T>[] = toRerank
      .map((item, idx) => ({
        item,
        score: scores[idx],
        rank: 0, // 待填
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, finalTopK)

    // 填充 rank
    results.forEach((r, i) => {
      r.rank = i
    })

    return results
  }

  /**
   * 对单个 (query, document) 对打分。
   * 返回 0~1 之间的相关性分数。
   */
  async score(query: string, document: string): Promise<number> {
    await this.ensurePipeline()
    const raw = await this.pipeline!({ text: query, text_pair: document }, { topk: 1 })
    return this.extractScore(raw)
  }

  // ── 内部实现 ────────────────────────────────────────────────────────────────

  private async ensurePipeline(): Promise<void> {
    if (this.pipeline) return
    if (this.pipelineInitPromise) return this.pipelineInitPromise
    this.pipelineInitPromise = this.loadPipeline()
    return this.pipelineInitPromise
  }

  private async loadPipeline(): Promise<void> {
    const { pipeline } = await import('@huggingface/transformers')
    const classifier = await pipeline('text-classification', this.modelId, {
      dtype: 'fp32',
    })
    this.pipeline = classifier as unknown as ClassificationPipeline
    console.log(`[RerankerService] Cross-Encoder 模型已加载: ${this.modelId}`)
  }

  /**
   * 批量推理 — 逐对打分（transformers.js text-classification 不保证
   * 批量输入的稳定性，因此逐对调用更可靠）。
   *
   * 对于 20 个候选，每对 <50ms，总计 <1s 可以接受。
   */
  private async batchScore(pairs: Array<{ text: string; text_pair: string }>): Promise<number[]> {
    const scores: number[] = []
    for (const pair of pairs) {
      const raw = await this.pipeline!(pair, { topk: 1 })
      scores.push(this.extractScore(raw))
    }
    return scores
  }

  /**
   * 从 pipeline 输出中提取分数。
   * ms-marco 系列 Cross-Encoder 输出的是 logit，需要 sigmoid 归一化到 0~1。
   */
  private extractScore(output: ClassificationOutput | ClassificationOutput[]): number {
    const item = Array.isArray(output) ? output[0] : output
    // ms-marco-MiniLM 模型直接输出 score 即为 sigmoid 后的值（范围 0~1）
    // 但为安全起见做一次 clamp
    return Math.max(0, Math.min(1, item.score))
  }
}

export default RerankerService.getInstance()
