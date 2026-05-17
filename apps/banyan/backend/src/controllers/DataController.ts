import type { Context } from 'koa'
import { SchemaService } from '../services/SchemaService.js'
import { OrmService } from '../services/OrmService.js'

/**
 * 自动 CRUD 控制器
 * 基于 AppSchema 动态生成的 Collection 提供标准 CRUD 操作
 * 路由前缀：/api/apps/:appId/data/:collectionName
 */
export class DataController {
  /**
   * 获取 CollectionAccessor，若 Collection 不存在则抛 404
   */
  private static async getAccessor(appId: string, collectionName: string) {
    const collection = await SchemaService.getCollection(appId, collectionName)
    if (!collection) {
      throw Object.assign(
        new Error(`Collection "${collectionName}" not found in app "${appId}"`),
        { status: 404 },
      )
    }
    return OrmService.buildAccessor(appId, collectionName, collection.fields)
  }

  // ── GET /api/apps/:appId/data/:collectionName ─────────────────────────────
  // 查询列表，支持 ?limit=&skip=&sort= 查询参数
  static async list(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const query = ctx.query as Record<string, string>

    const limit = query.limit ? parseInt(query.limit, 10) : 20
    const skip = query.skip ? parseInt(query.skip, 10) : 0
    const sort = query.sort ? JSON.parse(query.sort) : undefined

    // 其余 query 参数作为 filter（排除分页参数）
    const { limit: _l, skip: _s, sort: _so, ...filterRaw } = query
    const filter: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(filterRaw)) {
      filter[k] = v
    }

    const accessor = await DataController.getAccessor(appId, collectionName)
    const [docs, total] = await Promise.all([
      accessor.find(filter, { limit, skip, sort }),
      accessor.count(filter),
    ])

    ctx.body = {
      success: true,
      data: docs,
      pagination: { total, limit, skip },
    }
  }

  // ── GET /api/apps/:appId/data/:collectionName/:id ─────────────────────────
  static async getById(ctx: Context) {
    const { appId, collectionName, id } = ctx.params as {
      appId: string
      collectionName: string
      id: string
    }

    const accessor = await DataController.getAccessor(appId, collectionName)
    const doc = await accessor.findById(id)

    if (!doc) {
      ctx.status = 404
      ctx.body = { success: false, message: 'Document not found' }
      return
    }

    ctx.body = { success: true, data: doc }
  }

  // ── POST /api/apps/:appId/data/:collectionName ────────────────────────────
  static async create(ctx: Context) {
    const { appId, collectionName } = ctx.params as { appId: string; collectionName: string }
    const body = ctx.request.body as Record<string, unknown>

    const accessor = await DataController.getAccessor(appId, collectionName)
    const doc = await accessor.create(body)

    ctx.status = 201
    ctx.body = { success: true, data: doc }
  }

  // ── PUT /api/apps/:appId/data/:collectionName/:id ─────────────────────────
  static async updateById(ctx: Context) {
    const { appId, collectionName, id } = ctx.params as {
      appId: string
      collectionName: string
      id: string
    }
    const body = ctx.request.body as Record<string, unknown>

    const accessor = await DataController.getAccessor(appId, collectionName)
    const doc = await accessor.updateById(id, body)

    if (!doc) {
      ctx.status = 404
      ctx.body = { success: false, message: 'Document not found' }
      return
    }

    ctx.body = { success: true, data: doc }
  }

  // ── DELETE /api/apps/:appId/data/:collectionName/:id ──────────────────────
  static async deleteById(ctx: Context) {
    const { appId, collectionName, id } = ctx.params as {
      appId: string
      collectionName: string
      id: string
    }

    const accessor = await DataController.getAccessor(appId, collectionName)
    const deleted = await accessor.deleteById(id)

    if (!deleted) {
      ctx.status = 404
      ctx.body = { success: false, message: 'Document not found' }
      return
    }

    ctx.body = { success: true, message: 'Deleted successfully' }
  }
}
