/**
 * 相地 · 本地长期记忆（LocalSemanticMemory）
 *
 * 基于 JSON 文件持久化的 SemanticMemory 实现。
 * 存储 Agent 从执行经验中提炼出的稳定知识和偏好。
 *
 * 特性：
 *   - 去重：相似事实自动合并，增加置信度
 *   - 强化/弱化：通过引用验证动态调整事实的可信度
 *   - 遗忘：长期未被引用的低置信度事实自动衰减
 *
 * 存储路径：<projectRoot>/.xiangdi/memory/facts.json
 *
 * 使用示例：
 * ```ts
 * const memory = new LocalSemanticMemory({ storagePath: ".xiangdi/memory" });
 *
 * await memory.store({
 *   category: "design_pattern",
 *   content: "该项目所有按钮使用 16px 圆角",
 *   confidence: 0.8,
 * });
 *
 * const facts = await memory.recall("按钮样式");
 * ```
 */

import type {
  Fact,
  FactCategory,
  SemanticMemory,
  SemanticRecallOptions,
  MemoryNamespace,
} from "./types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LocalSemanticMemoryConfig {
  /** 存储目录路径 */
  storagePath?: string;
  /** 命名空间（可选），设置后文件存储在 {storagePath}/{namespace}/facts.json */
  namespace?: MemoryNamespace;
  /** 最大事实条目数，默认 500 */
  maxFacts?: number;
  /** 置信度衰减率（每次 maintain 时未被引用的事实衰减多少），默认 0.05 */
  decayRate?: number;
}

// ─── LocalSemanticMemory ──────────────────────────────────────────────────────

export class LocalSemanticMemory implements SemanticMemory {
  private facts: Map<string, Fact> = new Map();
  private readonly storagePath: string | null;
  private readonly namespace: MemoryNamespace | undefined;
  private readonly maxFacts: number;
  private readonly decayRate: number;
  private loaded = false;

  constructor(config: LocalSemanticMemoryConfig = {}) {
    this.storagePath = config.storagePath ?? null;
    this.namespace = config.namespace;
    this.maxFacts = config.maxFacts ?? 500;
    this.decayRate = config.decayRate ?? 0.05;
  }

  async store(
    input: Omit<Fact, "id" | "createdAt" | "updatedAt" | "referenceCount">
  ): Promise<Fact> {
    await this.ensureLoaded();

    // 查找是否有相似的已有事实
    const similar = this.findSimilarFact(input.content, input.category);

    if (similar) {
      // 合并：增加置信度和引用计数
      similar.confidence = Math.min(
        1,
        similar.confidence + input.confidence * 0.2
      );
      similar.referenceCount++;
      similar.updatedAt = Date.now();
      if (input.derivedFrom) {
        similar.derivedFrom = [
          ...(similar.derivedFrom ?? []),
          ...input.derivedFrom,
        ].slice(-10);
      }
      await this.persist();
      return similar;
    }

    // 新建事实
    const now = Date.now();
    const fact: Fact = {
      ...input,
      id: `fact-${now}-${Math.random().toString(36).slice(2, 8)}`,
      namespace: this.namespace ?? input.namespace,
      referenceCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.facts.set(fact.id, fact);

    // 超出容量时清理低价值事实
    if (this.facts.size > this.maxFacts) {
      this.evictLowValueFacts();
    }

    await this.persist();
    return fact;
  }

  async recall(query: string, options?: SemanticRecallOptions): Promise<Fact[]> {
    await this.ensureLoaded();

    const topK = options?.topK ?? 10;
    const minConfidence = options?.minConfidence ?? 0.3;
    const categories = options?.categories;
    const includeShared = options?.includeShared ?? true;

    // 合并 shared 命名空间的事实
    let allFacts = [...this.facts.values()];
    if (includeShared && this.namespace && this.namespace !== "shared" && this.storagePath) {
      const sharedFacts = await this.loadSharedFacts();
      allFacts = [...allFacts, ...sharedFacts];
    }

    const queryTokens = tokenize(query);
    const scored: Array<{ fact: Fact; score: number }> = [];

    for (const fact of allFacts) {
      // 置信度过滤
      if (fact.confidence < minConfidence) continue;

      // 类别过滤
      if (categories && !categories.includes(fact.category)) continue;

      // 相关性打分
      const relevance = computeRelevance(queryTokens, fact.content);
      // 综合分数 = 相关性 × 置信度 × 引用加成
      const refBonus = Math.min(fact.referenceCount / 10, 0.3);
      const score = relevance * 0.6 + fact.confidence * 0.3 + refBonus * 0.1;

      if (score > 0.1) {
        scored.push({ fact, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.fact);
  }

  async reinforce(factId: string): Promise<void> {
    await this.ensureLoaded();
    const fact = this.facts.get(factId);
    if (!fact) return;

    fact.referenceCount++;
    fact.confidence = Math.min(1, fact.confidence + 0.05);
    fact.updatedAt = Date.now();
    await this.persist();
  }

  async weaken(factId: string): Promise<void> {
    await this.ensureLoaded();
    const fact = this.facts.get(factId);
    if (!fact) return;

    fact.confidence = Math.max(0, fact.confidence - 0.1);
    fact.updatedAt = Date.now();

    // 置信度归零则删除
    if (fact.confidence <= 0) {
      this.facts.delete(factId);
    }

    await this.persist();
  }

  async getByCategory(category: FactCategory): Promise<Fact[]> {
    await this.ensureLoaded();
    return [...this.facts.values()]
      .filter((f) => f.category === category)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.facts.size;
  }

  /**
   * 维护：衰减未被引用的事实，清理过期条目
   */
  async maintain(): Promise<void> {
    await this.ensureLoaded();

    for (const [id, fact] of this.facts) {
      // 长期未更新的事实衰减
      const daysSinceUpdate =
        (Date.now() - fact.updatedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 30 && fact.referenceCount < 3) {
        fact.confidence -= this.decayRate;
        if (fact.confidence <= 0) {
          this.facts.delete(id);
        }
      }
    }

    await this.persist();
  }

  // ── 内部方法 ──────────────────────────────────────────────────────────────

  private findSimilarFact(content: string, category: FactCategory): Fact | null {
    const tokens = tokenize(content);
    if (tokens.length === 0) return null;

    for (const fact of this.facts.values()) {
      if (fact.category !== category) continue;

      const similarity = computeRelevance(tokens, fact.content);
      if (similarity > 0.7) {
        return fact;
      }
    }

    return null;
  }

  private evictLowValueFacts(): void {
    // 按 score = confidence × log(referenceCount + 1) 排序，移除最低的
    const scored = [...this.facts.entries()].map(([id, fact]) => ({
      id,
      value: fact.confidence * Math.log2(fact.referenceCount + 1 + 1),
    }));

    scored.sort((a, b) => a.value - b.value);

    // 移除 20% 的低价值条目
    const removeCount = Math.ceil(this.facts.size * 0.2);
    for (let i = 0; i < removeCount; i++) {
      this.facts.delete(scored[i].id);
    }
  }

  // ── 持久化 ────────────────────────────────────────────────────────────────

  /** 获取当前命名空间的存储目录 */
  private getStorageDir(): string {
    if (!this.storagePath) return "";
    return this.namespace
      ? `${this.storagePath}/${this.namespace}`
      : this.storagePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded || !this.storagePath) {
      this.loaded = true;
      return;
    }

    try {
      const { readFile } = await import("node:fs/promises");
      const filePath = `${this.getStorageDir()}/facts.json`;
      const content = await readFile(filePath, "utf-8");
      const arr = JSON.parse(content) as Fact[];
      this.facts = new Map(arr.map((f) => [f.id, f]));
    } catch {
      this.facts = new Map();
    }

    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (!this.storagePath) return;

    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const dir = this.getStorageDir();
      await mkdir(dir, { recursive: true });
      const filePath = `${dir}/facts.json`;
      const arr = [...this.facts.values()];
      await writeFile(filePath, JSON.stringify(arr, null, 2), "utf-8");
    } catch {
      // 持久化失败不影响主流程
    }
  }

  /** 加载 shared 命名空间的事实（用于合并检索） */
  private async loadSharedFacts(): Promise<Fact[]> {
    if (!this.storagePath) return [];
    try {
      const { readFile } = await import("node:fs/promises");
      const filePath = `${this.storagePath}/shared/facts.json`;
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as Fact[];
    } catch {
      return [];
    }
  }
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const chinese = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  tokens.push(...chinese);
  const words = text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [];
  tokens.push(...words.filter((w) => w.length >= 2));
  return tokens;
}

function computeRelevance(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0;

  const textTokens = tokenize(text);
  const textSet = new Set(textTokens);

  let matchCount = 0;
  for (const token of queryTokens) {
    if (textSet.has(token)) matchCount++;
    else if (textTokens.some((t) => t.includes(token) || token.includes(t))) {
      matchCount += 0.5;
    }
  }

  return Math.min(matchCount / queryTokens.length, 1);
}
