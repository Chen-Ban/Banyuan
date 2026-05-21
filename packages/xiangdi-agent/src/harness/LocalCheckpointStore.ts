/**
 * 相地 · LocalCheckpointStore
 *
 * 基于 JSON 文件的 CheckpointStore 实现。
 * 每个 checkpoint 存储为独立的 JSON 文件：
 *   <storagePath>/<runId>.json
 *
 * 适用场景：
 *   - 单机部署（apps/xiangdi 单进程）
 *   - 开发/测试环境
 *
 * 生产环境可替换为 RedisCheckpointStore / MongoCheckpointStore 等实现。
 *
 * 使用示例：
 * ```ts
 * const store = new LocalCheckpointStore({
 *   storagePath: path.join(os.homedir(), ".xiangdi", "checkpoints"),
 *   ttlMs: 30 * 60 * 1000, // 30 分钟超时
 * });
 * ```
 */

import type { CheckpointStore, HarnessCheckpoint } from "./checkpoint.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface LocalCheckpointStoreConfig {
  /**
   * 存储目录路径
   * 默认：~/.xiangdi/checkpoints
   */
  storagePath?: string;
  /**
   * Checkpoint 存活时间（ms）
   * 超过此时间未恢复的 checkpoint 视为过期
   * 默认：30 分钟
   */
  ttlMs?: number;
}

// ─── LocalCheckpointStore ─────────────────────────────────────────────────────

export class LocalCheckpointStore implements CheckpointStore {
  private readonly storagePath: string;
  private readonly ttlMs: number;

  constructor(config: LocalCheckpointStoreConfig = {}) {
    this.storagePath = config.storagePath ?? ".xiangdi/checkpoints";
    this.ttlMs = config.ttlMs ?? 30 * 60 * 1000; // 30 分钟
  }

  async save(checkpoint: HarnessCheckpoint): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(this.storagePath, { recursive: true });
    const filePath = this.filePath(checkpoint.runId);
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  async load(runId: string): Promise<HarnessCheckpoint | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(this.filePath(runId), "utf-8");
      const checkpoint = JSON.parse(content) as HarnessCheckpoint;

      // 过期检查
      if (Date.now() > checkpoint.expiresAt) {
        await this.markExpired(runId, checkpoint);
        return null;
      }

      // 已恢复或已中止的 checkpoint 不能再次恢复
      if (checkpoint.status !== "pending") {
        return null;
      }

      return checkpoint;
    } catch {
      return null;
    }
  }

  async markResumed(runId: string): Promise<void> {
    await this.updateStatus(runId, "resumed");
  }

  async markAborted(runId: string): Promise<void> {
    await this.updateStatus(runId, "aborted");
  }

  async cleanup(): Promise<void> {
    try {
      const { readdir, unlink } = await import("node:fs/promises");
      const files = await readdir(this.storagePath);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const { readFile } = await import("node:fs/promises");
          const content = await readFile(`${this.storagePath}/${file}`, "utf-8");
          const checkpoint = JSON.parse(content) as HarnessCheckpoint;

          // 删除已过期超过 1 小时的文件，或已完成/中止的文件
          const shouldDelete =
            (checkpoint.status === "expired" && now - checkpoint.expiresAt > 60 * 60 * 1000) ||
            checkpoint.status === "resumed" ||
            checkpoint.status === "aborted";

          if (shouldDelete) {
            await unlink(`${this.storagePath}/${file}`);
          }
        } catch {
          // 单个文件处理失败不影响整体清理
        }
      }
    } catch {
      // 目录不存在等情况静默忽略
    }
  }

  // ── 内部方法 ──────────────────────────────────────────────────────────────

  private filePath(runId: string): string {
    // 对 runId 做简单清洗，防止路径穿越
    const safeId = runId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
    return `${this.storagePath}/${safeId}.json`;
  }

  private async updateStatus(
    runId: string,
    status: HarnessCheckpoint["status"]
  ): Promise<void> {
    try {
      const { readFile, writeFile } = await import("node:fs/promises");
      const content = await readFile(this.filePath(runId), "utf-8");
      const checkpoint = JSON.parse(content) as HarnessCheckpoint;
      checkpoint.status = status;
      await writeFile(this.filePath(runId), JSON.stringify(checkpoint, null, 2), "utf-8");
    } catch {
      // 文件不存在时静默忽略
    }
  }

  private async markExpired(runId: string, checkpoint: HarnessCheckpoint): Promise<void> {
    checkpoint.status = "expired";
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(this.filePath(runId), JSON.stringify(checkpoint, null, 2), "utf-8");
    } catch {
      // 静默忽略
    }
  }
}
