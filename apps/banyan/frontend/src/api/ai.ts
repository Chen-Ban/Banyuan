/**
 * AI 接口
 *
 * 提供 SSE 流式对话的客户端封装。
 * 使用原生 EventSource 无法发送 POST body，
 * 因此改用 fetch + ReadableStream 手动解析 SSE。
 */

const BASE_URL = '/api'

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

export interface AiDoneEvent {
  type: 'done'
  pages: string[]
}

export interface AiErrorEvent {
  type: 'error'
  message: string
}

export type AiStreamEvent =
  | AiTextDeltaEvent
  | AiToolCallEvent
  | AiToolResultEvent
  | AiDoneEvent
  | AiErrorEvent

// ─── SSE 流式对话 ─────────────────────────────────────────────────────────────

export interface AiChatOptions {
  appId: string
  prompt: string
  onEvent: (event: AiStreamEvent) => void
  signal?: AbortSignal
}

/**
 * 发起 AI 对话，通过 SSE 接收流式事件
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
 */
export async function aiChat(options: AiChatOptions): Promise<string[]> {
  const { appId, prompt, onEvent, signal } = options

  const response = await fetch(`${BASE_URL}/ai/${appId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
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
