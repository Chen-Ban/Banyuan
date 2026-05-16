import Router from '@koa/router'
import ordersRouter from './orders.js'
import usersRouter from './users.js'
import productsRouter from './products.js'
import statisticsRouter from './statistics.js'
import fieldsRouter from './fields.js'
import printRouter from './print.js'

const router = new Router()

/** 健康检查 */
router.get('/health', (ctx) => {
  ctx.body = { success: true, service: 'lunlunglass-pos-backend', timestamp: new Date().toISOString() }
})

export default function applyRoutes(app: import('koa').default) {
  app.use(ordersRouter.routes()).use(ordersRouter.allowedMethods())
  app.use(usersRouter.routes()).use(usersRouter.allowedMethods())
  app.use(productsRouter.routes()).use(productsRouter.allowedMethods())
  app.use(statisticsRouter.routes()).use(statisticsRouter.allowedMethods())
  app.use(fieldsRouter.routes()).use(fieldsRouter.allowedMethods())
  app.use(printRouter.routes()).use(printRouter.allowedMethods())
  app.use(router.routes()).use(router.allowedMethods())
}
