import Koa from 'koa'
import { koaBody } from 'koa-body'
import json from 'koa-json'
import cors from '@koa/cors'
import router from './routes/index.js'
import authRouter from './routes/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { httpLogger } from './middleware/httpLogger.js'
import { logger } from './utils/logger.js'

// Sentry 异常上报（可选，由 SENTRY_DSN 环境变量驱动）
const SENTRY_DSN = process.env.SENTRY_DSN
if (SENTRY_DSN) {
  import('@sentry/node')
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV ?? 'development',
        tracesSampleRate: 1.0,
      })
      logger.info('Sentry initialized')
    })
    .catch((err) => {
      logger.warn('Sentry initialization failed, skipping:', err)
    })
} else {
  logger.warn('SENTRY_DSN not set, skipping Sentry initialization')
}

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
