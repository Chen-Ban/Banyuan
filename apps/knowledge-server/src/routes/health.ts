import Router from '@koa/router'

const router = new Router()

router.get('/health', async (ctx) => {
  ctx.body = { status: 'ok', service: 'knowledge-server' }
})

export default router
