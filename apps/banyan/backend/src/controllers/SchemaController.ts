import type { Context } from 'koa'
import { SchemaService } from '../services/SchemaService.js'
import type { ICollectionDef, IFieldDef } from '../models/types/index.js'

export class SchemaController {
  // ── GET /api/apps/:appId/schema ──────────────────────────────────────────────
  static async getSchema(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const schema = await SchemaService.getSchema(appId)
    ctx.body = { success: true, data: schema }
  }

  // ── POST /api/apps/:appId/schema/collections ─────────────────────────────────
  static async addCollection(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as ICollectionDef

    if (!body.name || typeof body.name !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'Collection name is required' }
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

    const result = await SchemaService.addCollection(appId, collection)
    ctx.status = 201
    ctx.body = { success: true, data: result }
  }

  // ── PUT /api/apps/:appId/schema/collections/:collectionName ──────────────────
  static async updateCollection(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const body = ctx.request.body as Partial<Pick<ICollectionDef, 'displayName' | 'fields'>>

    const result = await SchemaService.updateCollection(appId, collectionName, body)
    ctx.body = { success: true, data: result }
  }

  // ── DELETE /api/apps/:appId/schema/collections/:collectionName ───────────────
  static async deleteCollection(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const result = await SchemaService.deleteCollection(appId, collectionName)
    ctx.body = { success: true, data: result }
  }

  // ── POST /api/apps/:appId/schema/collections/:collectionName/fields ──────────
  static async addField(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const body = ctx.request.body as IFieldDef

    if (!body.name || typeof body.name !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'Field name is required' }
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

    const result = await SchemaService.addField(appId, collectionName, field)
    ctx.status = 201
    ctx.body = { success: true, data: result }
  }

  // ── PUT /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName ─
  static async updateField(ctx: Context) {
    const { appId, collectionName, fieldName } = ctx.params as {
      appId: string
      collectionName: string
      fieldName: string
    }
    const body = ctx.request.body as Partial<IFieldDef>

    const result = await SchemaService.updateField(appId, collectionName, fieldName, body)
    ctx.body = { success: true, data: result }
  }

  // ── DELETE /api/apps/:appId/schema/collections/:collectionName/fields/:fieldName
  static async deleteField(ctx: Context) {
    const { appId, collectionName, fieldName } = ctx.params as {
      appId: string
      collectionName: string
      fieldName: string
    }
    const result = await SchemaService.deleteField(appId, collectionName, fieldName)
    ctx.body = { success: true, data: result }
  }
}
