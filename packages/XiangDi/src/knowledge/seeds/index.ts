/**
 * 相地 · 知识种子加载工具
 *
 * 提供从 seeds 目录加载知识种子数据并写入 KnowledgeStore 的工具函数。
 *
 * 三层种子目录：
 *   - schema/      — 节点类型与属性定义（自动生成）
 *   - composition/  — UI 组合模式示例（LLM 生成 + 人工 review）
 *   - theme/        — 设计主题与 token（人工维护）
 *
 * 当前为 P1 阶段的 placeholder 实现。
 * P2 阶段将在 apps/xiangdi/scripts/seed-knowledge.ts 中实现完整的种子写入逻辑。
 */

import type { KnowledgeEntry } from "../types.js";

/**
 * 知识种子的三层分类
 */
export type SeedCategory = "schema" | "composition" | "theme";

/**
 * 种子文件的标准格式
 */
export interface SeedFile {
  /** 条目唯一标识 */
  id: string;
  /** 知识内容 */
  content: string;
  /** 来源标识 */
  source: string;
  /** 元数据，必须包含 category 字段 */
  metadata: {
    category: SeedCategory;
    [key: string]: unknown;
  };
}

/**
 * 将种子文件转换为 KnowledgeEntry
 *
 * @param seed 种子文件内容
 * @returns 可直接写入 KnowledgeStore 的条目
 */
export function seedToEntry(seed: SeedFile): KnowledgeEntry {
  return {
    id: seed.id,
    content: seed.content,
    source: seed.source,
    metadata: seed.metadata,
  };
}

/**
 * 批量将种子文件转换为 KnowledgeEntry
 *
 * @param seeds 种子文件数组
 * @returns 可直接写入 KnowledgeStore 的条目数组
 */
export function seedsToEntries(seeds: SeedFile[]): KnowledgeEntry[] {
  return seeds.map(seedToEntry);
}
