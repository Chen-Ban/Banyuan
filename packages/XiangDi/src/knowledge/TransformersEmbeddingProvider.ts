/**
 * 相地 · Transformers Embedding Provider
 *
 * 基于 @huggingface/transformers 的本地 ONNX 推理 Embedding 实现。
 *
 * 模型选型：multilingual-e5-small（Xenova/multilingual-e5-small）
 *   - 维度：384
 *   - 支持语言：中文、英文及 100+ 语言
 *   - 模型大小：~470MB（首次使用时自动下载并缓存）
 *   - 推理速度：CPU 单条 ~50ms，批量更快
 *
 * E5 模型的 prompt 格式：
 *   - 查询文本：前缀 "query: "
 *   - 文档文本：前缀 "passage: "
 *   这是 E5 系列模型的标准用法，能显著提升检索质量。
 *
 * 使用示例：
 * ```ts
 * const provider = new TransformersEmbeddingProvider();
 * await provider.init(); // 可选，首次 embed 时会自动初始化
 *
 * const vec = await provider.embed("Button 组件怎么用");
 * // → number[] (384 维)
 *
 * const vecs = await provider.embedBatch(["文档1", "文档2"]);
 * // → number[][] (批量，更高效)
 * ```
 */

import type { EmbeddingProvider } from "./types.js";

// ─── 类型声明（避免直接 import 导致 ESM 问题）────────────────────────────────

type Pipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] } | Array<{ data: Float32Array | number[] }>>;

// ─── 常量 ──────────────────────────────────────────────────────────────────────

/** E5 模型 HuggingFace Hub ID */
const MODEL_ID = "Xenova/multilingual-e5-small";

/** 向量维度（multilingual-e5-small 固定 384 维） */
const EMBEDDING_DIMENSIONS = 384;

/** E5 查询前缀 */
const QUERY_PREFIX = "query: ";

/** E5 文档前缀 */
const PASSAGE_PREFIX = "passage: ";

// ─── TransformersEmbeddingProvider ───────────────────────────────────────────

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private pipeline: Pipeline | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 预热：提前加载模型（可选）
   * 若不调用，首次 embed 时会自动触发
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.loadPipeline();
    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureInitialized();
    return this.runInference([QUERY_PREFIX + text]).then((vecs) => vecs[0]);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureInitialized();
    // 文档批量 embed 使用 passage 前缀
    const prefixed = texts.map((t) => PASSAGE_PREFIX + t);
    return this.runInference(prefixed);
  }

  /**
   * 专用于文档写入时的 embedding（使用 passage 前缀）
   * 与 embed()（query 前缀）配对使用，能提升 E5 检索质量
   */
  async embedPassage(text: string): Promise<number[]> {
    await this.ensureInitialized();
    return this.runInference([PASSAGE_PREFIX + text]).then((vecs) => vecs[0]);
  }

  // ── 内部实现 ──────────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (!this.pipeline) {
      await this.init();
    }
  }

  private async loadPipeline(): Promise<void> {
    // 动态 import 避免在不支持 ONNX 的环境中报错
    const { pipeline } = await import("@huggingface/transformers");
    this.pipeline = (await pipeline("feature-extraction", MODEL_ID, {
      // 优先使用 WASM 后端（Node.js 环境），无需 GPU
      dtype: "fp32",
    })) as unknown as Pipeline;
  }

  private async runInference(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      throw new Error("TransformersEmbeddingProvider: pipeline not initialized");
    }

    const output = await this.pipeline(texts, {
      pooling: "mean",
      normalize: true,
    });

    // 处理单条和批量两种返回格式
    if (Array.isArray(output)) {
      return output.map((item) => Array.from(item.data as Float32Array));
    }

    // 单条返回时，output.data 是 Float32Array
    const data = output.data as Float32Array;

    if (texts.length === 1) {
      return [Array.from(data)];
    }

    // 批量时 data 是展平的，需要按维度切分
    const result: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * EMBEDDING_DIMENSIONS;
      result.push(Array.from(data.slice(start, start + EMBEDDING_DIMENSIONS)));
    }
    return result;
  }
}
