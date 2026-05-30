/**
 * 相地 · 共享记忆写入器
 *
 * 只有 PlanningOrchestrator 有权写入 shared 命名空间。
 * 所有 Subagent 可以读取 shared，但只能写自己的命名空间。
 */

import type { Episode, Fact, MemoryNamespace } from "./types.js";
import { LocalEpisodicMemory } from "./LocalEpisodicMemory.js";
import { LocalSemanticMemory } from "./LocalSemanticMemory.js";

export interface SharedMemoryWriterConfig {
  storagePath: string;
}

export class SharedMemoryWriter {
  private episodic: LocalEpisodicMemory;
  private semantic: LocalSemanticMemory;

  constructor(config: SharedMemoryWriterConfig) {
    const namespace: MemoryNamespace = "shared";
    this.episodic = new LocalEpisodicMemory({ storagePath: config.storagePath, namespace });
    this.semantic = new LocalSemanticMemory({ storagePath: config.storagePath, namespace });
  }

  async writeConstraint(content: string, confidence = 0.8): Promise<Fact> {
    return this.semantic.store({ category: "project_constraint", content, confidence });
  }

  async writeProjectFact(content: string, confidence = 0.7): Promise<Fact> {
    return this.semantic.store({ category: "project_knowledge", content, confidence });
  }

  async writeEpisode(
    episode: Omit<Episode, "id" | "namespace" | "createdAt" | "lastAccessedAt">
  ): Promise<Episode> {
    return this.episodic.record(episode);
  }
}
