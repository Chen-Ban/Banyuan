import { Context } from 'koa'
import type { IPrintConfig } from '../models/Template'
import templateService from '../services/TemplateService'

/**
 * 创建模板请求体
 */
interface CreateTemplateRequest {
  id: string
  name: string
  description?: string
  pages: string[]
  thumbnail?: string
  tags?: string[]
  createdBy?: string
}

/**
 * 更新模板请求体
 */
interface UpdateTemplateRequest {
  name?: string
  description?: string
  pages?: string[]
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
  printConfig?: IPrintConfig | null
}

/**
 * 模板控制器
 */
class TemplateController {
  /**
   * 获取模板列表
   * GET /api/templates
   * Query参数: name, id, tags, createdBy, page, pageSize
   */
  async getTemplateList(ctx: Context) {
    try {
      const {
        name,
        id,
        tags,
        createdBy,
        page = '1',
        pageSize = '12',
      } = ctx.query

      const query = {
        name: name as string | undefined,
        id: id as string | undefined,
        tags: tags as string | undefined,
        createdBy: createdBy as string | undefined,
      }

      // 移除 undefined 值
      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query]
      )

      const result = await templateService.getTemplateList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10)
      )

      ctx.status = 200
      ctx.body = {
        success: true,
        data: result,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get template list',
      }
    }
  }

  /**
   * 根据ID获取模板详情
   * GET /api/templates/:id
   */
  async getTemplateById(ctx: Context) {
    try {
      const { id } = ctx.params
      const template = await templateService.getTemplateById(id)

      if (!template) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Template not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: template,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get template',
      }
    }
  }

  /**
   * 创建模板
   * POST /api/templates
   */
  async createTemplate(ctx: Context) {
    try {
      const templateData = ctx.request.body as CreateTemplateRequest

      // 验证必填字段
      if (!templateData.id || !templateData.name || !templateData.pages) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'id, name and pages are required',
        }
        return
      }

      if (!Array.isArray(templateData.pages)) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'pages must be an array of strings',
        }
        return
      }

      const template = await templateService.createTemplate(templateData)

      ctx.status = 201
      ctx.body = {
        success: true,
        data: template,
        message: 'Template created successfully',
      }
    } catch (error: any) {
      ctx.status = error.message.includes('already exists') ? 409 : 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to create template',
      }
    }
  }

  /**
   * 更新模板
   * PUT /api/templates/:id
   */
  async updateTemplate(ctx: Context) {
    try {
      const { id } = ctx.params
      const updateData = ctx.request.body as UpdateTemplateRequest

      // 不允许更新 id
      if ((updateData as any).id) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'id cannot be updated',
        }
        return
      }

      const template = await templateService.updateTemplate(id, updateData)

      if (!template) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Template not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: template,
        message: 'Template updated successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to update template',
      }
    }
  }

  /**
   * 删除模板
   * DELETE /api/templates/:id
   */
  async deleteTemplate(ctx: Context) {
    try {
      const { id } = ctx.params
      const deleted = await templateService.deleteTemplate(id)

      if (!deleted) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Template not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        message: 'Template deleted successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to delete template',
      }
    }
  }
}

export default new TemplateController()
