import './instrumentation.js'

import 'dotenv/config'

// 设置服务名称，日志模块会在 import 时读取
process.env.SERVICE_NAME = process.env.SERVICE_NAME ?? 'banyan-backend'

import http from 'http'
import app from './app'
import { connectDatabase } from './config/database'
import { agentGateway } from './services/AgentGateway.js'
import { seedBuiltinMaterials } from './seeds/builtinMaterials.js'
import { seedPlans } from './seeds/seedPlans.js'
import { logger } from './utils/logger.js'
import { startCronJobs, stopCronJobs } from './cron/index.js'

const PORT = process.env.PORT || 3001

async function startServer() {
  try {
    await connectDatabase()
    logger.info('MongoDB connected')

    // Seed 内置物料（重建内置物料集合，不做向后兼容）
    const seeded = await seedBuiltinMaterials()
    logger.info(`Builtin materials seeded (${seeded} items)`)

    const seededPlans = await seedPlans()
    logger.info(`Builtin plans seeded (${seededPlans} plans)`)

    // 创建 HTTP server 并附加 WebSocket 网关（ADR-028）
    const server = http.createServer(app.callback())
    agentGateway.attach(server)
    logger.info('AgentGateway WebSocket attached at /ws/agent')

    server.listen(PORT, () => {
      logger.info(`Banyan server is running on http://localhost:${PORT}`)
    })

    // 启动定时任务（月度账单生成等）
    startCronJobs()

    // 优雅关闭
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`)
      stopCronJobs()
      server.close(() => {
        logger.info('HTTP server closed')
        process.exit(0)
      })
      // 强制超时退出
      setTimeout(() => {
        logger.error('Forced shutdown after 10s timeout')
        process.exit(1)
      }, 10_000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error('Failed to start server', error)
    process.exit(1)
  }
}

startServer()
