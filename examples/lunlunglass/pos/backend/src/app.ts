import Koa from 'koa'
import cors from '@koa/cors'
import logger from 'koa-logger'
import json from 'koa-json'
import { koaBody } from 'koa-body'
import localOnly from './middleware/localOnly.js'
import applyRoutes from './routes/index.js'

const app = new Koa()

// 中间件
app.use(localOnly)
app.use(cors())
app.use(logger())
app.use(json())
app.use(koaBody({ multipart: true, formLimit: '20mb', jsonLimit: '20mb' }))

// 错误处理
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err: unknown) {
    const error = err as Error & { status?: number }
    ctx.status = error.status || 500
    ctx.body = { success: false, message: error.message || 'Internal Server Error' }
    ctx.app.emit('error', err, ctx)
  }
})

// 路由
applyRoutes(app)

// 404
app.use((ctx) => {
  ctx.status = 404
  ctx.body = { success: false, message: 'Not Found' }
})

export default app
