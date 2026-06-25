/**
 * LangSmith Tracing 初始化
 *
 * 配置 LangSmith 环境变量以启用 LangGraph 自动 Tracing。
 * 环境变量由宿主（.env/OS）注入，本模块在服务启动时校验并记录状态。
 *
 * 必需环境变量：
 *   LANGSMITH_TRACING=true        — 启用 tracing
 *   LANGSMITH_API_KEY=ls_...      — LangSmith API Key
 *
 * 可选环境变量：
 *   LANGSMITH_PROJECT=xiangdi     — 项目名称（默认 "xiangdi"）
 *   LANGSMITH_ENDPOINT=...        — 自定义 endpoint（用于自托管）
 */
import { logger } from './logger.js'

const DEFAULT_PROJECT = 'xiangdi'

export interface LangSmithConfig {
  enabled: boolean
  project: string
  apiKeyConfigured: boolean
}

/**
 * 获取当前的 LangSmith 配置摘要（不修改任何状态）
 */
export function getLangSmithConfig(): LangSmithConfig {
  const tracingEnabled = process.env.LANGSMITH_TRACING === 'true' || process.env.LANGCHAIN_TRACING_V2 === 'true'
  return {
    enabled: tracingEnabled,
    project: process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || DEFAULT_PROJECT,
    apiKeyConfigured: !!(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY),
  }
}

/**
 * 初始化 LangSmith Tracing
 *
 * 在服务启动时调用。如果环境变量未配置，记录提示但不阻止启动。
 */
export function initLangSmithTracing(): void {
  // 设置默认 project（如果未指定）
  if (!process.env.LANGSMITH_PROJECT && !process.env.LANGCHAIN_PROJECT) {
    process.env.LANGSMITH_PROJECT = DEFAULT_PROJECT
  }

  const config = getLangSmithConfig()

  if (!config.enabled) {
    logger.info('LangSmith tracing not enabled. Set LANGSMITH_TRACING=true to enable.')
    return
  }

  if (!config.apiKeyConfigured) {
    logger.warn('LANGSMITH_TRACING=true but LANGSMITH_API_KEY is not set, traces will be discarded.')
    return
  }

  logger.info(`LangSmith tracing enabled (project="${config.project}")`)
}

/**
 * 创建带有对话上下文的 LangSmith trace 元数据
 *
 * 在每次 graph.invoke() 时使用，将 MongoDB 侧的业务 ID 注入 trace，
 * 实现 trace ↔ dialogue 的双向关联。
 */
export function createTraceMetadata(metadata: {
  appId: string
  dialogueId?: string
  mode?: string
}): Record<string, unknown> {
  return {
    appId: metadata.appId,
    ...(metadata.dialogueId ? { dialogueId: metadata.dialogueId } : {}),
    ...(metadata.mode ? { mode: metadata.mode } : {}),
  }
}
