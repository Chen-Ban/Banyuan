import Router from '@koa/router'
import buildRouter from './build'

const router = new Router({ prefix: '/api/v1' })

router.get('/health', (ctx) => {
    ctx.body = { success: true, message: 'Banyuan server is running' }
})

router.use(buildRouter.routes(), buildRouter.allowedMethods())

export default router
