import Koa from 'koa'
import { koaBody } from 'koa-body'
import json from 'koa-json'
import logger from 'koa-logger'
import cors from '@koa/cors'
import serve from 'koa-static'
import path from 'path'
import router from './routes'
import localOnly from './middleware/localOnly'

const app = new Koa()

// 中间件
// 本地请求校验（必须在最前面，优先检查）
app.use(localOnly)
app.use(cors())
app.use(logger())
app.use(json())

// 使用 koa-body 替代 koa-bodyparser，支持 multipart 文件上传
app.use(koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 20 * 1024 * 1024, // 20MB
    keepExtensions: true,
  },
}))

// 静态文件服务 - 服务 uploads 目录
app.use(serve(path.resolve(__dirname, '../uploads')))

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
