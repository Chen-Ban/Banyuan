import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import json from 'koa-json'
import logger from 'koa-logger'
import cors from '@koa/cors'
import router from './routes'

const app = new Koa()

// 中间件
app.use(cors())
app.use(logger())
app.use(json())
app.use(bodyParser())

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err: any) {
    ctx.status = err.status || 500
    ctx.body = {
      success: false,
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    }
    ctx.app.emit('error', err, ctx)
  }
})

// 路由
app.use(router.routes())
app.use(router.allowedMethods())

// 404 处理
app.use(async (ctx) => {
  ctx.status = 404
  ctx.body = {
    success: false,
    message: 'Not Found',
  }
})

export default app

