import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './middleware/logger'
import router from './routes'
import previewRouter from './routes/preview'

const app = new Koa()

// 全局错误处理
app.on('error', (err, ctx) => {
    console.error('[Server Error]', err, ctx)
})

// 中间件
app.use(errorHandler)
app.use(logger)
app.use(cors())
app.use(koaBody())

// API 路由（/api/v1/...）
app.use(router.routes())
app.use(router.allowedMethods())

// 预览路由（/preview/...，直接返回 HTML，不走 /api/v1 前缀）
app.use(previewRouter.routes())
app.use(previewRouter.allowedMethods())

export default app
