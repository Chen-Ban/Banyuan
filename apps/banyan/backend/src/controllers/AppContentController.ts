import type { Context } from 'koa'
import { Types } from 'mongoose'
import appContentService from '../services/AppContentService.js'
import dialogueService from '../services/DialogueService.js'
import conversationService from '../services/ConversationService.js'

/**
 * AppContentController — 画布 appJSON 的直接编辑入口（方向 B）
 *
 * 版本号引用模型下（ADR-042 + ADR-041），用户在画布编辑器里绕过 AI 的手动保存，
 * 与 Schema / 云函数的直接编辑同构，统一包装成一个自动验收的 type='edit' 对话：
 *   1. dialogueService.runAutoConfirmedEdit 创建 edit 对话并给三表 append 草稿版本
 *   2. mutator 中按版本号原地写回 appJSON 草稿记录
 *   3. 对话自动验收（start → committing → done），其持有的版本号成为最新已接受版本
 *
 * 读取走最新已接受版本，与 ApplicationService.getFullApplicationById 聚合口径一致。
 *
 * 注：appJSON 不再写入 Application 文档（旧模型遗留）；Application 仅保存应用元数据
 *     （name / description / thumbnail / tags），内容统一落 AppContent 内容表。
 */
export class AppContentController {
  // ── GET /api/apps/:appId/app-content ─────────────────────────────────────────
  static async getAppContent(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const content = await appContentService.getByVersion(appId, versions.appContentVersion)
    ctx.body = {
      success: true,
      data: { appId, appJSON: content?.appJSON ?? '', version: versions.appContentVersion },
    }
  }

  // ── PUT /api/apps/:appId/app-content ─────────────────────────────────────────
  // 画布手动保存：序列化后的 appJSON 整体覆盖写入。
  static async saveAppContent(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { appJSON?: unknown }

    if (typeof body.appJSON !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'appJSON is required and must be a string' }
      return
    }
    const appJSON = body.appJSON

    const conv = await conversationService.getOrCreate(appId)
    await dialogueService.runAutoConfirmedEdit({
      appId,
      conversationId: conv._id as Types.ObjectId,
      summary: '手动编辑画布内容',
      mutate: async (versions) => {
        await appContentService.updateByVersion(appId, versions.appContentVersion, appJSON)
      },
    })

    ctx.body = { success: true, data: { appId } }
  }
}
