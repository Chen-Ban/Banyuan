/**
 * /api/apps/:appId/cloud-functions — 云函数 CRUD 路由
 *
 * 云函数是应用级的 FlowSchema 定义，通过可视化流程编辑器创建，
 * 可被页面中的组件事件绑定调用。
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { CloudFunction } from '../models/index.js'

const router = new Router({ prefix: '/api/apps/:appId/cloud-functions' })

/**
 * GET /api/apps/:appId/cloud-functions
 * 获取应用的所有云函数列表
 */
router.get('/', async (ctx: Context) => {
  const { appId } = ctx.params as { appId: string }

  const functions = await CloudFunction.find({ appId })
    .sort({ createdAt: -1 })
    .lean()

  ctx.body = {
    success: true,
    data: functions.map((f) => ({
      functionId: f.functionId,
      name: f.name,
      displayName: f.displayName,
      description: f.description,
      flowSchema: f.flowSchema,
      version: f.version,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  }
})

/**
 * GET /api/apps/:appId/cloud-functions/:functionId
 * 获取单个云函数详情
 */
router.get('/:functionId', async (ctx: Context) => {
  const { appId, functionId } = ctx.params as { appId: string; functionId: string }

  const fn = await CloudFunction.findOne({ appId, functionId }).lean()
  if (!fn) {
    ctx.status = 404
    ctx.body = { success: false, message: '云函数不存在' }
    return
  }

  ctx.body = {
    success: true,
    data: {
      functionId: fn.functionId,
      name: fn.name,
      displayName: fn.displayName,
      description: fn.description,
      flowSchema: fn.flowSchema,
      version: fn.version,
      createdAt: fn.createdAt,
      updatedAt: fn.updatedAt,
    },
  }
})

/**
 * POST /api/apps/:appId/cloud-functions
 * 创建云函数
 */
router.post('/', async (ctx: Context) => {
  const { appId } = ctx.params as { appId: string }
  const body = ctx.request.body as {
    name?: string
    displayName?: string
    description?: string
    flowSchema?: Record<string, unknown>
  }

  if (!body.name?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, message: 'name is required' }
    return
  }

  // 检查名称是否重复
  const existing = await CloudFunction.findOne({ appId, name: body.name.trim() })
  if (existing) {
    ctx.status = 409
    ctx.body = { success: false, message: `云函数名称 "${body.name}" 已存在` }
    return
  }

  const functionId = crypto.randomUUID()
  const fn = await CloudFunction.create({
    functionId,
    appId,
    name: body.name.trim(),
    displayName: body.displayName?.trim() || body.name.trim(),
    description: body.description?.trim() || '',
    flowSchema: body.flowSchema ?? { nodes: [], edges: [] },
  })

  ctx.status = 201
  ctx.body = {
    success: true,
    data: {
      functionId: fn.functionId,
      name: fn.name,
      displayName: fn.displayName,
      description: fn.description,
      flowSchema: fn.flowSchema,
      version: fn.version,
      createdAt: fn.createdAt,
      updatedAt: fn.updatedAt,
    },
  }
})

/**
 * PUT /api/apps/:appId/cloud-functions/:functionId
 * 更新云函数
 */
router.put('/:functionId', async (ctx: Context) => {
  const { appId, functionId } = ctx.params as { appId: string; functionId: string }
  const body = ctx.request.body as {
    name?: string
    displayName?: string
    description?: string
    flowSchema?: Record<string, unknown>
  }

  const fn = await CloudFunction.findOne({ appId, functionId })
  if (!fn) {
    ctx.status = 404
    ctx.body = { success: false, message: '云函数不存在' }
    return
  }

  // 如果改了 name，检查是否重复
  if (body.name && body.name.trim() !== fn.name) {
    const dup = await CloudFunction.findOne({ appId, name: body.name.trim() })
    if (dup) {
      ctx.status = 409
      ctx.body = { success: false, message: `云函数名称 "${body.name}" 已存在` }
      return
    }
    fn.name = body.name.trim()
  }

  if (body.displayName !== undefined) fn.displayName = body.displayName.trim()
  if (body.description !== undefined) fn.description = body.description.trim()
  if (body.flowSchema !== undefined) fn.flowSchema = body.flowSchema
  fn.version += 1

  await fn.save()

  ctx.body = {
    success: true,
    data: {
      functionId: fn.functionId,
      name: fn.name,
      displayName: fn.displayName,
      description: fn.description,
      flowSchema: fn.flowSchema,
      version: fn.version,
      createdAt: fn.createdAt,
      updatedAt: fn.updatedAt,
    },
  }
})

/**
 * DELETE /api/apps/:appId/cloud-functions/:functionId
 * 删除云函数
 */
router.del('/:functionId', async (ctx: Context) => {
  const { appId, functionId } = ctx.params as { appId: string; functionId: string }

  const result = await CloudFunction.deleteOne({ appId, functionId })
  if (result.deletedCount === 0) {
    ctx.status = 404
    ctx.body = { success: false, message: '云函数不存在' }
    return
  }

  ctx.body = { success: true }
})

export default router
