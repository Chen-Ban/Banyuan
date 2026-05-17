import * as fs from 'fs'
import * as path from 'path'
import Router from '@koa/router'
import { startBuild, getTask } from '../services/build/index.js'
import type { Platform } from '../services/build/index.js'

const router = new Router({ prefix: '/api/v1/build' })

/**
 * POST /api/v1/build/app
 * 提交生成应用任务
 *
 * Body:
 *   appJson          string   序列化的页面 JSON 数组（JSON.stringify(string[])）
 *   appName          string   应用名称
 *   platform         'mac' | 'win' | 'linux'
 *   width            number   画布宽度（px）
 *   height           number   画布高度（px）
 *   banvasglVersion  string   banvasgl 版本号（如 '0.1.0'）
 *
 * Response 202:
 *   { success: true, taskId: string }
 */
router.post('/app', async (ctx) => {
  const { appJson, appName, platform, width, height, banvasglVersion } = ctx.request.body as {
    appJson?: string
    appName?: string
    platform?: string
    width?: number
    height?: number
    banvasglVersion?: string
  }

  if (!appJson || typeof appJson !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: 'appJson is required' }
    return
  }
  if (!appName || typeof appName !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: 'appName is required' }
    return
  }
  const validPlatforms: Platform[] = ['mac', 'win', 'linux']
  if (!platform || !validPlatforms.includes(platform as Platform)) {
    ctx.status = 400
    ctx.body = { success: false, error: `platform must be one of: ${validPlatforms.join(', ')}` }
    return
  }
  if (!width || !height || width <= 0 || height <= 0) {
    ctx.status = 400
    ctx.body = { success: false, error: 'width and height must be positive numbers' }
    return
  }
  if (!banvasglVersion || typeof banvasglVersion !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: 'banvasglVersion is required (e.g. "0.1.0")' }
    return
  }

  try {
    JSON.parse(appJson)
  } catch {
    ctx.status = 400
    ctx.body = { success: false, error: 'appJson is not valid JSON' }
    return
  }

  // startBuild 现在是 async（持久化到 MongoDB）
  const taskId = await startBuild({
    appJson,
    appName,
    platform: platform as Platform,
    width: Number(width),
    height: Number(height),
    banvasglVersion,
  })

  ctx.status = 202
  ctx.body = { success: true, taskId }
})

/**
 * GET /api/v1/build/status/:taskId
 * 查询构建任务状态（从 MongoDB 读取，进程重启后仍可查询）
 */
router.get('/status/:taskId', async (ctx) => {
  const { taskId } = ctx.params
  const task = await getTask(taskId)

  if (!task) {
    ctx.status = 404
    ctx.body = { success: false, error: `Task ${taskId} not found` }
    return
  }

  const { outputFile, ...safeTask } = task
  const origin = `${ctx.protocol}://${ctx.host}`
  const result: Record<string, unknown> = { ...safeTask }
  if (task.status === 'success' && outputFile) {
    result.downloadUrl = `${origin}/api/v1/build/download/${taskId}`
  }

  ctx.body = { success: true, task: result }
})

/**
 * GET /api/v1/build/download/:taskId
 * 下载构建产物（安装包）
 */
router.get('/download/:taskId', async (ctx) => {
  const { taskId } = ctx.params
  const task = await getTask(taskId)

  if (!task) {
    ctx.status = 404
    ctx.body = { success: false, error: `Task ${taskId} not found` }
    return
  }

  if (task.status !== 'success' || !task.outputFile) {
    ctx.status = 400
    ctx.body = { success: false, error: 'Build is not complete or has failed' }
    return
  }

  if (!fs.existsSync(task.outputFile)) {
    ctx.status = 410
    ctx.body = { success: false, error: 'Build artifact has been cleaned up, please rebuild' }
    return
  }

  const fileName = path.basename(task.outputFile)
  ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
  ctx.set('Content-Type', 'application/octet-stream')
  ctx.body = fs.createReadStream(task.outputFile)
})

export default router
