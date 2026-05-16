import Router from '@koa/router'
import templatesRouter from './templates.js'
import fieldsRouter from './fields.js'

const router = new Router()

/** 健康检查 */
router.get('/health', (ctx) => {
  ctx.body = { success: true, service: 'lunlunglass-studio-backend', timestamp: new Date().toISOString() }
})

export default function applyRoutes(app: import('koa').default) {
  app.use(templatesRouter.routes()).use(templatesRouter.allowedMethods())
  app.use(fieldsRouter.routes()).use(fieldsRouter.allowedMethods())
  app.use(router.routes()).use(router.allowedMethods())
}
