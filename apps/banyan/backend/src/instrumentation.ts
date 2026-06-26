/**
 * OpenTelemetry 自动观测 — HTTP 请求 Tracing
 *
 * 在服务入口最顶部导入（先于所有其他 import），确保 OTel 在所有模块加载前初始化。
 *
 * 环境变量驱动：
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP Collector endpoint（生产环境）
 *   若未设置，降级为 ConsoleSpanExporter（开发环境）
 *
 * 本模块是可选组件：若完全不希望启用 OTel，设置 OTEL_SDK_DISABLED=true 即可。
 *
 * 注意：本模块使用 console 而非结构化 logger，因为在入口处 logger 依赖尚未初始化。
 */

const OTEL_DISABLED = process.env.OTEL_SDK_DISABLED === 'true'

if (OTEL_DISABLED) {
  // 静默跳过
} else {
  const otelInit = async () => {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node')
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node')
      const { ConsoleSpanExporter } = await import('@opentelemetry/sdk-trace-node')

      const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

      let spanExporter: unknown
      if (otlpEndpoint) {
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
        spanExporter = new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
        console.log(`[OTel] Exporting traces to OTLP: ${otlpEndpoint}/v1/traces`)
      } else {
        spanExporter = new ConsoleSpanExporter()
        console.warn('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT not set, using ConsoleSpanExporter')
      }

      const sdk = new NodeSDK({
        spanProcessors: undefined as unknown as never[],
        traceExporter: spanExporter as never,
        instrumentations: [getNodeAutoInstrumentations()],
      })

      sdk.start()

      // 优雅关闭
      const shutdown = async () => {
        try {
          await sdk.shutdown()
          console.log('[OTel] SDK shut down')
        } catch {
          /* ignore */
        }
      }
      process.on('SIGTERM', shutdown)
      process.on('SIGINT', shutdown)

      console.log('[OTel] SDK initialized')
    } catch (err) {
      console.warn('[OTel] SDK initialization failed, skipping:', err)
    }
  }

  otelInit()
}
