import Koa from 'koa'
import { koaBody } from 'koa-body'
import json from 'koa-json'
import cors from '@koa/cors'
import router from './routes'
import authRouter from './routes/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { httpLogger } from './middleware/httpLogger.js'

const app = new Koa()

// 中间件
app.use(cors())
app.use(httpLogger)
app.use(json())

// 使用 koa-body 替代 koa-bodyparser，支持 multipart 文件上传
app.use(
  koaBody({
    multipart: true,
    formidable: {
      maxFileSize: 20 * 1024 * 1024, // 20MB
      keepExtensions: true,
    },
  }),
)

// 全局错误处理中间件（统一结构化 ErrorPayload 响应）
app.use(errorHandler())

// 路由
app.use(authRouter.routes())
app.use(authRouter.allowedMethods())
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
