import Router from '@koa/router'
import statisticsRoutes from './statistics'
import userRoutes from './users'
import orderRoutes from './orders'
import templateRoutes from './templates'
import productRoutes from './products'
import uploadRoutes from './upload'

const router = new Router()

// 健康检查路由
router.get('/health', async (ctx) => {
  ctx.body = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  }
})

// API 路由
router.use(statisticsRoutes.routes())
router.use(userRoutes.routes())
router.use(orderRoutes.routes())
router.use(templateRoutes.routes())
router.use(productRoutes.routes())
router.use(uploadRoutes.routes())

export default router
