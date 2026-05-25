/**
 * AI 接口
 *
 * 提供 SSE 流式对话的客户端封装。
 * 使用原生 EventSource 无法发送 POST body，
 * 因此改用 fetch + ReadableStream 手动解析 SSE。
 */

const BASE_URL = '/api'

// ─── 模型管理类型 ──────────────────────────────────────────────────────────────

export interface ProviderInfo {
  provider: string
  model: string
  availableModels: string[]
  active: boolean
}

export interface ModelsResponse {
  providers: ProviderInfo[]
  activeProvider: string
}

/**
 * 获取所有可用 LLM provider 及当前激活状态
 */
export async function getModels(): Promise<ModelsResponse> {
  const response = await fetch(`${BASE_URL}/ai/models`)
  if (!response.ok) {
    throw new Error(`获取模型列表失败 (${response.status})`)
  }
  return response.json()
}

/**
 * 切换激活的 LLM provider
 */
export async function switchModel(provider: string): Promise<{ success: boolean; activeProvider?: string; error?: string }> {
  const response = await fetch(`${BASE_URL}/ai/models/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`切换模型失败 (${response.status}): ${text}`)
  }
  return response.json()
}

// ─── SSE 事件类型 ─────────────────────────────────────────────────────────────

export interface AiTextDeltaEvent {
  type: 'text_delta'
  text: string
}

export interface AiToolCallEvent {
  type: 'tool_call'
  id: string
  name: string
  input: unknown
}

export interface AiToolResultEvent {
  type: 'tool_result'
  id: string
  result: unknown
  isError: boolean
}

export interface AiPagesSnapshotEvent {
  type: 'pages_snapshot'
  pages: string[]
}

export interface SchemaFieldDef {
  name: string
  displayName: string
  type: string
  required: boolean
  defaultValue?: unknown
  refCollection?: string
  enumValues?: string[]
}

export interface SchemaCollectionDef {
  name: string
  displayName: string
  fields: SchemaFieldDef[]
}

/** AI 调用 schema_set_collections 后，banyan 后端透传此事件给前端 */
export interface AiSchemaUpdateEvent {
  type: 'schema_update'
  collections: SchemaCollectionDef[]
}

export interface AiDoneEvent {
  type: 'done'
  pages: string[]
}

export interface AiErrorEvent {
  type: 'error'
  message: string
}

// ─── 消歧选项类型 ─────────────────────────────────────────────────────────────

export interface DisambiguationOption {
  id: string
  description: string
  expectedEffect: string
}

export interface DisambiguationOptions {
  conflictContext: string
  options: DisambiguationOption[]
}

export interface AiDisambiguationEvent {
  type: 'disambiguation'
  options: DisambiguationOptions
}

export type AiStreamEvent =
  | AiTextDeltaEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | AiPagesSnapshotEvent
  | AiSchemaUpdateEvent
  | AiDisambiguationEvent
  | AiDoneEvent
  | AiErrorEvent

// ─── SSE 流式对话 ─────────────────────────────────────────────────────────────

export interface AiChatOptions {
  appId: string
  prompt: string
  /** 当前内存中的 pages（从前端传入，AI 操作最新状态，而非 DB 快照） */
  pages: string[]
  /** 当前 Schema（从 DatabasePage 收集，可选） */
  schema?: SchemaCollectionDef[]
  /** 当前云函数列表（从 FunctionsPage 收集，可选） */
  cloudFunctions?: Array<{
    functionId: string
    name: string
    displayName?: string
    description?: string
    flowSchema?: Record<string, unknown>
  }>
  onEvent: (event: AiStreamEvent) => void
  signal?: AbortSignal
}

/**
 * 响应消歧选择，resolve 后端挂起的 AgentLoop
 */
export async function respondToDisambiguation(choiceId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/ai/disambiguation-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choiceId }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`消歧响应失败 (${response.status}): ${text}`)
  }
}

/**
 * 发起 AI 对话，通过 SSE 接收流式事件
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
 */
export async function aiChat(options: AiChatOptions): Promise<string[]> {
  const { appId, prompt, pages, schema, cloudFunctions, onEvent, signal } = options

  // 构建请求体：pages 必传，schema/cloudFunctions 有值才传
  const requestBody: Record<string, unknown> = { prompt, pages }
  if (schema && schema.length > 0) requestBody.schema = schema
  if (cloudFunctions && cloudFunctions.length > 0) requestBody.cloudFunctions = cloudFunctions

  const response = await fetch(`${BASE_URL}/ai/${appId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`AI 请求失败 (${response.status}): ${text}`)
  }

  if (!response.body) {
    throw new Error('响应体为空，无法读取 SSE 流')
  }

  return new Promise<string[]>((resolve, reject) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    function parseSSEChunk(chunk: string): void {
      // SSE 格式：每个事件由 "event: xxx\ndata: yyy\n\n" 组成
      const events = (buffer + chunk).split('\n\n')
      buffer = events.pop() ?? ''

      for (const eventStr of events) {
        if (!eventStr.trim()) continue

        let eventType = ''
        let dataStr = ''

        for (const line of eventStr.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6).trim()
          }
        }

        if (!eventType || !dataStr) continue

        try {
          const data = JSON.parse(dataStr)

          switch (eventType) {
            case 'text_delta':
              onEvent({ type: 'text_delta', text: data.text ?? '' })
              break
            case 'tool_call':
              onEvent({ type: 'tool_call', id: data.id, name: data.name, input: data.input })
              break
            case 'tool_result':
              onEvent({ type: 'tool_result', id: data.id, result: data.result, isError: data.isError ?? false })
              break
            case 'pages_snapshot':
              onEvent({ type: 'pages_snapshot', pages: data.pages ?? [] })
              break
            case 'schema_update':
              onEvent({ type: 'schema_update', collections: (data as AiSchemaUpdateEvent).collections ?? [] })
              break
            case 'disambiguation':
              onEvent({ type: 'disambiguation', options: data as DisambiguationOptions })
              break
            case 'done':
              onEvent({ type: 'done', pages: data.pages ?? [] })
              resolve(data.pages ?? [])
              break
            case 'error':
              onEvent({ type: 'error', message: data.message ?? '未知错误' })
              reject(new Error(data.message ?? '未知错误'))
              break
          }
        } catch {
          // 忽略解析失败的事件
        }
      }
    }

    async function pump(): Promise<void> {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          parseSSEChunk(decoder.decode(value, { stream: true }))
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          reject(err)
        }
      }
    }

    pump()
  })
}
