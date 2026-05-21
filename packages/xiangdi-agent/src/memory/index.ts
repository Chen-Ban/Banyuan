/**
 * 相地 · 记忆系统模块
 *
 * 为 Agent 提供跨任务的经验积累和知识沉淀能力。
 *
 * 记忆三层：
 *   - 短期（Working Memory）：ContextManager 管理（已有）
 *   - 中期（Episodic Memory）：跨任务的执行经验
 *   - 长期（Semantic Memory）：稳定的知识和偏好
 *
 * 集成方式：
 *   HarnessRunner.run() 开始时调用 MemoryManager.loadForTask()
 *   HarnessRunner.run() 结束时调用 MemoryManager.saveAfterTask()
 */

// ─── 类型 ──────────────────────────────────────────────────────────────────────
export type {
  // 中期记忆
  Episode,
  EpisodeOutcome,
  EpisodicMemory,
  EpisodicRecallOptions,
  ConsolidateOptions,
  // 长期记忆
  Fact,
  FactCategory,
  SemanticMemory,
  SemanticRecallOptions,
  // 记忆管理器
  MemoryManager,
} from "./types.js";

// ─── 实现 ──────────────────────────────────────────────────────────────────────
export { LocalEpisodicMemory } from "./LocalEpisodicMemory.js";
export type { LocalEpisodicMemoryConfig } from "./LocalEpisodicMemory.js";

export { LocalSemanticMemory } from "./LocalSemanticMemory.js";
export type { LocalSemanticMemoryConfig } from "./LocalSemanticMemory.js";

export { DefaultMemoryManager } from "./DefaultMemoryManager.js";
export type { DefaultMemoryManagerConfig } from "./DefaultMemoryManager.js";
