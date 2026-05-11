import Router from '@koa/router'
import templateRoutes from './templates'

const router = new Router()

// 健康检查
router.get('/health', async (ctx) => {
  ctx.body = {
    success: true,
    message: 'Banyan server is running',
    timestamp: new Date().toISOString(),
  }
})

// API 路由
router.use(templateRoutes.routes())

export default router
