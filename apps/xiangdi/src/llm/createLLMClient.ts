import { DeepSeekClient, LLMRouter } from 'xiangdi'
import type { LLMClient } from 'xiangdi'
import { loadApiKey } from '../utils/loadApiKey.js'

/**
 * 根据环境变量组装 LLMClient
 *
 * 默认使用 DeepSeekClient 作为 primary provider，外层包裹 LLMRouter 提供：
 *   - 健康状态追踪（连续失败计数、延迟滑动窗口）
 *   - 自动重试（默认 2 次）
 *   - 路由信号发射（限额 / 超时 / 服务端错误 → 打印警告）
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY  — API Key（优先于 src/apiKey.json）
 *   DEEPSEEK_MODEL    — 模型名，默认 "deepseek-chat"
 *   DEEPSEEK_BASE_URL — API 基础 URL，默认 "https://api.deepseek.com"
 *   LLM_HIGH_LATENCY_MS        — 高延迟阈值（ms），默认 60000
 *   LLM_MAX_RETRIES            — 最大重试次数，默认 2
 *   LLM_CONSECUTIVE_FAIL_THRESHOLD — 连续失败触发信号的阈值，默认 3
 */
export async function createLLMClient(): Promise<LLMClient> {
    const apiKey = await loadApiKey()

    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
    const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
    const highLatencyMs = parseInt(process.env.LLM_HIGH_LATENCY_MS ?? '60000', 10)
    const maxRetries = parseInt(process.env.LLM_MAX_RETRIES ?? '2', 10)
    const consecutiveFailThreshold = parseInt(process.env.LLM_CONSECUTIVE_FAIL_THRESHOLD ?? '3', 10)

    const deepseek = new DeepSeekClient({ apiKey, model, baseUrl })

    return new LLMRouter({
        primary: { id: 'deepseek', client: deepseek, priority: 0 },
        onSignal: (signal) => {
            const level = signal.type === 'consecutive_failures' ? 'error' : 'warn'
            console[level](
                `[LLMRouter] signal=${signal.type} provider=${signal.providerId}` +
                ` action=${signal.suggestedAction} msg="${signal.message}"`,
            )
        },
        highLatencyThresholdMs: highLatencyMs,
        maxRetries,
        consecutiveFailureThreshold: consecutiveFailThreshold,
        autoSwitch: false,
    })
}
