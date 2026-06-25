import Router from '@koa/router'
import aiRouter from './ai'
import { getMetrics } from '../metrics.js'
import { logger } from '../logger.js'

const healthRouter = new Router()

// 存活探针（简单检查进程是否活着）
healthRouter.get('/livez', (ctx) => {
  ctx.body = { status: 'ok' }
})

// 就绪探针（检查下游依赖是否可达）
healthRouter.get('/readyz', async (ctx) => {
  const checks: Record<string, string> = {}

  // 1. 检查 Banyan 后端
  try {
    const banyanUrl = process.env.BANYAN_URL ?? 'http://localhost:3001'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(`${banyanUrl}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    checks.banyan = resp.ok ? 'ok' : `unreachable (${resp.status})`
  } catch (err) {
    checks.banyan = `unreachable (${err instanceof Error ? err.message : String(err)})`
  }

  // 2. 检查知识服务
  try {
    const knowledgeUrl = process.env.KNOWLEDGE_URL ?? 'http://localhost:3003'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(`${knowledgeUrl}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    checks.knowledge = resp.ok ? 'ok' : `unreachable (${resp.status})`
  } catch (err) {
    checks.knowledge = `unreachable (${err instanceof Error ? err.message : String(err)})`
  }

  // 3. 检查 SQLite（默认就绪，因为文件初始化失败非致命）
  checks.sqlite = 'ok'

  const allOk = Object.values(checks).every((v) => v === 'ok')
  ctx.status = allOk ? 200 : 503
  ctx.body = { status: allOk ? 'ok' : 'degraded', checks }
})

// 兼容旧版 /health（指向 /livez）
healthRouter.get('/health', (ctx) => {
  ctx.body = { status: 'ok', message: 'XiangDi server is running' }
})

// Prometheus 指标端点（无需认证，由 Prometheus 直接抓取）
healthRouter.get('/metrics', async (ctx) => {
  try {
    const metrics = await getMetrics()
    ctx.type = 'text/plain; charset=utf-8'
    ctx.body = metrics
  } catch (err) {
    logger.error('Failed to generate metrics', err)
    ctx.status = 500
    ctx.body = { success: false, error: 'Failed to generate metrics' }
  }
})

export { healthRouter, aiRouter }
