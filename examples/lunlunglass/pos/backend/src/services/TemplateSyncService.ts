/**
 * TemplateSyncService（POS 专用）
 *
 * 负责从 Studio 拉取已发布模板快照并本地存储。
 * POS 打印时不依赖 Studio 在线，使用本地快照。
 *
 * Studio 地址通过环境变量 STUDIO_URL 配置：
 *   STUDIO_URL=https://studio.lunlunglass.com   （生产环境）
 *   STUDIO_URL=http://192.168.1.100:3000        （局域网部署）
 */

import fetch from 'node-fetch'
import { TemplateSnapshot } from '../models/index.js'

/**
 * 从 Studio 拉取已发布模板列表（不含背景图）
 */
async function fetchPublishedList(studioUrl: string) {
  const response = await fetch(`${studioUrl}/api/templates/published`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    throw new Error(`Studio returned ${response.status} for /templates/published`)
  }
  const data = (await response.json()) as { success: boolean; data: unknown[] }
  if (!data.success) {
    throw new Error('Studio /templates/published returned success=false')
  }
  return data.data
}

/**
 * 从 Studio 拉取单个快照详情（含背景图）
 */
async function fetchSnapshotDetail(studioUrl: string, snapshotId: string) {
  const response = await fetch(`${studioUrl}/api/templates/snapshots/${snapshotId}`, {
    signal: AbortSignal.timeout(30000), // 背景图可能较大
  })
  if (!response.ok) {
    throw new Error(`Studio returned ${response.status} for snapshot ${snapshotId}`)
  }
  const data = (await response.json()) as { success: boolean; data: Record<string, unknown> }
  if (!data.success) {
    throw new Error(`Studio snapshot ${snapshotId} returned success=false`)
  }
  return data.data
}

export interface SyncResult {
  synced: number
  skipped: number
  errors: string[]
}

/**
 * 同步已发布模板快照
 * - 拉取 Studio 的已发布列表
 * - 对本地不存在的快照，拉取详情并存储
 * - 已存在的快照跳过（只保留最新已发布版本）
 */
export async function syncTemplates(): Promise<SyncResult> {
  const studioUrl = process.env.STUDIO_URL
  if (!studioUrl) {
    throw new Error('STUDIO_URL is not configured')
  }

  const result: SyncResult = { synced: 0, skipped: 0, errors: [] }

  // 1. 拉取已发布列表
  const publishedList = (await fetchPublishedList(studioUrl)) as Array<Record<string, unknown>>

  // 2. 逐个检查并同步
  for (const item of publishedList) {
    const snapshotId = item.snapshotId as string
    if (!snapshotId) continue

    // 检查本地是否已存在
    const existing = await TemplateSnapshot.findOne({ snapshotId })
    if (existing) {
      result.skipped++
      continue
    }

    try {
      // 拉取快照详情（含背景图）
      const detail = await fetchSnapshotDetail(studioUrl, snapshotId)

      // 存储到本地
      await TemplateSnapshot.create({
        snapshotId: detail.snapshotId,
        templateId: detail.templateId,
        templateName: detail.templateName,
        thumbnail: detail.thumbnail ?? '',
        version: detail.version,
        paperWidth: detail.paperWidth,
        dpi: detail.dpi,
        backgroundImage: detail.backgroundImage,
        backgroundSize: detail.backgroundSize,
        fields: detail.fields ?? [],
        publishedAt: detail.publishedAt ? new Date(detail.publishedAt as string) : new Date(),
        syncedAt: new Date(),
      })

      result.synced++
    } catch (err: unknown) {
      const error = err as Error
      result.errors.push(`Failed to sync snapshot ${snapshotId}: ${error.message}`)
    }
  }

  return result
}

/**
 * 获取本地已同步的模板快照列表（供店员选择）
 * 不含背景图，减少传输量
 */
export async function getLocalSnapshots() {
  return TemplateSnapshot.find().select('-backgroundImage').sort({ syncedAt: -1 }).lean()
}
