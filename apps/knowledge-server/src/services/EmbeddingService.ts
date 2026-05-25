/**
 * EmbeddingService — 文本向量化服务
 *
 * 使用 @huggingface/transformers 做本地 ONNX 推理（无需远程 API）。
 * 模型：Xenova/multilingual-e5-small（384 维，支持中英文）
 *
 * 遵循 E5 模型规范：
 *   - 查询文本加 "query: " 前缀
 *   - 文档/段落文本加 "passage: " 前缀
 *
 * 职责：
 *   - 为 KnowledgeService 提供知识库写入/检索的向量化
 *   - 为外部调用方（banyan 后端 ContextBuilder）提供 embed API
 *
 * 设计为单例模式，跨模块复用同一个 ONNX 推理 pipeline。
 */

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface EmbeddingServiceConfig {
  /**
   * Embedding 模型 HuggingFace Hub ID
   * 默认：Xenova/multilingual-e5-small
   */
  modelId?: string
}

// ─── 内部类型 ──────────────────────────────────────────────────────────────────

type EmbedPipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] } | Array<{ data: Float32Array | number[] }>>

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = 'Xenova/multilingual-e5-small'

/** 模型输出维度（384 维） */
export const EMBEDDING_DIMENSIONS = 384

const QUERY_PREFIX = 'query: '
const PASSAGE_PREFIX = 'passage: '

// ─── EmbeddingService ──────────────────────────────────────────────────────────

export class EmbeddingService {
  private static instance: EmbeddingService | null = null

  private readonly modelId: string
  private pipeline: EmbedPipeline | null = null
  private pipelineInitPromise: Promise<void> | null = null

  constructor(config: EmbeddingServiceConfig = {}) {
    this.modelId = config.modelId ?? DEFAULT_MODEL_ID
  }

  /**
   * 获取全局单例。
   * 跨模块复用同一个 ONNX 推理 pipeline，避免重复加载模型。
   */
  static getInstance(config?: EmbeddingServiceConfig): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(config)
    }
    return EmbeddingService.instance
  }

  // ── 公共 API ────────────────────────────────────────────────────────────────

  /**
   * 为查询文本生成向量（加 "query: " 前缀）。
   * 用于检索场景中的 query embedding。
   */
  async embedQuery(text: string): Promise<number[]> {
    return this.embed(QUERY_PREFIX + text)
  }

  /**
   * 为文档/段落文本生成向量（加 "passage: " 前缀）。
   * 用于索引场景中的 document embedding。
   */
  async embedPassage(text: string): Promise<number[]> {
    return this.embed(PASSAGE_PREFIX + text)
  }

  /**
   * 批量为文档/段落文本生成向量。
   */
  async embedPassageBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    return this.embedBatch(texts.map((t) => PASSAGE_PREFIX + t))
  }

  /**
   * 批量为查询文本生成向量。
   */
  async embedQueryBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    return this.embedBatch(texts.map((t) => QUERY_PREFIX + t))
  }

  /**
   * 计算两个向量的余弦相似度。
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dotProduct / denom
  }

  // ── 内部实现 ────────────────────────────────────────────────────────────────

  private async embed(text: string): Promise<number[]> {
    await this.ensurePipeline()
    const vecs = await this.runInference([text])
    return vecs[0]
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    await this.ensurePipeline()
    return this.runInference(texts)
  }

  private async ensurePipeline(): Promise<void> {
    if (this.pipeline) return
    if (this.pipelineInitPromise) return this.pipelineInitPromise
    this.pipelineInitPromise = this.loadPipeline()
    return this.pipelineInitPromise
  }

  private async loadPipeline(): Promise<void> {
    const { pipeline } = await import('@huggingface/transformers')
    this.pipeline = (await pipeline('feature-extraction', this.modelId, {
      dtype: 'fp32',
    })) as unknown as EmbedPipeline
  }

  private async runInference(texts: string[]): Promise<number[][]> {
    const output = await this.pipeline!(texts, { pooling: 'mean', normalize: true })

    if (Array.isArray(output)) {
      return output.map((item) => Array.from(item.data as Float32Array))
    }

    const data = output.data as Float32Array
    if (texts.length === 1) {
      return [Array.from(data)]
    }

    const result: number[][] = []
    for (let i = 0; i < texts.length; i++) {
      const start = i * EMBEDDING_DIMENSIONS
      result.push(Array.from(data.slice(start, start + EMBEDDING_DIMENSIONS)))
    }
    return result
  }
}

export default EmbeddingService.getInstance()
