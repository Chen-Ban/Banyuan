import { Context } from 'koa'
import { PrintFieldMapping } from '../models'
import * as PrintService from '../services/PrintService'
import type { TransportConfig } from '../services/printer'

/**
 * PrintController
 * 处理打印相关的 HTTP 请求
 */
class PrintController {
  /**
   * POST /api/print
   * 执行打印
   * Body: { templateId, businessData, printer: { type, address, timeout? }, mappingId? }
   */
  async print(ctx: Context) {
    const { templateId, businessData, printer, mappingId } = ctx.request.body as {
      templateId: string
      businessData: Record<string, any>
      printer: TransportConfig
      mappingId?: string
    }

    if (!templateId || !businessData || !printer) {
      ctx.status = 400
      ctx.body = { success: false, error: 'Missing required fields: templateId, businessData, printer' }
      return
    }

    if (!printer.type || !printer.address) {
      ctx.status = 400
      ctx.body = { success: false, error: 'printer must have type and address' }
      return
    }

    const result = await PrintService.print({
      templateId,
      businessData,
      printer,
      mappingId,
    })

    if (result.success) {
      ctx.body = { success: true, message: 'Print job sent successfully' }
    } else {
      ctx.status = 500
      ctx.body = { success: false, error: result.error }
    }
  }

  /**
   * POST /api/print/preview
   * 预览打印合成图（返回 PNG 图片）
   * Body: { templateId, businessData, mappingId? }
   */
  async preview(ctx: Context) {
    const { templateId, businessData, mappingId } = ctx.request.body as {
      templateId: string
      businessData: Record<string, any>
      mappingId?: string
    }

    if (!templateId || !businessData) {
      ctx.status = 400
      ctx.body = { success: false, error: 'Missing required fields: templateId, businessData' }
      return
    }

    const result = await PrintService.preview(templateId, businessData, mappingId)

    if (result.success && result.composedImage) {
      ctx.type = 'image/png'
      ctx.body = result.composedImage
    } else {
      ctx.status = 500
      ctx.body = { success: false, error: result.error }
    }
  }

  // ── 字段映射 CRUD ──

  /**
   * GET /api/print/mappings?templateId=xxx
   * 获取模板的字段映射列表
   */
  async getMappings(ctx: Context) {
    const { templateId } = ctx.query as { templateId?: string }

    if (!templateId) {
      ctx.status = 400
      ctx.body = { success: false, error: 'templateId query parameter is required' }
      return
    }

    const mappings = await PrintFieldMapping.find({ templateId })
    ctx.body = { success: true, data: mappings }
  }

  /**
   * GET /api/print/mappings/:id
   * 获取单个映射详情
   */
  async getMappingById(ctx: Context) {
    const { id } = ctx.params
    const mapping = await PrintFieldMapping.findById(id)

    if (!mapping) {
      ctx.status = 404
      ctx.body = { success: false, error: 'Mapping not found' }
      return
    }

    ctx.body = { success: true, data: mapping }
  }

  /**
   * POST /api/print/mappings
   * 创建字段映射
   * Body: { templateId, name, rules }
   */
  async createMapping(ctx: Context) {
    const { templateId, name, rules } = ctx.request.body as {
      templateId: string
      name: string
      rules: any[]
    }

    if (!templateId || !name || !rules) {
      ctx.status = 400
      ctx.body = { success: false, error: 'Missing required fields: templateId, name, rules' }
      return
    }

    const mapping = new PrintFieldMapping({ templateId, name, rules })
    await mapping.save()
    ctx.status = 201
    ctx.body = { success: true, data: mapping }
  }

  /**
   * PUT /api/print/mappings/:id
   * 更新字段映射
   * Body: { name?, rules? }
   */
  async updateMapping(ctx: Context) {
    const { id } = ctx.params
    const updates = ctx.request.body as { name?: string; rules?: any[] }

    const mapping = await PrintFieldMapping.findByIdAndUpdate(id, updates, { new: true })

    if (!mapping) {
      ctx.status = 404
      ctx.body = { success: false, error: 'Mapping not found' }
      return
    }

    ctx.body = { success: true, data: mapping }
  }

  /**
   * DELETE /api/print/mappings/:id
   * 删除字段映射
   */
  async deleteMapping(ctx: Context) {
    const { id } = ctx.params
    const mapping = await PrintFieldMapping.findByIdAndDelete(id)

    if (!mapping) {
      ctx.status = 404
      ctx.body = { success: false, error: 'Mapping not found' }
      return
    }

    ctx.body = { success: true, message: 'Mapping deleted' }
  }
}

export default new PrintController()
