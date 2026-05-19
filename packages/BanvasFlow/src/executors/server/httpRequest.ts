import type { NodeExecutor } from '../registry.js'
import type { FlowHttpRequestNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

export const httpRequestExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowHttpRequestNode

  const url = resolve(n.url) as string

  // 解析 headers
  const headers: Record<string, string> = {}
  if (n.headers) {
    for (const [key, val] of Object.entries(n.headers)) {
      headers[key] = String(resolve(val as FlowValue))
    }
  }

  // 解析 body
  const body = n.body ? resolve(n.body) : undefined

  const httpClient = ctx.env.httpClient as {
    request: (options: {
      url: string
      method: string
      headers?: Record<string, string>
      body?: unknown
    }) => Promise<unknown>
  } | undefined

  if (!httpClient) {
    // 降级使用 fetch（Node 18+）
    const fetchFn = globalThis.fetch
    if (!fetchFn) {
      console.warn('[httpRequest] ctx.env.httpClient 未注入且无 fetch，跳过')
      return
    }

    const resp = await fetchFn(url, {
      method: n.method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    })

    const contentType = resp.headers.get('content-type') ?? ''
    const result = contentType.includes('application/json')
      ? await resp.json()
      : await resp.text()

    ctx.setVariable('local', n.outputVariable, result)
    return
  }

  const result = await httpClient.request({
    url,
    method: n.method,
    headers,
    body,
  })

  ctx.setVariable('local', n.outputVariable, result)
}
