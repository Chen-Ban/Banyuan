import Router from '@koa/router'
import buildRouter from './build'
import previewRouter from './preview'

// ── API 路由（/api/v1/...）──
const apiRouter = new Router({ prefix: '/api/v1' })

apiRouter.get('/health', (ctx) => {
    ctx.body = { success: true, message: 'Banyuan server is running' }
})

apiRouter.use(buildRouter.routes(), buildRouter.allowedMethods())

// ── 预览路由（/preview/...，直接返回 HTML，不走 /api/v1 前缀）──
// previewRouter 自带 prefix: '/preview'

export { apiRouter, previewRouter }
