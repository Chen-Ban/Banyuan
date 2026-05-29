/**
 * AI 接口
 *
 * 提供 SSE 流式对话的客户端封装。
 * 使用原生 EventSource 无法发送 POST body，
 * 因此改用 fetch + ReadableStream 手动解析 SSE。
 */

import { get, post, stream } from './client'
import type { ApiResponse } from './client'

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
  const res = await get<ApiResponse<ModelsResponse>>('/ai/models')
  return res.data!
}

/**
 * 切换激活的 LLM provider
 */
export async function switchModel(provider: string): Promise<{ success: boolean; activeProvider?: string; error?: string }> {
  return post<{ success: boolean; activeProvider?: string; error?: string }>('/ai/models/switch', { provider })
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
  /** 对话类型：chat=纯聊天，task=做任务（默认 task） */
  type?: 'chat' | 'task'
  /** 用户上传的图片列表 */
  images?: Array<{ url: string; alt?: string }>
  onEvent: (event: AiStreamEvent) => void
  signal?: AbortSignal
}

// ─── 图片上传（OSS 预签名直传）────────────────────────────────────────────────

export interface PresignResponse {
  signedUrl: string
  publicUrl: string
  contentType: string
}

/**
 * 获取 OSS 预签名 PUT URL（前端直传图片到 OSS）
 *
 * @param appId    应用 ID
 * @param filename 文件名（含扩展名，如 screenshot.png）
 * @returns { signedUrl, publicUrl, contentType }
 */
export async function getPresignUrl(appId: string, filename: string): Promise<PresignResponse> {
  const res = await post<ApiResponse<PresignResponse>>(`/applications/${appId}/upload/presign`, { filename })
  return res.data!
}

/**
 * 上传文件到 OSS（使用预签名 URL 直传）
 *
 * 注意：此请求发往外部 OSS 签名地址，不经过我们的后端，
 * 因此使用原生 fetch 而非 client 封装。
 *
 * @param signedUrl  预签名 PUT URL
 * @param file       要上传的文件（Blob/File）
 * @returns void（上传成功无返回值，失败抛异常）
 */
export async function uploadToOSS(signedUrl: string, file: Blob): Promise<void> {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`OSS 上传失败 (${response.status})`)
  }
}

/**
 * 完整的图片上传流程：获取预签名 → 上传到 OSS → 返回公开 URL
 *
 * @param appId 应用 ID
 * @param file  要上传的图片文件
 * @returns 图片的公开访问 URL
 */
export async function uploadImage(appId: string, file: File | Blob): Promise<string> {
  const filename = file instanceof File ? file.name : `paste_${Date.now()}.png`
  const { signedUrl, publicUrl } = await getPresignUrl(appId, filename)
  await uploadToOSS(signedUrl, file)
  return publicUrl
}

/**
 * 响应消歧选择，resolve 后端挂起的 AgentLoop
 */
export async function respondToDisambiguation(choiceId: string): Promise<void> {
  await post<ApiResponse>('/ai/disambiguation-response', { choiceId })
}

/**
 * 发起 AI 对话，通过 SSE 接收流式事件
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
 */
export async function aiChat(options: AiChatOptions): Promise<string[]> {
  const { appId, prompt, type = 'task', images = [], onEvent, signal } = options

  const response = await stream(`/ai/${appId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ prompt, type, images }),
    signal,
  })

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
