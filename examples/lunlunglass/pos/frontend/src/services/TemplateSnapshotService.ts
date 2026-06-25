/**
 * TemplateSnapshotService（POS 前端专用）
 *
 * 封装模板快照的拉取、本地缓存和选择能力，供店员打印流程使用。
 *
 * 数据流向：
 *   POS 前端 → POS 后端（POST /api/templates/sync）→ Studio 后端
 *   POS 前端 → POS 后端（GET /api/templates/snapshots）→ 本地 MongoDB
 *
 * POS 后端实现：
 * @see pos/backend/src/services/TemplateSyncService.ts — 后端同步逻辑
 * @see pos/backend/src/controllers/PrintController.ts — 后端接口
 *
 * 快照内容包含：
 * - snapshotId: 快照唯一 ID（来自 Studio 发布）
 * - templateId: 关联的模板 ID
 * - templateName: 模板名称
 * - version: 版本号
 * - paperWidth: 纸张宽度（mm）
 * - thumbnail: 缩略图（供列表展示）
 * - 打印时 POS 后端根据 snapshotId 读取完整快照（含背景图和字段列表）
 */

import { fetchSnapshots, syncTemplates, type TemplateSnapshotSummary } from '../api/print'
import type { ApiResponse } from '../api/client'

// ─────────────────────────────────────────────
// 接口定义
// ─────────────────────────────────────────────

/** 同步结果 */
export interface SyncResult {
  synced: number
  skipped: number
  errors: string[]
}

/** 模板快照服务接口 */
export interface ITemplateSnapshotService {
  /** 获取本地已同步的模板快照列表 */
  getSnapshots(): Promise<TemplateSnapshotSummary[]>
  /** 手动触发从 Studio 拉取最新已发布模板并返回最新列表 */
  syncFromStudio(): Promise<SyncResult>
  /** 根据 snapshotId 获取快照摘要 */
  getSnapshotById(snapshotId: string): Promise<TemplateSnapshotSummary | undefined>
}

// ─────────────────────────────────────────────
// Mock 数据（Studio 不可用时的兜底）
// ─────────────────────────────────────────────

const MOCK_SNAPSHOTS: TemplateSnapshotSummary[] = [
  {
    snapshotId: 'mock-snapshot-001',
    templateId: 'tpl-receipt-standard',
    templateName: '标准验光单',
    thumbnail: '',
    version: 1,
    paperWidth: 58,
    publishedAt: '2026-05-16T10:00:00.000Z',
  },
  {
    snapshotId: 'mock-snapshot-002',
    templateId: 'tpl-receipt-detailed',
    templateName: '详细验光报告',
    thumbnail: '',
    version: 1,
    paperWidth: 80,
    publishedAt: '2026-05-16T11:00:00.000Z',
  },
  {
    snapshotId: 'mock-snapshot-003',
    templateId: 'tpl-label-product',
    templateName: '商品标签',
    thumbnail: '',
    version: 2,
    paperWidth: 58,
    publishedAt: '2026-05-17T09:00:00.000Z',
  },
]

// ─────────────────────────────────────────────
// 本地缓存（localStorage）
// ─────────────────────────────────────────────

const STORAGE_KEY = 'lunlunglass_pos_snapshots'

function loadFromLocalStorage(): TemplateSnapshotSummary[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TemplateSnapshotSummary[]
  } catch {
    return null
  }
}

function saveToLocalStorage(snapshots: TemplateSnapshotSummary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
  } catch {
    console.warn('[TemplateSnapshotService] Failed to persist snapshots to localStorage.')
  }
}

// ─────────────────────────────────────────────
// 实现
// ─────────────────────────────────────────────

/** 内存缓存 */
let cachedSnapshots: TemplateSnapshotSummary[] | null = null

/**
 * TemplateSnapshotService 实现
 *
 * 三层缓存策略：
 * 1. 内存缓存（当次会话）
 * 2. localStorage（跨页面刷新，Electron 环境持久）
 * 3. POS 后端 API（最终数据源）
 *
 * 若 POS 后端不可用，回退到 localStorage 缓存或 mock 数据。
 */
class TemplateSnapshotService implements ITemplateSnapshotService {
  async getSnapshots(): Promise<TemplateSnapshotSummary[]> {
    // 1. 内存缓存命中
    if (cachedSnapshots) return cachedSnapshots

    // 2. 尝试从后端拉取
    try {
      const response: ApiResponse<TemplateSnapshotSummary[]> = await fetchSnapshots()
      if (response.success && response.data) {
        cachedSnapshots = response.data
        saveToLocalStorage(cachedSnapshots)
        return cachedSnapshots
      }
    } catch {
      console.warn('[TemplateSnapshotService] Failed to fetch snapshots from backend.')
    }

    // 3. 回退到 localStorage
    const localData = loadFromLocalStorage()
    if (localData && localData.length > 0) {
      cachedSnapshots = localData
      return cachedSnapshots
    }

    // 4. 回退到 mock 数据
    cachedSnapshots = MOCK_SNAPSHOTS
    return cachedSnapshots
  }

  async syncFromStudio(): Promise<SyncResult> {
    try {
      const response = await syncTemplates()
      if (response.success) {
        // 同步成功后，清除缓存并重新拉取
        this.invalidateCache()
        // 重新拉取最新列表到缓存
        await this.getSnapshots()

        return {
          synced: (response.data as { synced: number } | undefined)?.synced ?? 0,
          skipped: 0,
          errors: [],
        }
      }

      return {
        synced: 0,
        skipped: 0,
        errors: [response.message ?? 'Sync failed'],
      }
    } catch (err: unknown) {
      const error = err as Error
      return {
        synced: 0,
        skipped: 0,
        errors: [`Sync request failed: ${error.message}`],
      }
    }
  }

  async getSnapshotById(snapshotId: string): Promise<TemplateSnapshotSummary | undefined> {
    const snapshots = await this.getSnapshots()
    return snapshots.find((s) => s.snapshotId === snapshotId)
  }

  /** 清除缓存，下次调用时重新请求 */
  invalidateCache(): void {
    cachedSnapshots = null
  }
}

/** 单例实例 */
export const templateSnapshotService = new TemplateSnapshotService()

export default templateSnapshotService
