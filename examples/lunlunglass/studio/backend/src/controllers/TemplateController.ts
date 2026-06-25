import { Context } from 'koa'
import templateService from '../services/TemplateService.js'

/**
 * 模板控制器（Studio 专用）
 */
class TemplateController {
  /**
   * GET /api/templates
   * 获取模板列表
   */
  async getTemplateList(ctx: Context) {
    try {
      const { name, publishStatus, page = '1', pageSize = '20' } = ctx.query
      const result = await templateService.getTemplateList(
        {
          name: name as string | undefined,
          publishStatus: publishStatus as string | undefined,
        },
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10),
      )
      ctx.body = { success: true, data: result }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * GET /api/templates/:id
   * 获取模板详情
   */
  async getTemplateById(ctx: Context) {
    try {
      const template = await templateService.getTemplateById(ctx.params.id)
      if (!template) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Template not found' }
        return
      }
      ctx.body = { success: true, data: template }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * POST /api/templates
   * 创建模板
   */
  async createTemplate(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.id || !body.name || !Array.isArray(body.pages)) {
        ctx.status = 400
        ctx.body = { success: false, message: 'id, name, pages are required' }
        return
      }
      const template = await templateService.createTemplate({
        id: body.id as string,
        name: body.name as string,
        description: body.description as string | undefined,
        pages: body.pages as string[],
        tags: body.tags as string[] | undefined,
        createdBy: body.createdBy as string | undefined,
      })
      ctx.status = 201
      ctx.body = { success: true, data: template }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * PUT /api/templates/:id
   * 更新模板
   */
  async updateTemplate(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if ((body as Record<string, unknown>).id) {
        ctx.status = 400
        ctx.body = { success: false, message: 'id cannot be updated' }
        return
      }
      const template = await templateService.updateTemplate(
        ctx.params.id,
        body as Parameters<typeof templateService.updateTemplate>[1],
      )
      if (!template) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Template not found' }
        return
      }
      ctx.body = { success: true, data: template }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * DELETE /api/templates/:id
   * 删除模板
   */
  async deleteTemplate(ctx: Context) {
    try {
      const deleted = await templateService.deleteTemplate(ctx.params.id)
      if (!deleted) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Template not found' }
        return
      }
      ctx.body = { success: true, message: 'Template deleted' }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * POST /api/templates/:id/publish
   * 发布模板（生成快照）
   *
   * Body: {
   *   backgroundImage: string  // exportImage() 导出的 Base64
   *   backgroundSize: { width, height }
   *   fields: IPrintField[]    // 绑定了 fieldKey 的动态字段
   *   thumbnail?: string
   * }
   */
  async publishTemplate(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.backgroundImage || !body.backgroundSize || !Array.isArray(body.fields)) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'backgroundImage, backgroundSize, fields are required',
        }
        return
      }
      const result = await templateService.publishTemplate(ctx.params.id, {
        backgroundImage: body.backgroundImage as string,
        backgroundSize: body.backgroundSize as { width: number; height: number },
        fields: body.fields as Parameters<typeof templateService.publishTemplate>[1]['fields'],
        thumbnail: body.thumbnail as string | undefined,
      })
      ctx.body = { success: true, data: result }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * GET /api/templates/published
   * 获取已发布模板列表（供 POS 拉取，不含背景图）
   */
  async getPublishedTemplates(ctx: Context) {
    try {
      const snapshots = await templateService.getPublishedTemplates()
      ctx.body = { success: true, data: snapshots }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * GET /api/templates/snapshots/:snapshotId
   * 获取快照详情（含背景图，供 POS 下载）
   */
  async getSnapshotById(ctx: Context) {
    try {
      const snapshot = await templateService.getSnapshotById(ctx.params.snapshotId)
      if (!snapshot) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Snapshot not found' }
        return
      }
      ctx.body = { success: true, data: snapshot }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }
}

export default new TemplateController()
