import { Context } from 'koa'
import materialService from '../services/MaterialService.js'
import type { MaterialSource, MaterialKind } from '../models/index.js'

class MaterialController {
  /**
   * GET /api/materials — 查询物料列表
   */
  async getMaterialList(ctx: Context) {
    try {
      const { keyword, tags, kind, source, status, page = '1', pageSize = '20' } = ctx.query
      const user = ctx.state.user!

      const query: {
        keyword?: string
        tags?: string[]
        kind?: MaterialKind
        source?: MaterialSource
        status?: any
        tenantId?: string
        createdBy?: string
      } = {
        keyword: keyword as string | undefined,
        tags: tags
          ? (Array.isArray(tags)
            ? tags as string[]
            : (tags as string).split(',').map(t => t.trim()).filter(Boolean))
          : undefined,
        kind: kind as MaterialKind | undefined,
        source: source as MaterialSource | undefined,
        status: status as any,
      }

      // builtin 物料对所有人可见，不需要 tenantId/createdBy 过滤
      if (source !== 'builtin') {
        query.tenantId = user.tenantId
        // 成员只看自己创建的 + builtin
        if (user.role === 'member') {
          query.createdBy = user.userId
        }
      }

      const result = await materialService.getMaterialList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10),
      )

      ctx.status = 200
      ctx.body = { success: true, data: result }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to get material list' }
    }
  }

  /**
   * GET /api/materials/:id — 获取物料详情
   */
  async getMaterialById(ctx: Context) {
    try {
      const { id } = ctx.params
      const material = await materialService.getMaterialById(id)

      if (!material) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Material not found' }
        return
      }

      ctx.status = 200
      ctx.body = { success: true, data: material }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to get material' }
    }
  }

  /**
   * POST /api/materials — 创建物料
   */
  async createMaterial(ctx: Context) {
    try {
      const body = ctx.request.body as any
      const user = ctx.state.user!

      if (!body.name || !body.template) {
        ctx.status = 400
        ctx.body = { success: false, message: 'name and template are required' }
        return
      }

      const material = await materialService.createMaterial({
        name: body.name,
        description: body.description,
        tags: body.tags,
        kind: body.kind,
        thumbnail: body.thumbnail,
        source: body.source,
        version: body.version,
        minEngineVersion: body.minEngineVersion,
        template: body.template,
        tenantId: user.tenantId,
        createdBy: user.userId,
      })

      ctx.status = 201
      ctx.body = { success: true, data: material }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to create material' }
    }
  }

  /**
   * PUT /api/materials/:id — 更新物料
   */
  async updateMaterial(ctx: Context) {
    try {
      const { id } = ctx.params
      const body = ctx.request.body as any
      const user = ctx.state.user!

      // 校验物料是否存在
      const existing = await materialService.getMaterialById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Material not found' }
        return
      }

      // 仅创建者或管理员可修改
      if (existing.createdBy !== user.userId && user.role === 'member') {
        ctx.status = 403
        ctx.body = { success: false, message: '无权修改该物料' }
        return
      }

      const material = await materialService.updateMaterial(id, {
        name: body.name,
        description: body.description,
        tags: body.tags,
        thumbnail: body.thumbnail,
        status: body.status,
        version: body.version,
        template: body.template,
        updatedBy: user.userId,
      })

      ctx.status = 200
      ctx.body = { success: true, data: material }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to update material' }
    }
  }

  /**
   * DELETE /api/materials/:id — 废弃或删除物料
   */
  async deleteMaterial(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = ctx.state.user!
      const { force } = ctx.query

      const existing = await materialService.getMaterialById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Material not found' }
        return
      }

      // 仅创建者或管理员可操作
      if (existing.createdBy !== user.userId && user.role === 'member') {
        ctx.status = 403
        ctx.body = { success: false, message: '无权删除该物料' }
        return
      }

      if (force === 'true' && existing.status === 'draft') {
        // 硬删除草稿
        await materialService.deleteMaterial(id)
        ctx.status = 200
        ctx.body = { success: true, message: 'Material deleted permanently' }
      } else {
        // 软删除（标记为 deprecated）
        const material = await materialService.deprecateMaterial(id, user.userId)
        ctx.status = 200
        ctx.body = { success: true, data: material }
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to delete material' }
    }
  }

  /**
   * GET /api/materials/search — 搜索物料（轻量级，用于 AI 工具）
   */
  async searchMaterials(ctx: Context) {
    try {
      const { q, limit = '10' } = ctx.query

      if (!q) {
        ctx.status = 400
        ctx.body = { success: false, message: 'Query parameter "q" is required' }
        return
      }

      const materials = await materialService.searchMaterials(
        q as string,
        parseInt(limit as string, 10),
      )

      ctx.status = 200
      ctx.body = { success: true, data: materials }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to search materials' }
    }
  }
}

export default new MaterialController()
