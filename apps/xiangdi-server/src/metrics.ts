/**
 * Metrics 指标模块
 *
 * 基于 prom-client 的 Prometheus 指标定义。
 * 覆盖 HTTP 请求层 + Agent 执行层 + LLM Provider 层。
 *
 * 暴露 /metrics 端点供 Prometheus 抓取。
 */
import client from 'prom-client'

// ─── Registry ─────────────────────────────────────────────────────────────────

const register = new client.Registry()
client.collectDefaultMetrics({ register })

// ─── HTTP 请求指标 ────────────────────────────────────────────────────────────

export const httpRequestDuration = new client.Histogram({
  name: 'xiangdi_http_request_duration_ms',
  help: 'HTTP 请求耗时分布（毫秒）',
  labelNames: ['method', 'path', 'status_code'] as const,
  buckets: [50, 100, 200, 500, 1000, 3000, 5000, 10000],
  registers: [register],
})

export const httpRequestTotal = new client.Counter({
  name: 'xiangdi_http_requests_total',
  help: 'HTTP 请求总数',
  labelNames: ['method', 'path', 'status_code'] as const,
  registers: [register],
})

// ─── Agent 执行指标 ───────────────────────────────────────────────────────────

export const agentRunTotal = new client.Counter({
  name: 'xiangdi_agent_runs_total',
  help: 'Agent 执行总次数',
  labelNames: ['mode', 'status'] as const, // mode=chat|task, status=completed|failed|interrupted
  registers: [register],
})

export const agentRunDuration = new client.Histogram({
  name: 'xiangdi_agent_run_duration_ms',
  help: 'Agent 执行耗时分布（毫秒）',
  labelNames: ['mode'] as const,
  buckets: [1000, 5000, 15000, 30000, 60000, 120000, 300000],
  registers: [register],
})

// ─── LLM Provider 指标 ───────────────────────────────────────────────────────

export const providerSwitchTotal = new client.Counter({
  name: 'xiangdi_provider_switches_total',
  help: 'LLM Provider 切换次数',
  labelNames: ['from', 'to'] as const,
  registers: [register],
})

// ─── 导出 ─────────────────────────────────────────────────────────────────────

/**
 * 获取 Prometheus 格式的 metrics 文本（用于 /metrics 端点）
 */
export async function getMetrics(): Promise<string> {
  return register.metrics()
}
