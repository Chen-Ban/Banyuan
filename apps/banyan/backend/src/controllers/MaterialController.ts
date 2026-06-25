import { Context } from 'koa'
import materialService from '../services/MaterialService.js'
import type { MaterialSource, MaterialKind, ITemplate } from '../models/types/index.js'

/** POST/PUT /api/materials 请求体 */
interface MaterialRequestBody {
  name?: string
  description?: string
  tags?: string[]
  kind?: MaterialKind
  thumbnail?: string
  source?: MaterialSource
  version?: string
  minEngineVersion?: string
  template?: ITemplate
  applicationId?: string
}

class MaterialController {
  /**
   * GET /api/materials — 查询物料列表
   */
  async getMaterialList(ctx: Context) {
    try {
      const { keyword, tags, kind, source, applicationId, page = '1', pageSize = '20' } = ctx.query

      const query: {
        keyword?: string
        tags?: string[]
        kind?: MaterialKind
        source?: MaterialSource
        applicationId?: string
      } = {
        keyword: keyword as string | undefined,
        tags: tags
          ? Array.isArray(tags)
            ? (tags as string[])
            : (tags as string)
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
          : undefined,
        kind: kind as MaterialKind | undefined,
        source: source as MaterialSource | undefined,
      }

      // builtin 物料对所有人可见，不需要 application 过滤
      if (source !== 'builtin' && typeof applicationId === 'string' && applicationId) {
        query.applicationId = applicationId
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
      const body = ctx.request.body as MaterialRequestBody
      const user = ctx.state.user!

      if (!body.name || !body.template) {
        ctx.status = 400
        ctx.body = { success: false, message: 'name and template are required' }
        return
      }
      if (!body.applicationId) {
        ctx.status = 400
        ctx.body = { success: false, message: 'applicationId is required' }
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
        applicationId: body.applicationId,
        creatorId: user.userId,
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
      const body = ctx.request.body as MaterialRequestBody
      const user = ctx.state.user!

      // 校验物料是否存在
      const existing = await materialService.getMaterialById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Material not found' }
        return
      }

      // 仅归属应用或管理员可修改；builtin 物料不可改
      if (existing.meta.source === 'builtin') {
        ctx.status = 403
        ctx.body = { success: false, message: '内置物料不可修改' }
        return
      }
      // member 必须传入与物料归属一致的 applicationId 才可修改；管理员不受限
      if (user.membershipRole === 'member') {
        if (!body.applicationId || existing.applicationId !== body.applicationId) {
          ctx.status = 403
          ctx.body = { success: false, message: '无权修改该物料' }
          return
        }
      }

      const material = await materialService.updateMaterial(id, {
        name: body.name,
        description: body.description,
        tags: body.tags,
        thumbnail: body.thumbnail,
        version: body.version,
        template: body.template,
      })

      ctx.status = 200
      ctx.body = { success: true, data: material }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to update material' }
    }
  }

  /**
   * DELETE /api/materials/:id — 删除物料（硬删除）
   */
  async deleteMaterial(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = ctx.state.user!
      const applicationId = typeof ctx.query.applicationId === 'string' ? ctx.query.applicationId : undefined

      const existing = await materialService.getMaterialById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Material not found' }
        return
      }

      // 内置物料不可删除
      if (existing.meta.source === 'builtin') {
        ctx.status = 403
        ctx.body = { success: false, message: '内置物料不可删除' }
        return
      }
      // member 必须传入与物料归属一致的 applicationId 才可删除；管理员不受限
      if (user.membershipRole === 'member') {
        if (!applicationId || existing.applicationId !== applicationId) {
          ctx.status = 403
          ctx.body = { success: false, message: '无权删除该物料' }
          return
        }
      }

      await materialService.deleteMaterial(id)
      ctx.status = 200
      ctx.body = { success: true, message: 'Material deleted' }
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

      const materials = await materialService.searchMaterials(q as string, parseInt(limit as string, 10))

      ctx.status = 200
      ctx.body = { success: true, data: materials }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to search materials' }
    }
  }
}

export default new MaterialController()
