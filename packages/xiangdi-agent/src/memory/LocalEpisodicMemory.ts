/**
 * 相地 · 本地中期记忆（LocalEpisodicMemory）
 *
 * 基于 JSON 文件持久化的 EpisodicMemory 实现。
 * 将经验片段存储在本地文件中，支持跨会话保持。
 *
 * 检索策略：关键词匹配 + 时间衰减 + 重要性加权
 *
 * 存储路径：<projectRoot>/.xiangdi/memory/episodes.json
 *
 * 使用示例：
 * ```ts
 * const memory = new LocalEpisodicMemory({ storagePath: ".xiangdi/memory" });
 *
 * // 记录经验
 * await memory.record({
 *   title: "修改 ProductCard 圆角",
 *   content: "将 ProductCard 组件的 cornerRadius 从 8 改为 16，同时影响了 3 个页面",
 *   outcome: "success",
 *   lessons: ["修改共享组件时要检查所有引用页面"],
 *   involvedEntities: ["ProductCard", "HomePage", "SearchPage", "CartPage"],
 *   importance: 0.7,
 * });
 *
 * // 检索相关经验
 * const episodes = await memory.recall("修改组件样式", { topK: 3 });
 * ```
 */

import type {
  Episode,
  EpisodeOutcome,
  EpisodicMemory,
  EpisodicRecallOptions,
  ConsolidateOptions,
  MemoryNamespace,
} from "./types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LocalEpisodicMemoryConfig {
  /** 存储目录路径 */
  storagePath?: string;
  /** 命名空间（可选），设置后文件存储在 {storagePath}/{namespace}/episodes.json */
  namespace?: MemoryNamespace;
  /** 最大经验条目数（超出时触发 consolidate），默认 200 */
  maxEpisodes?: number;
  /** 时间衰减半衰期（天），默认 30 */
  decayHalfLifeDays?: number;
}

// ─── LocalEpisodicMemory ──────────────────────────────────────────────────────

export class LocalEpisodicMemory implements EpisodicMemory {
  private episodes: Episode[] = [];
  private readonly maxEpisodes: number;
  private readonly decayHalfLifeDays: number;
  private readonly storagePath: string | null;
  private readonly namespace: MemoryNamespace | undefined;
  private loaded = false;

  constructor(config: LocalEpisodicMemoryConfig = {}) {
    this.storagePath = config.storagePath ?? null;
    this.namespace = config.namespace;
    this.maxEpisodes = config.maxEpisodes ?? 200;
    this.decayHalfLifeDays = config.decayHalfLifeDays ?? 30;
  }

  async record(
    input: Omit<Episode, "id" | "createdAt" | "lastAccessedAt">
  ): Promise<Episode> {
    await this.ensureLoaded();

    const now = Date.now();
    const episode: Episode = {
      ...input,
      id: `ep-${now}-${Math.random().toString(36).slice(2, 8)}`,
      namespace: this.namespace ?? input.namespace,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.episodes.push(episode);

    // 自动触发压缩
    if (this.episodes.length > this.maxEpisodes) {
      await this.consolidate();
    }

    await this.persist();
    return episode;
  }

  async recall(query: string, options?: EpisodicRecallOptions): Promise<Episode[]> {
    await this.ensureLoaded();

    const topK = options?.topK ?? 5;
    const includeShared = options?.includeShared ?? true;
    const now = Date.now();

    // 合并 shared 命名空间的经验
    let candidates = [...this.episodes];
    if (includeShared && this.namespace && this.namespace !== "shared" && this.storagePath) {
      const sharedEpisodes = await this.loadSharedEpisodes();
      candidates = [...candidates, ...sharedEpisodes];
    }

    if (options?.outcomeFilter) {
      candidates = candidates.filter((e) =>
        options.outcomeFilter!.includes(e.outcome)
      );
    }

    if (options?.since) {
      candidates = candidates.filter((e) => e.createdAt >= options.since!);
    }

    if (options?.tags) {
      const tagSet = new Set(options.tags);
      candidates = candidates.filter((e) =>
        e.tags?.some((t) => tagSet.has(t))
      );
    }

    // 打分：关键词相关性 × 时间衰减 × 重要性
    const queryTokens = tokenize(query);
    const scored = candidates.map((episode) => {
      const relevance = computeRelevance(queryTokens, episode);
      const recency = computeTimeDecay(
        now - episode.lastAccessedAt,
        this.decayHalfLifeDays
      );
      const score = relevance * 0.5 + recency * 0.2 + episode.importance * 0.3;
      return { episode, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // 更新 lastAccessedAt
    const results = scored.slice(0, topK);
    for (const { episode } of results) {
      episode.lastAccessedAt = now;
    }

    if (results.length > 0) {
      await this.persist();
    }

    return results.map((r) => r.episode);
  }

  async consolidate(options?: ConsolidateOptions): Promise<void> {
    const keepRecent = options?.keepRecent ?? 50;
    const importanceThreshold = options?.importanceThreshold ?? 0.3;

    // 按时间排序
    this.episodes.sort((a, b) => b.createdAt - a.createdAt);

    // 保留最近 N 条
    const recent = this.episodes.slice(0, keepRecent);
    const old = this.episodes.slice(keepRecent);

    // 旧经验中保留重要的
    const important = old.filter((e) => e.importance >= importanceThreshold);

    // 低重要性的旧经验合并为摘要
    const lowImportance = old.filter((e) => e.importance < importanceThreshold);
    if (lowImportance.length > 0) {
      const summary = this.summarizeEpisodes(lowImportance);
      recent.push(summary);
    }

    this.episodes = [...recent, ...important];
    await this.persist();
  }

  async getRecent(count: number): Promise<Episode[]> {
    await this.ensureLoaded();
    return [...this.episodes]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, count);
  }

  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.episodes.length;
  }

  // ── 内部方法 ──────────────────────────────────────────────────────────────

  private summarizeEpisodes(episodes: Episode[]): Episode {
    const successCount = episodes.filter((e) => e.outcome === "success").length;
    const failureCount = episodes.filter((e) => e.outcome === "failure").length;

    const allLessons = episodes
      .flatMap((e) => e.lessons ?? [])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);

    const allEntities = episodes
      .flatMap((e) => e.involvedEntities ?? [])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 20);

    return {
      id: `ep-summary-${Date.now()}`,
      title: `历史经验摘要（${episodes.length} 条）`,
      content: [
        `合并了 ${episodes.length} 条历史经验：`,
        `成功 ${successCount} 次，失败 ${failureCount} 次，其他 ${episodes.length - successCount - failureCount} 次。`,
        allLessons.length > 0 ? `关键教训：${allLessons.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      outcome: "success" as EpisodeOutcome,
      lessons: allLessons,
      involvedEntities: allEntities,
      tags: ["summary"],
      importance: 0.5,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
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
      const filePath = `${this.getStorageDir()}/episodes.json`;
      const content = await readFile(filePath, "utf-8");
      this.episodes = JSON.parse(content) as Episode[];
    } catch {
      // 文件不存在或解析失败，使用空数组
      this.episodes = [];
    }

    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (!this.storagePath) return;

    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const dir = this.getStorageDir();
      await mkdir(dir, { recursive: true });
      const filePath = `${dir}/episodes.json`;
      await writeFile(filePath, JSON.stringify(this.episodes, null, 2), "utf-8");
    } catch {
      // 持久化失败不影响主流程
    }
  }

  /** 加载 shared 命名空间的经验（用于合并检索） */
  private async loadSharedEpisodes(): Promise<Episode[]> {
    if (!this.storagePath) return [];
    try {
      const { readFile } = await import("node:fs/promises");
      const filePath = `${this.storagePath}/shared/episodes.json`;
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as Episode[];
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

function computeRelevance(queryTokens: string[], episode: Episode): number {
  if (queryTokens.length === 0) return 0;

  const episodeText = [
    episode.title,
    episode.content,
    ...(episode.tags ?? []),
    ...(episode.involvedEntities ?? []),
    ...(episode.lessons ?? []),
  ].join(" ");

  const episodeTokens = tokenize(episodeText);
  const episodeSet = new Set(episodeTokens);

  let matchCount = 0;
  for (const token of queryTokens) {
    if (episodeSet.has(token)) matchCount++;
    // 模糊匹配：token 是某个 episodeToken 的子串
    else if (episodeTokens.some((et) => et.includes(token) || token.includes(et))) {
      matchCount += 0.5;
    }
  }

  return Math.min(matchCount / queryTokens.length, 1);
}

/**
 * 时间衰减：指数衰减，半衰期为 halfLifeDays 天
 */
function computeTimeDecay(elapsedMs: number, halfLifeDays: number): number {
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, elapsedDays / halfLifeDays);
}
