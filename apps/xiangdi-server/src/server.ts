import app from './app'
import { startCheckpointCleanup, stopCheckpointCleanup } from './checkpoint/cleanup.js'
import { closeCheckpointer } from './checkpoint/index.js'
import { logger } from './logger.js'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002

const server = app.listen(PORT, () => {
    logger.info('XiangDi Server started', {
        port: PORT,
        endpoints: [
            'POST /ai/run',
            'POST /ai/resume',
            'GET  /ai/thread/:threadId/status',
        ],
    })

    // 启动 checkpoint 过期清理定时任务
    startCheckpointCleanup()
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
        stopCheckpointCleanup()
        await closeCheckpointer()
        logger.info('Checkpoint resources released')
    } catch (err) {
        logger.error('Error during checkpoint cleanup', err)
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
