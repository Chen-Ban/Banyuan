import app from './app'
import { getStore } from './checkpoint/index.js'
import { logger } from './logger.js'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002

const server = app.listen(PORT, () => {
  logger.info('XiangDi Server started', {
    port: PORT,
    endpoints: ['POST /ai/run', 'POST /ai/resume', 'GET  /ai/thread/:threadId/status'],
  })

  // 启动 CheckpointStore（含 TTL 清理定时任务）
  const store = getStore()
  store.start()
  logger.info(`CheckpointStore backend: ${store.backend}`)
})

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info(`Received ${signal}, starting graceful shutdown...`)

  // 1. 停止接受新连接
  server.close(() => {
    logger.info('HTTP server closed, no longer accepting connections')
  })

  // 2. 等待现有连接排空（最多 30s）
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout (30s), forcing close')
      resolve()
    }, 30_000)
    timeout.unref()

    server.on('close', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  // 3. 清理资源
  try {
    await getStore().stop()
    logger.info('CheckpointStore stopped')
  } catch (err) {
    logger.error('Error stopping CheckpointStore', err)
  }

  logger.info('Graceful shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// 安全网：35s 后强制退出（防止 shutdown 卡死）
const FORCE_EXIT_TIMEOUT = 35_000
process.on('SIGTERM', () => {
  const timer = setTimeout(() => {
    logger.error('Forced exit after 35s timeout')
    process.exit(1)
  }, FORCE_EXIT_TIMEOUT)
  timer.unref()
})
