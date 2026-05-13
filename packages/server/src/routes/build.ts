import * as fs from 'fs'
import * as path from 'path'
import Router from '@koa/router'
import { startBuild, getTask } from '../services/build'
import type { Platform } from '../services/build'

const router = new Router({ prefix: '/build' })

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

    // 参数校验
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

    // 验证 appJson 是合法 JSON
    try {
        JSON.parse(appJson)
    } catch {
        ctx.status = 400
        ctx.body = { success: false, error: 'appJson is not valid JSON' }
        return
    }

    const taskId = startBuild({
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
 * 查询构建任务状态
 *
 * Response 200:
 *   {
 *     success: true,
 *     task: {
 *       taskId, appName, platform, status,
 *       createdAt, updatedAt,
 *       downloadUrl?,  // status === 'success' 时，安装包下载地址
 *       error?,        // status === 'failed' 时
 *     }
 *   }
 */
router.get('/status/:taskId', async (ctx) => {
    const { taskId } = ctx.params
    const task = getTask(taskId)

    if (!task) {
        ctx.status = 404
        ctx.body = { success: false, error: `Task ${taskId} not found` }
        return
    }

    // 不暴露服务器本地路径，成功时返回下载链接
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
 *
 * 构建成功后可通过此接口下载 .dmg / .exe / .AppImage 文件。
 * 响应为二进制文件流，Content-Disposition 设为 attachment。
 */
router.get('/download/:taskId', async (ctx) => {
    const { taskId } = ctx.params
    const task = getTask(taskId)

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
