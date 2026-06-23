/**
 * FullStateController — 应用全量状态聚合读写
 *
 * save-all：在一次 runAutoConfirmedEdit 中原子更新三张内容表（uiJSON / collections / cloudFunctions），
 * 保证版本号引用模型的完整性。
 *
 * full-state：聚合读取最新已接受版本的全部业务数据，与 ApplicationService.getFullApplicationById 口径一致。
 */

import type { Context } from 'koa'
import { Types } from 'mongoose'
import uiDefinitionService from '../services/UIDefinitionService.js'
import { SchemaService } from '../services/SchemaService.js'
import cloudFunctionService from '../services/CloudFunctionService.js'
import dialogueService from '../services/DialogueService.js'
import conversationService from '../services/ConversationService.js'
import type { ICollectionDef, ICloudFunctionDef } from '../models/types/index.js'

export class FullStateController {
  /**
   * PUT /api/apps/:appId/save-all
   *
   * 请求体：{ uiJSON: string, collections: ICollectionDef[], cloudFunctions: ICloudFunctionDef[] }
   * 在一次 edit 对话中原子写入三张表。任何字段缺失则跳过该表的更新。
   */
  static async saveAll(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      uiJSON?: unknown
      collections?: unknown
      cloudFunctions?: unknown
    }

    // 至少需要提供一个字段
    const hasUIJSON = typeof body.uiJSON === 'string'
    const hasCollections = Array.isArray(body.collections)
    const hasCloudFunctions = Array.isArray(body.cloudFunctions)

    if (!hasUIJSON && !hasCollections && !hasCloudFunctions) {
      ctx.status = 400
      ctx.body = { success: false, message: '至少需要提供 uiJSON / collections / cloudFunctions 其中之一' }
      return
    }

    // 基本结构校验：collections 元素必须有 name 字段
    if (hasCollections) {
      const cols = body.collections as unknown[]
      const valid = cols.every((c) => typeof c === 'object' && c !== null && 'name' in c)
      if (!valid) {
        ctx.status = 400
        ctx.body = { success: false, message: 'collections 元素必须为含 name 字段的对象' }
        return
      }
    }

    // 基本结构校验：cloudFunctions 元素必须有 functionId 和 name 字段
    if (hasCloudFunctions) {
      const fns = body.cloudFunctions as unknown[]
      const valid = fns.every((f) => typeof f === 'object' && f !== null && 'functionId' in f && 'name' in f)
      if (!valid) {
        ctx.status = 400
        ctx.body = { success: false, message: 'cloudFunctions 元素必须为含 functionId/name 字段的对象' }
        return
      }
    }

    const conv = await conversationService.getOrCreate(appId)
    await dialogueService.runAutoConfirmedEdit({
      appId,
      conversationId: conv._id as Types.ObjectId,
      summary: '全量保存应用内容',
      mutate: async (versions) => {
        const tasks: Promise<void>[] = []

        if (hasUIJSON) {
          tasks.push(
            uiDefinitionService.updateByVersion(appId, versions.uiDefinitionVersion, body.uiJSON as string),
          )
        }

        if (hasCollections) {
          tasks.push(
            SchemaService.updateByVersion(appId, versions.schemaVersion, body.collections as ICollectionDef[]),
          )
        }

        if (hasCloudFunctions) {
          tasks.push(
            cloudFunctionService.updateByVersion(appId, versions.cloudFunctionVersion, body.cloudFunctions as ICloudFunctionDef[]),
          )
        }

        await Promise.all(tasks)
      },
    })

    ctx.body = { success: true, data: { appId } }
  }

  /**
   * GET /api/apps/:appId/full-state
   *
   * 返回最新已接受版本的 uiJSON + collections + cloudFunctions。
   * 口径与 ApplicationService.getFullApplicationById 一致。
   */
  static async getFullState(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)

    // 无任何已接受版本 → 返回空内容
    if (
      versions.uiDefinitionVersion <= 0 &&
      versions.schemaVersion <= 0 &&
      versions.cloudFunctionVersion <= 0
    ) {
      ctx.body = {
        success: true,
        data: { uiJSON: '', collections: [], cloudFunctions: [] },
      }
      return
    }

    const [content, schema, group] = await Promise.all([
      uiDefinitionService.getByVersion(appId, versions.uiDefinitionVersion),
      SchemaService.getByVersion(appId, versions.schemaVersion),
      cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion),
    ])

    ctx.body = {
      success: true,
      data: {
        uiJSON: content?.uiJSON ?? '',
        collections: schema?.collections ?? [],
        cloudFunctions: group?.functions ?? [],
      },
    }
  }
}
