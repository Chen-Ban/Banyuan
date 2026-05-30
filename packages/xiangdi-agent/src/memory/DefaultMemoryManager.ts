/**
 * 相地 · 默认记忆管理器（DefaultMemoryManager）
 *
 * @deprecated 请使用 {@link NamespacedMemoryManager}（ADR-033）。
 * DefaultMemoryManager 作为 MasterGraph execute 阶段的兼容层保留，
 * 新代码应使用 `createMemoryManager(namespace, storagePath)` 创建命名空间实例。
 *
 * 统一管理中期记忆和长期记忆的生命周期：
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │                 DefaultMemoryManager                 │
 *   │                                                      │
 *   │  任务开始 → loadForTask()                            │
 *   │    ├── EpisodicMemory.recall() → 相关历史经验        │
 *   │    └── SemanticMemory.recall() → 相关稳定知识        │
 *   │    → 格式化为 system prompt 片段                     │
 *   │                                                      │
 *   │  任务结束 → saveAfterTask()                          │
 *   │    ├── EpisodicMemory.record() → 存储本次经验        │
 *   │    └── SemanticMemory.store() → 提炼新事实           │
 *   │                                                      │
 *   │  定期维护 → maintain()                               │
 *   │    ├── EpisodicMemory.consolidate() → 压缩旧经验     │
 *   │    └── SemanticMemory.maintain() → 衰减旧事实        │
 *   └──────────────────────────────────────────────────────┘
 *
 * 使用示例：
 * ```ts
 * const manager = new DefaultMemoryManager({
 *   storagePath: ".xiangdi/memory",
 * });
 *
 * // 任务开始时加载记忆
 * const memoryPrompt = await manager.loadForTask("修改首页商品卡片的圆角样式");
 * // → "## 相关经验\n上次修改 ProductCard 时影响了 3 个页面...\n## 已知事实\n该项目使用 8px 网格..."
 *
 * // 任务结束时保存
 * await manager.saveAfterTask({
 *   title: "修改 ProductCard 圆角",
 *   content: "将 cornerRadius 改为 16px，更新了 HomePage/SearchPage/CartPage",
 *   outcome: "success",
 *   importance: 0.7,
 *   lessons: ["共享组件修改要全量检查引用"],
 * });
 * ```
 */

import type {
  MemoryManager,
  EpisodicMemory,
  SemanticMemory,
  Episode,
  Fact,
} from "./types.js";
import { LocalEpisodicMemory } from "./LocalEpisodicMemory.js";
import { LocalSemanticMemory } from "./LocalSemanticMemory.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface DefaultMemoryManagerConfig {
  /** 存储根目录 */
  storagePath?: string;
  /** 自定义 EpisodicMemory 实现（可选） */
  episodicMemory?: EpisodicMemory;
  /** 自定义 SemanticMemory 实现（可选） */
  semanticMemory?: SemanticMemory;
  /** loadForTask 时检索的最大经验数，默认 3 */
  maxEpisodesToLoad?: number;
  /** loadForTask 时检索的最大事实数，默认 5 */
  maxFactsToLoad?: number;
}

// ─── DefaultMemoryManager ─────────────────────────────────────────────────────

export class DefaultMemoryManager implements MemoryManager {
  readonly episodic: EpisodicMemory;
  readonly semantic: SemanticMemory;

  private readonly maxEpisodesToLoad: number;
  private readonly maxFactsToLoad: number;

  constructor(config: DefaultMemoryManagerConfig = {}) {
    const storagePath = config.storagePath ?? ".xiangdi/memory";

    this.episodic =
      config.episodicMemory ??
      new LocalEpisodicMemory({ storagePath });

    this.semantic =
      config.semanticMemory ??
      new LocalSemanticMemory({ storagePath });

    this.maxEpisodesToLoad = config.maxEpisodesToLoad ?? 3;
    this.maxFactsToLoad = config.maxFactsToLoad ?? 5;
  }

  async loadForTask(taskDescription: string): Promise<string | null> {
    // 并行检索经验和事实
    const [episodes, facts] = await Promise.all([
      this.episodic.recall(taskDescription, {
        topK: this.maxEpisodesToLoad,
        outcomeFilter: ["success", "failure"], // 成功和失败的经验都有价值
      }),
      this.semantic.recall(taskDescription, {
        topK: this.maxFactsToLoad,
        minConfidence: 0.4,
      }),
    ]);

    if (episodes.length === 0 && facts.length === 0) {
      return null;
    }

    return formatMemoryPrompt(episodes, facts);
  }

  async saveAfterTask(
    input: Omit<Episode, "id" | "createdAt" | "lastAccessedAt">,
    extractFacts = true
  ): Promise<void> {
    // 1. 记录经验
    const episode = await this.episodic.record(input);

    // 2. 尝试从经验中提炼事实
    if (extractFacts && input.lessons && input.lessons.length > 0) {
      await this.extractAndStoreFacts(episode);
    }
  }

  async maintain(): Promise<void> {
    await Promise.all([
      this.episodic.consolidate(),
      (this.semantic as LocalSemanticMemory).maintain?.(),
    ].filter(Boolean));
  }

  // ── 事实提取 ──────────────────────────────────────────────────────────────

  /**
   * 从经验中提炼事实
   *
   * 简单实现：将 lessons 直接作为事实存储。
   * 进阶实现（TODO）：用 LLM 从 content 中提取结构化事实。
   */
  private async extractAndStoreFacts(episode: Episode): Promise<void> {
    if (!episode.lessons || episode.lessons.length === 0) return;

    for (const lesson of episode.lessons) {
      const category = inferFactCategory(lesson);
      await this.semantic.store({
        category,
        content: lesson,
        confidence: episode.outcome === "success" ? 0.6 : 0.4,
        derivedFrom: [episode.id],
      });
    }
  }
}

// ─── 格式化记忆为 Prompt ──────────────────────────────────────────────────────

function formatMemoryPrompt(episodes: Episode[], facts: Fact[]): string {
  const lines: string[] = [];

  lines.push("# Agent 记忆");
  lines.push("");
  lines.push("以下是与当前任务相关的历史经验和已知事实，供参考。");

  if (episodes.length > 0) {
    lines.push("");
    lines.push("## 相关历史经验");

    for (const ep of episodes) {
      lines.push("");
      const outcomeIcon =
        ep.outcome === "success" ? "✓" :
        ep.outcome === "failure" ? "✗" :
        "○";
      lines.push(`### ${outcomeIcon} ${ep.title}`);
      lines.push(ep.content);

      if (ep.lessons && ep.lessons.length > 0) {
        lines.push("");
        lines.push("教训：" + ep.lessons.join("；"));
      }
    }
  }

  if (facts.length > 0) {
    lines.push("");
    lines.push("## 已知事实");
    lines.push("");

    for (const fact of facts) {
      const confidence = `[置信度: ${(fact.confidence * 100).toFixed(0)}%]`;
      lines.push(`- ${fact.content} ${confidence}`);
    }
  }

  return lines.join("\n");
}

// ─── 事实类别推断 ─────────────────────────────────────────────────────────────

function inferFactCategory(lesson: string): Fact["category"] {
  const lower = lesson.toLowerCase();

  if (
    lower.includes("用户") ||
    lower.includes("偏好") ||
    lower.includes("喜欢") ||
    lower.includes("prefer")
  ) {
    return "user_preference";
  }

  if (
    lower.includes("命名") ||
    lower.includes("格式") ||
    lower.includes("convention") ||
    lower.includes("camel") ||
    lower.includes("pascal")
  ) {
    return "coding_convention";
  }

  if (
    lower.includes("不能") ||
    lower.includes("不要") ||
    lower.includes("报错") ||
    lower.includes("error") ||
    lower.includes("bug")
  ) {
    return "error_pattern";
  }

  if (
    lower.includes("先") ||
    lower.includes("再") ||
    lower.includes("工具") ||
    lower.includes("tool") ||
    lower.includes("步骤")
  ) {
    return "tool_usage";
  }

  if (
    lower.includes("布局") ||
    lower.includes("样式") ||
    lower.includes("设计") ||
    lower.includes("pattern") ||
    lower.includes("组件")
  ) {
    return "design_pattern";
  }

  return "project_knowledge";
}
