import Router from '@koa/router'

const router = new Router({ prefix: '/build' })

/**
 * POST /build/app
 * 生成应用（Electron 包）
 *
 * Body: { appJson: string, platform: 'win' | 'mac' | 'linux', appName: string }
 * Response: { taskId: string }
 *
 * TODO: 实现构建任务队列
 */
router.post('/app', async (ctx) => {
    ctx.body = {
        success: false,
        error: 'Not implemented yet',
    }
    ctx.status = 501
})

/**
 * GET /build/status/:taskId
 * 查询构建任务状态
 *
 * TODO: 实现任务状态查询
 */
router.get('/status/:taskId', async (ctx) => {
    ctx.body = {
        success: false,
        error: 'Not implemented yet',
    }
    ctx.status = 501
})

export default router
