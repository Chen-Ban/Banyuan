import type { Context } from 'koa'
import { Types } from 'mongoose'
import uiDefinitionService from '../services/UIDefinitionService.js'
import dialogueService from '../services/DialogueService.js'
import conversationService from '../services/ConversationService.js'

/**
 * UIDefinitionController — UI 定义 JSON 的直接编辑入口（方向 B）
 *
 * 版本号引用模型下（ADR-042 + ADR-041），用户在画布编辑器里绕过 AI 的手动保存，
 * 与 Schema / 云函数的直接编辑同构，统一包装成一个自动验收的 type='edit' 对话：
 *   1. dialogueService.runAutoConfirmedEdit 创建 edit 对话并给三表 append 草稿版本
 *   2. mutator 中按版本号原地写回 UI 定义 JSON 草稿记录
 *   3. 对话自动验收（start → committing → done），其持有的版本号成为最新已接受版本
 *
 * 读取走最新已接受版本，与 ApplicationService.getFullApplicationById 聚合口径一致。
 *
 * 注：UI 定义 JSON 不再写入 Application 文档（旧模型遗留）；Application 仅保存应用元数据
 *     （name / description / thumbnail / tags），内容统一落 UIDefinition 内容表。
 */
export class UIDefinitionController {
  // ── GET /api/apps/:appId/app-content ─────────────────────────────────────────
  static async getUIDefinition(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const content = await uiDefinitionService.getByVersion(appId, versions.uiDefinitionVersion)
    ctx.body = {
      success: true,
      data: { appId, uiJSON: content?.uiJSON ?? '', version: versions.uiDefinitionVersion },
    }
  }

  // ── PUT /api/apps/:appId/app-content ─────────────────────────────────────────
  // 画布手动保存：序列化后的 UI 定义 JSON 整体覆盖写入。
  static async saveUIDefinition(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { uiJSON?: unknown }

    if (typeof body.uiJSON !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'uiJSON is required and must be a string' }
      return
    }
    const uiJSON = body.uiJSON

    const conv = await conversationService.getOrCreate(appId)
    await dialogueService.runAutoConfirmedEdit({
      appId,
      conversationId: conv._id as Types.ObjectId,
      summary: '手动编辑画布内容',
      mutate: async (versions) => {
        await uiDefinitionService.updateByVersion(appId, versions.uiDefinitionVersion, uiJSON)
      },
    })

    ctx.body = { success: true, data: { appId } }
  }
}
