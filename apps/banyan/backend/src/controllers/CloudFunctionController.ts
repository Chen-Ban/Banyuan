import { Context } from 'koa'
import cloudFunctionService from '../services/CloudFunctionService.js'

/**
 * 格式化云函数响应体（避免 Mongoose 内部字段泄漏）
 */
function formatCloudFunction(fn: {
  functionId: string
  name: string
  displayName: string
  description: string
  flowSchema: Record<string, unknown>
  version: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    functionId: fn.functionId,
    name: fn.name,
    displayName: fn.displayName,
    description: fn.description,
    schema: fn.flowSchema,
    version: fn.version,
    createdAt: fn.createdAt,
    updatedAt: fn.updatedAt,
  }
}

class CloudFunctionController {
  /**
   * GET /api/apps/:appId/cloud-functions
   */
  async list(ctx: Context) {
    const { appId } = ctx.params as { appId: string }

    const functions = await cloudFunctionService.listByApp(appId)
    ctx.body = {
      success: true,
      data: functions.map(formatCloudFunction),
    }
  }

  /**
   * GET /api/apps/:appId/cloud-functions/:functionId
   */
  async getOne(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }

    const fn = await cloudFunctionService.getByFunctionId(appId, functionId)
    if (!fn) {
      ctx.status = 404
      ctx.body = { success: false, message: '云函数不存在' }
      return
    }

    ctx.body = { success: true, data: formatCloudFunction(fn) }
  }

  /**
   * POST /api/apps/:appId/cloud-functions
   */
  async create(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      name?: string
      displayName?: string
      description?: string
      schema?: Record<string, unknown>
      flowSchema?: Record<string, unknown>
    }

    if (!body.name?.trim()) {
      ctx.status = 400
      ctx.body = { success: false, message: 'name is required' }
      return
    }

    try {
      const fn = await cloudFunctionService.create(appId, {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        flowSchema: body.schema ?? body.flowSchema,
      })

      ctx.status = 201
      ctx.body = { success: true, data: formatCloudFunction(fn) }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('DUPLICATE_NAME:')) {
        const name = msg.slice('DUPLICATE_NAME:'.length)
        ctx.status = 409
        ctx.body = { success: false, message: `云函数名称 "${name}" 已存在` }
      } else {
        throw err
      }
    }
  }

  /**
   * PUT /api/apps/:appId/cloud-functions/:functionId
   */
  async update(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }
    const body = ctx.request.body as {
      name?: string
      displayName?: string
      description?: string
      schema?: Record<string, unknown>
      flowSchema?: Record<string, unknown>
    }

    try {
      const fn = await cloudFunctionService.update(appId, functionId, {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        flowSchema: body.schema ?? body.flowSchema,
      })

      if (!fn) {
        ctx.status = 404
        ctx.body = { success: false, message: '云函数不存在' }
        return
      }

      ctx.body = { success: true, data: formatCloudFunction(fn) }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('DUPLICATE_NAME:')) {
        const name = msg.slice('DUPLICATE_NAME:'.length)
        ctx.status = 409
        ctx.body = { success: false, message: `云函数名称 "${name}" 已存在` }
      } else {
        throw err
      }
    }
  }

  /**
   * DELETE /api/apps/:appId/cloud-functions/:functionId
   */
  async remove(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }

    const deleted = await cloudFunctionService.delete(appId, functionId)
    if (!deleted) {
      ctx.status = 404
      ctx.body = { success: false, message: '云函数不存在' }
      return
    }

    ctx.body = { success: true }
  }
}

export default new CloudFunctionController()
