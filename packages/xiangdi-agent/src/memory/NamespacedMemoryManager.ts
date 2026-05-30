/**
 * 相地 · 命名空间记忆管理器
 *
 * 每个 Subagent 持有一个绑定到自己命名空间的实例。
 * 读取时自动合并 shared 命名空间的内容。
 */

import type { Episode, EpisodicMemory, Fact, MemoryNamespace, SemanticMemory } from "./types.js";
import { LocalEpisodicMemory } from "./LocalEpisodicMemory.js";
import { LocalSemanticMemory } from "./LocalSemanticMemory.js";

export interface NamespacedMemoryManagerConfig {
  namespace: MemoryNamespace;
  storagePath: string;
  maxEpisodes?: number;
}

export class NamespacedMemoryManager {
  readonly namespace: MemoryNamespace;
  readonly episodic: EpisodicMemory;
  readonly semantic: SemanticMemory;

  constructor(config: NamespacedMemoryManagerConfig) {
    this.namespace = config.namespace;
    this.episodic = new LocalEpisodicMemory({
      storagePath: config.storagePath,
      namespace: config.namespace,
      maxEpisodes: config.maxEpisodes,
    });
    this.semantic = new LocalSemanticMemory({
      storagePath: config.storagePath,
      namespace: config.namespace,
    });
  }

  async loadForTask(taskDescription: string): Promise<string | null> {
    const [episodes, facts] = await Promise.all([
      this.episodic.recall(taskDescription, { topK: 3, includeShared: true }),
      this.semantic.recall(taskDescription, { topK: 5, includeShared: true }),
    ]);

    if (episodes.length === 0 && facts.length === 0) return null;

    let prompt = "";
    if (episodes.length > 0) {
      prompt += "## 相关经验\n\n";
      for (const ep of episodes) {
        prompt += `### ${ep.title}\n${ep.content}\n结果：${ep.outcome}\n`;
        if (ep.lessons?.length) prompt += `教训：${ep.lessons.join("；")}\n`;
        prompt += "\n";
      }
    }
    if (facts.length > 0) {
      prompt += "## 已知事实\n\n";
      for (const fact of facts) {
        prompt += `- [${fact.category}] ${fact.content}（置信度 ${fact.confidence}）\n`;
      }
    }
    return prompt;
  }

  async saveAfterTask(
    episode: Omit<Episode, "id" | "namespace" | "createdAt" | "lastAccessedAt">,
    _extractFacts?: boolean,
  ): Promise<void> {
    await this.episodic.record(episode);
    if (episode.lessons) {
      for (const lesson of episode.lessons) {
        await this.semantic.store({
          category: "project_knowledge",
          content: lesson,
          confidence: 0.6,
        });
      }
    }
  }

  async maintain(): Promise<void> {
    await this.episodic.consolidate();
    await (this.semantic as LocalSemanticMemory).maintain();
  }
}

/** 创建命名空间记忆管理器的工厂函数 */
export function createMemoryManager(
  namespace: MemoryNamespace,
  storagePath: string,
): NamespacedMemoryManager {
  return new NamespacedMemoryManager({ namespace, storagePath });
}
