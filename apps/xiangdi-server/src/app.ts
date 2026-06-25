/**
 * XiangDi HTTP 服务
 *
 * 将 XiangDi AI Agent 引擎封装为独立 HTTP 服务，对外提供：
 *   GET  /health  — 健康检查
 *   POST /ai/run  — 接收 { appId, prompt }，以 SSE 流式返回 Agent 执行进度
 *
 * 架构定位：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *
 * 本服务无状态：Agent 通过 BanyanClient 按需拉取 UI 定义 JSON，最终 UI 定义 JSON 随 done 事件返回，
 * 不访问 MongoDB，持久化由 banyan 后端负责。
 */

import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './middleware/logger'
import { internalAuth } from './middleware/auth'
import { healthRouter, aiRouter } from './routes'
import { logger as structuredLogger } from './logger.js'

const app = new Koa()

// 全局错误处理
app.on('error', (err, ctx) => {
  structuredLogger.error('[XiangDi Server] Unhandled error', err, {
    url: ctx?.url,
    method: ctx?.method,
  })
})

// 中间件
app.use(errorHandler)
app.use(logger)
app.use(cors())
app.use(
  koaBody({
    jsonLimit: '20mb', // appJSON 可能较大
    formLimit: '1mb',
    textLimit: '1mb',
  }),
)
app.use(internalAuth)

// 路由
app.use(healthRouter.routes())
app.use(healthRouter.allowedMethods())
app.use(aiRouter.routes())
app.use(aiRouter.allowedMethods())

export default app
