import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './middleware/logger'
import { apiRouter, previewRouter } from './routes'

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

// 路由
app.use(apiRouter.routes())
app.use(apiRouter.allowedMethods())
app.use(previewRouter.routes())
app.use(previewRouter.allowedMethods())

export default app
