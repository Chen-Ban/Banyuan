import { DeepSeekClient, KimiClient, LLMRouter } from '@banyuan/xiangdi-agent'
import type { LLMClient, RoutingSignal } from '@banyuan/xiangdi-agent'
import { loadApiKey } from '../utils/loadApiKey.js'
import { logger } from '../logger.js'

/**
 * 根据环境变量组装 LLMClient
 *
 * 支持的 provider（通过 LLM_PROVIDER 环境变量切换）：
 *   deepseek（默认）— DeepSeek OpenAPI，baseURL: https://api.deepseek.com
 *   kimi            — Moonshot AI OpenAPI，baseURL: https://api.moonshot.ai/v1
 *
 * 环境变量：
 *   LLM_PROVIDER      — 当前激活的 provider，默认 "deepseek"
 *
 *   DEEPSEEK_API_KEY  — DeepSeek API Key（优先于 src/apiKey.json）
 *   DEEPSEEK_MODEL    — DeepSeek 模型名，默认 "deepseek-v4-pro"
 *   DEEPSEEK_BASE_URL — DeepSeek API 基础 URL，默认 "https://api.deepseek.com"
 *
 *   KIMI_API_KEY      — Kimi API Key（优先于 src/apiKey.json 中的 kimiApiKey）
 *   KIMI_MODEL        — Kimi 模型名，默认 "kimi-k2.6"
 *   KIMI_BASE_URL     — Kimi API 基础 URL，默认 "https://api.moonshot.ai/v1"
 *
 *   LLM_HIGH_LATENCY_MS             — 高延迟阈值（ms），默认 60000
 *   LLM_CONSECUTIVE_FAIL_THRESHOLD  — 连续失败触发信号的阈值，默认 3
 */

// ─── 可用 provider 描述（用于 GET /models 接口）────────────────────────────────

export interface ModelInfo {
  /** provider 唯一标识 */
  provider: string
  /** 当前激活的模型名 */
  model: string
  /** 该 provider 支持的模型列表 */
  availableModels: string[]
  /** 是否为当前激活的 provider */
  active: boolean
}

export const PROVIDER_CATALOG: Record<string, { defaultModel: string; availableModels: string[] }> = {
  deepseek: {
    defaultModel: 'deepseek-v4-pro',
    availableModels: ['deepseek-v4-pro'],
  },
  kimi: {
    defaultModel: 'kimi-k2.6',
    availableModels: ['kimi-k2.6'],
  },
}

// ─── 全局 LLMRouter 单例（跨请求共享，支持运行时切换）────────────────────────

let _router: LLMRouter | null = null

/**
 * 获取（或初始化）全局 LLMRouter 单例
 *
 * 首次调用时根据环境变量构建所有已配置的 provider，
 * 后续调用直接返回已有实例（支持运行时通过 router.switchTo() 切换）。
 */
export async function getLLMRouter(): Promise<LLMRouter> {
  if (_router) return _router

  const highLatencyMs = parseInt(process.env.LLM_HIGH_LATENCY_MS ?? '60000', 10)
  const consecutiveFailThreshold = parseInt(process.env.LLM_CONSECUTIVE_FAIL_THRESHOLD ?? '3', 10)

  // ── 构建 DeepSeek provider ──────────────────────────────────────────────
  const deepseekApiKey = await loadApiKey('deepseek')
  const deepseekModel = process.env.DEEPSEEK_MODEL ?? PROVIDER_CATALOG.deepseek.defaultModel
  const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
  const deepseek = new DeepSeekClient({
    apiKey: deepseekApiKey,
    model: deepseekModel,
    baseUrl: deepseekBaseUrl,
  })

  // ── 构建 Kimi provider ──────────────────────────────────────────────────
  // required=false：Kimi 是可选 provider，未配置 key 时不报错，切换时才会失败
  const kimiApiKey = await loadApiKey('kimi', false)
  const kimiModel = process.env.KIMI_MODEL ?? PROVIDER_CATALOG.kimi.defaultModel
  const kimiBaseUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1'
  const kimi = new KimiClient({
    apiKey: kimiApiKey,
    model: kimiModel,
    baseUrl: kimiBaseUrl,
  })

  // ── 确定初始激活 provider ───────────────────────────────────────────────
  const initialProvider = process.env.LLM_PROVIDER ?? 'deepseek'

  _router = new LLMRouter({
    primary: { id: 'deepseek', client: deepseek, priority: 0 },
    fallbacks: [{ id: 'kimi', client: kimi, priority: 1 }],
    onSignal: (signal: RoutingSignal) => {
      if (signal.type === 'consecutive_failures') {
        logger.error('LLMRouter signal', undefined, {
          signalType: signal.type,
          provider: signal.providerId,
          action: signal.suggestedAction,
          message: signal.message,
          timestamp: signal.timestamp,
        })
      } else {
        logger.warn('LLMRouter signal', {
          signalType: signal.type,
          provider: signal.providerId,
          action: signal.suggestedAction,
          message: signal.message,
          timestamp: signal.timestamp,
        })
      }
    },
    highLatencyThresholdMs: highLatencyMs,
    consecutiveFailureThreshold: consecutiveFailThreshold,
    autoSwitch: false,
  })

  // 若初始 provider 不是 deepseek，立即切换
  if (initialProvider !== 'deepseek') {
    _router.switchTo(initialProvider)
  }

  return _router
}

/**
 * 获取（或初始化）LLMClient（对外兼容接口，返回 LLMRouter 实例）
 */
export async function createLLMClient(): Promise<LLMClient> {
  return getLLMRouter()
}

/**
 * 获取当前所有 provider 的模型信息（用于 GET /models 接口）
 */
export async function getModelsInfo(): Promise<ModelInfo[]> {
  const router = await getLLMRouter()
  const activeId = router.getActiveProviderId()

  return Object.entries(PROVIDER_CATALOG).map(([provider, catalog]) => ({
    provider,
    model: getActiveModelForProvider(provider),
    availableModels: catalog.availableModels,
    active: provider === activeId,
  }))
}

/**
 * 切换当前激活的 provider（用于 POST /models/switch 接口）
 * 返回切换是否成功
 */
export async function switchProvider(providerId: string): Promise<boolean> {
  if (!PROVIDER_CATALOG[providerId]) return false
  const router = await getLLMRouter()
  return router.switchTo(providerId)
}

// ─── 内部工具 ──────────────────────────────────────────────────────────────────

function getActiveModelForProvider(provider: string): string {
  switch (provider) {
    case 'deepseek':
      return process.env.DEEPSEEK_MODEL ?? PROVIDER_CATALOG.deepseek.defaultModel
    case 'kimi':
      return process.env.KIMI_MODEL ?? PROVIDER_CATALOG.kimi.defaultModel
    default:
      return PROVIDER_CATALOG[provider]?.defaultModel ?? 'unknown'
  }
}
