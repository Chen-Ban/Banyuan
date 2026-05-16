import Router from '@koa/router'
import applicationRoutes from './applications.js'
import aiRoutes from './ai.js'
import conversationRoutes from './conversations.js'
import buildRouter from './build.js'
import previewRouter from './preview.js'

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
router.use(applicationRoutes.routes())
router.use(aiRoutes.routes())
router.use(conversationRoutes.routes(), conversationRoutes.allowedMethods())
router.use(buildRouter.routes(), buildRouter.allowedMethods())
router.use(previewRouter.routes(), previewRouter.allowedMethods())

export default router
