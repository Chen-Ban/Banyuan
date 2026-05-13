/**
 * 相地 · 内存态 ChangeSpec 存储
 *
 * 最简单的 ChangeSpecStore 实现，将所有变更保存在内存中。
 * 适用于：
 *   - 单次会话场景（不需要持久化）
 *   - 测试环境
 *   - 浏览器环境（无文件系统访问）
 *
 * 若需要持久化，可实现 FileChangeSpecStore（TODO）。
 */

import type { ChangeSpec, ChangeSpecStore } from "./types.js";

export class MemoryChangeSpecStore implements ChangeSpecStore {
  private readonly store = new Map<string, ChangeSpec>();
  private readonly archiveStore = new Map<string, ChangeSpec>();

  async save(spec: ChangeSpec): Promise<void> {
    this.store.set(spec.id, { ...spec });
  }

  async load(id: string): Promise<ChangeSpec | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<ChangeSpec[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }

  async archive(id: string): Promise<void> {
    const spec = this.store.get(id);
    if (!spec) return;
    this.archiveStore.set(id, { ...spec, status: "archived" });
    this.store.delete(id);
  }

  /** 获取已归档的变更（仅内存态可用） */
  getArchived(): ChangeSpec[] {
    return Array.from(this.archiveStore.values());
  }

  /** 清空所有数据（测试用） */
  clear(): void {
    this.store.clear();
    this.archiveStore.clear();
  }
}
