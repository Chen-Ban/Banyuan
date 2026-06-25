import type { Context } from 'koa'
import { Types } from 'mongoose'
import { SchemaService } from '../services/SchemaService.js'
import dialogueService from '../services/DialogueService.js'
import conversationService from '../services/ConversationService.js'
import type { ICollectionDef, IFieldDef } from '../models/types/index.js'
import { validateIdentifier } from '../utils/nameValidation.js'

/**
 * SchemaController — 数据表结构的直接编辑入口（方向 B）
 *
 * 版本号引用模型下，用户绕过 AI 的自主修改也包装成一个自动验收的 type='edit' 对话：
 *   1. dialogueService.runAutoConfirmedEdit 创建 edit 对话并给三表 append 草稿版本
 *   2. mutator 中读取 Schema 草稿版本 → 纯计算变换 → 按版本号原地写回
 *   3. 对话自动验收（start → committing → done），其持有的版本号成为最新已接受版本
 *
 * 读取走最新已接受版本，与 ApplicationService.getFullApplicationById 聚合口径一致。
 */
export class SchemaController {
  // ── GET /api/apps/:appId/schema ──────────────────────────────────────────────
  static async getSchema(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const schema = await SchemaService.getByVersion(appId, versions.schemaVersion)
    ctx.body = {
      success: true,
      data: { appId, collections: schema?.collections ?? [], version: versions.schemaVersion },
    }
  }

  /**
   * 通用直接编辑封装：读取 Schema 草稿 → 纯计算 → 原地写回。
   */
  private static async runSchemaEdit(
    appId: string,
    summary: string,
    transform: (collections: ICollectionDef[]) => ICollectionDef[],
  ): Promise<ICollectionDef[]> {
    const conv = await conversationService.getOrCreate(appId)
    return dialogueService.runAutoConfirmedEdit({
      appId,
      conversationId: conv._id as Types.ObjectId,
      summary,
      mutate: async (versions) => {
        const draft = await SchemaService.getByVersion(appId, versions.schemaVersion)
        const current = draft?.collections ?? []
        const next = transform(current)
        await SchemaService.updateByVersion(appId, versions.schemaVersion, next)
        return next
      },
    })
  }

  // ── POST /api/apps/:appId/schema/collections ─────────────────────────────────
  static async addCollection(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as ICollectionDef

    if (!body.name || typeof body.name !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: '表名不能为空' }
      return
    }
    try {
      validateIdentifier(body.name, '表名')
    } catch (e: any) {
      ctx.status = 400
      ctx.body = { success: false, message: e.message }
      return
    }
    if (!body.displayName || typeof body.displayName !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'Collection displayName is required' }
      return
    }

    const collection: ICollectionDef = {
      name: body.name.trim(),
      displayName: body.displayName.trim(),
      fields: Array.isArray(body.fields) ? body.fields : [],
    }

    await SchemaController.runSchemaEdit(appId, `新增数据表「${collection.displayName}」`, (collections) =>
      SchemaService.computeAddCollection(collections, collection),
    )
    ctx.status = 201
    ctx.body = { success: true, data: collection }
  }

  // ── PUT /api/apps/:appId/schema/collections/:collectionName ──────────────────
  static async updateCollection(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const body = ctx.request.body as Partial<Pick<ICollectionDef, 'displayName' | 'fields'>>

    const next = await SchemaController.runSchemaEdit(
      appId,
      `更新数据表「${collectionName}」结构`,
      (collections) => SchemaService.computeUpdateCollection(collections, collectionName, body),
    )
    ctx.body = { success: true, data: next.find((c) => c.name === collectionName) }
  }

  // ── DELETE /api/apps/:appId/schema/collections/:collectionName ───────────────
  static async deleteCollection(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    await SchemaController.runSchemaEdit(appId, `删除数据表「${collectionName}」`, (collections) =>
      SchemaService.computeDeleteCollection(collections, collectionName),
    )
    ctx.body = { success: true, data: { name: collectionName } }
  }

  // ── POST /api/apps/:appId/schema/collections/:collectionName/fields ──────────
  static async addField(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const body = ctx.request.body as IFieldDef

    if (!body.name || typeof body.name !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: '字段名不能为空' }
      return
    }
    try {
      validateIdentifier(body.name, '字段名')
    } catch (e: any) {
      ctx.status = 400
      ctx.body = { success: false, message: e.message }
      return
    }
    if (!body.type) {
      ctx.status = 400
      ctx.body = { success: false, message: 'Field type is required' }
      return
    }

    const field: IFieldDef = {
      name: body.name.trim(),
      displayName: (body.displayName ?? body.name).trim(),
      type: body.type,
      required: body.required ?? false,
      defaultValue: body.defaultValue,
      refCollection: body.refCollection,
      enumValues: body.enumValues,
    }

    await SchemaController.runSchemaEdit(
      appId,
      `为数据表「${collectionName}」新增字段「${field.displayName}」`,
      (collections) => SchemaService.computeAddField(collections, collectionName, field),
    )
    ctx.status = 201
    ctx.body = { success: true, data: field }
  }

  // ── PUT /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName ─
  static async updateField(ctx: Context) {
    const { appId, collectionName, fieldName } = ctx.params as {
      appId: string
      collectionName: string
      fieldName: string
    }
    const body = ctx.request.body as Partial<IFieldDef>

    const next = await SchemaController.runSchemaEdit(
      appId,
      `更新数据表「${collectionName}」字段「${fieldName}」`,
      (collections) => SchemaService.computeUpdateField(collections, collectionName, fieldName, body),
    )
    const collection = next.find((c) => c.name === collectionName)
    ctx.body = { success: true, data: collection?.fields.find((f) => f.name === (body.name ?? fieldName)) }
  }

  // ── DELETE /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName
  static async deleteField(ctx: Context) {
    const { appId, collectionName, fieldName } = ctx.params as {
      appId: string
      collectionName: string
      fieldName: string
    }
    await SchemaController.runSchemaEdit(
      appId,
      `删除数据表「${collectionName}」字段「${fieldName}」`,
      (collections) => SchemaService.computeDeleteField(collections, collectionName, fieldName),
    )
    ctx.body = { success: true, data: { collectionName, fieldName } }
  }
}
