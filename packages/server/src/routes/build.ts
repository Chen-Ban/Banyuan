import Router from '@koa/router'
import { startBuild, getTask } from '../services/build'
import type { Platform } from '../services/build'

const router = new Router({ prefix: '/build' })

/**
 * POST /api/v1/build/app
 * 提交生成应用任务
 *
 * Body:
 *   appJson   string   序列化的页面 JSON 数组（JSON.stringify(string[])）
 *   appName   string   应用名称
 *   platform  'mac' | 'win' | 'linux'
 *   width     number   画布宽度（px）
 *   height    number   画布高度（px）
 *
 * Response 202:
 *   { success: true, taskId: string }
 */
router.post('/app', async (ctx) => {
    const { appJson, appName, platform, width, height } = ctx.request.body as {
        appJson?: string
        appName?: string
        platform?: string
        width?: number
        height?: number
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
 *       outputFile?,   // status === 'success' 时
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

    ctx.body = { success: true, task }
})

export default router
