#!/usr/bin/env node

/**
 * Deploy Agent CLI 入口
 * 从环境变量读取配置并启动 Agent
 */

import type { AgentConfig } from './types.js'
import { DeployAgent } from './DeployAgent.js'

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[DeployAgent] Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue
}

const config: AgentConfig = {
  agentToken: getRequiredEnv('AGENT_TOKEN'),
  tenantId: getRequiredEnv('TENANT_ID'),
  backendWsUrl: getRequiredEnv('BACKEND_WS_URL'),
  deployRoot: getOptionalEnv('DEPLOY_ROOT', '/opt/banyuan/apps'),
  nginxSitesDir: getOptionalEnv('NGINX_SITES_DIR', '/etc/nginx/sites-enabled'),
}

const agent = new DeployAgent(config)

// 优雅退出
function shutdown(signal: string): void {
  console.log(`[DeployAgent] Received ${signal}, shutting down...`)
  agent.disconnect()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  console.error('[DeployAgent] Uncaught exception:', err)
  agent.disconnect()
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[DeployAgent] Unhandled rejection:', reason)
})

// 启动
console.log('[DeployAgent] Starting...')
console.log(`[DeployAgent] Tenant: ${config.tenantId}`)
console.log(`[DeployAgent] Backend: ${config.backendWsUrl}`)
console.log(`[DeployAgent] Deploy Root: ${config.deployRoot}`)
console.log(`[DeployAgent] Nginx Sites: ${config.nginxSitesDir}`)

agent.connect().catch((err) => {
  console.error('[DeployAgent] Failed to start:', err)
  process.exit(1)
})
