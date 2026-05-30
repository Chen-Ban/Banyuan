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

export interface AiAppSnapshotEvent {
  type: 'app_snapshot'
  appJSON: string
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
  appJSON: string
}

export interface AiErrorEvent {
  type: 'error'
  message: string
}

// ─── interrupt 事件（humanGate 方案确认）────────────────────────────────────────

export interface PlanTask {
  taskId: string
  description: string
}

export interface AiInterruptEvent {
  type: 'interrupt'
  threadId: string
  node: string
  value: {
    type: 'humanGate'
    planDescription: string
    intentSummary: string
    tasks: PlanTask[]
  } | null
}

// ─── Planning Progress 事件（Multi-Agent 规划进度）────────────────────────────

/** Agent 角色 */
export type AgentRole = 'pm' | 'arch' | 'visual' | 'task'

/** 规划进度事件 — 某 SubAgent 完成后 XiangDi 推送 */
export interface AiPlanningProgressEvent {
  type: 'planning_progress'
  agent: AgentRole
  /** Agent 推理过程摘要 */
  reasoning?: string
  /** 结构化产出（JSON） */
  output: unknown
  /** Token 用量 */
  tokenUsage: { input: number; output: number }
  /** 耗时（ms） */
  durationMs: number
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
  | AiAppSnapshotEvent
  | AiSchemaUpdateEvent
  | AiPlanningProgressEvent
  | AiDisambiguationEvent
  | AiInterruptEvent
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

// ─── Resume（方案确认后恢复执行）──────────────────────────────────────────────

export interface AiResumeOptions {
  appId: string
  /** 对话 ID（可选，未传时后端自动查找最近 pending dialogue） */
  dialogueId?: string
  /** 用户对 interrupt 的响应值（如 { approved: true } 或 { approved: false, feedback: '...' }） */
  resumeValue?: unknown
  onEvent: (event: AiStreamEvent) => void
  signal?: AbortSignal
}

/**
 * 恢复被 interrupt 暂停的 AI 执行（方案确认后继续）
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
 */
export async function aiResume(options: AiResumeOptions): Promise<string> {
  const { appId, dialogueId, resumeValue, onEvent, signal } = options

  const body: Record<string, unknown> = {}
  if (dialogueId) body.dialogueId = dialogueId
  if (resumeValue !== undefined) body.resumeValue = resumeValue

  const response = await stream(`/ai/${appId}/resume`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })

  if (!response.body) {
    throw new Error('响应体为空，无法读取 SSE 流')
  }

  return new Promise<string>((resolve, reject) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      reader.cancel().catch(() => { /* 忽略 cancel 本身的错误 */ })
      fn()
    }

    function parseSSEChunk(chunk: string): void {
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
            if (!dataStr) dataStr = line.slice(6).trim()
          }
        }

        if (!eventType || !dataStr) continue

        let data: unknown
        try {
          data = JSON.parse(dataStr)
        } catch (parseErr) {
          console.warn('[aiResume] SSE JSON 解析失败', { eventType, dataStr, parseErr })
          continue
        }

        switch (eventType) {
          case 'text_delta':
            onEvent({ type: 'text_delta', text: (data as { text?: string }).text ?? '' })
            break
          case 'tool_call':
            onEvent({
              type: 'tool_call',
              id: (data as { id: string }).id,
              name: (data as { name: string }).name,
              input: (data as { input: unknown }).input,
            })
            break
          case 'tool_result':
            onEvent({
              type: 'tool_result',
              id: (data as { id: string }).id,
              result: (data as { result: unknown }).result,
              isError: (data as { isError?: boolean }).isError ?? false,
            })
            break
          case 'app_snapshot':
            onEvent({ type: 'app_snapshot', appJSON: (data as { appJSON?: string }).appJSON ?? '' })
            break
          case 'schema_update':
            onEvent({ type: 'schema_update', collections: (data as AiSchemaUpdateEvent).collections ?? [] })
            break
          case 'planning_progress':
            onEvent({
              type: 'planning_progress',
              agent: (data as { agent: AgentRole }).agent,
              reasoning: (data as { reasoning?: string }).reasoning,
              output: (data as { output: unknown }).output,
              tokenUsage: (data as { tokenUsage: { input: number; output: number } }).tokenUsage,
              durationMs: (data as { durationMs: number }).durationMs,
            })
            break
          case 'interrupt':
            onEvent({ type: 'interrupt', threadId: (data as { threadId: string }).threadId, node: (data as { node: string }).node, value: (data as { value: unknown }).value as AiInterruptEvent['value'] })
            break
          case 'done': {
            const appJSON = (data as { appJSON?: string }).appJSON ?? ''
            onEvent({ type: 'done', appJSON })
            settle(() => resolve(appJSON))
            break
          }
          case 'error': {
            const message = (data as { message?: string }).message ?? '未知错误'
            onEvent({ type: 'error', message })
            settle(() => reject(new Error(message)))
            break
          }
        }

        if (settled) return
      }
    }

    async function pump(): Promise<void> {
      try {
        while (!settled) {
          const { done, value } = await reader.read()
          if (done) break
          parseSSEChunk(decoder.decode(value, { stream: true }))
        }
        settle(() => resolve(''))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          settle(() => resolve(''))
        } else {
          settle(() => reject(err as Error))
        }
      }
    }

    pump()
  })
}

/**
 * 发起 AI 对话，通过 SSE 接收流式事件
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
 *
 * 修复要点：
 *   1. pump() 结束（stream EOF）时若既无 done 也无 error，兜底 resolve([])，防止 Promise 永久悬空
 *   2. 捕获 AbortError 时主动 reader.cancel() 释放底层 ReadableStream 锁
 *   3. 每次解析到 done/error 后立即 reader.cancel() 关闭上游流，避免持续占用网络连接
 */
export async function aiChat(options: AiChatOptions): Promise<string> {
  const { appId, prompt, type = 'task', images = [], onEvent, signal } = options

  const response = await stream(`/ai/${appId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ prompt, type, images }),
    signal,
  })

  if (!response.body) {
    throw new Error('响应体为空，无法读取 SSE 流')
  }

  return new Promise<string>((resolve, reject) => {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // 标记是否已经通过 done/error 事件完成了 Promise，防止重复 settle
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      // 关闭流：不再需要后续数据
      reader.cancel().catch(() => { /* 忽略 cancel 本身的错误 */ })
      fn()
    }

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
            // 取第一行 data，多行 data（罕见）取首行
            if (!dataStr) dataStr = line.slice(6).trim()
          }
        }

        if (!eventType || !dataStr) continue

        let data: unknown
        try {
          data = JSON.parse(dataStr)
        } catch (parseErr) {
          console.warn('[aiChat] SSE JSON 解析失败', { eventType, dataStr, parseErr })
          continue
        }

        switch (eventType) {
          case 'text_delta':
            onEvent({ type: 'text_delta', text: (data as { text?: string }).text ?? '' })
            break
          case 'tool_call':
            onEvent({
              type: 'tool_call',
              id: (data as { id: string }).id,
              name: (data as { name: string }).name,
              input: (data as { input: unknown }).input,
            })
            break
          case 'tool_result':
            onEvent({
              type: 'tool_result',
              id: (data as { id: string }).id,
              result: (data as { result: unknown }).result,
              isError: (data as { isError?: boolean }).isError ?? false,
            })
            break
          case 'app_snapshot':
            onEvent({ type: 'app_snapshot', appJSON: (data as { appJSON?: string }).appJSON ?? '' })
            break
          case 'schema_update':
            onEvent({ type: 'schema_update', collections: (data as AiSchemaUpdateEvent).collections ?? [] })
            break
          case 'disambiguation':
            onEvent({ type: 'disambiguation', options: data as DisambiguationOptions })
            break
          case 'planning_progress':
            onEvent({
              type: 'planning_progress',
              agent: (data as { agent: AgentRole }).agent,
              reasoning: (data as { reasoning?: string }).reasoning,
              output: (data as { output: unknown }).output,
              tokenUsage: (data as { tokenUsage: { input: number; output: number } }).tokenUsage,
              durationMs: (data as { durationMs: number }).durationMs,
            })
            break
          case 'interrupt':
            onEvent({ type: 'interrupt', threadId: (data as { threadId: string }).threadId, node: (data as { node: string }).node, value: (data as { value: unknown }).value as AiInterruptEvent['value'] })
            break
          case 'done': {
            const appJSON = (data as { appJSON?: string }).appJSON ?? ''
            onEvent({ type: 'done', appJSON })
            settle(() => resolve(appJSON))
            break
          }
          case 'error': {
            const message = (data as { message?: string }).message ?? '未知错误'
            onEvent({ type: 'error', message })
            settle(() => reject(new Error(message)))
            break
          }
        }

        // 一旦 settled，停止解析后续事件
        if (settled) return
      }
    }

    async function pump(): Promise<void> {
      try {
        while (!settled) {
          const { done, value } = await reader.read()
          if (done) break
          parseSSEChunk(decoder.decode(value, { stream: true }))
        }
        // 流正常结束（EOF）但未收到 done/error 事件 → 兜底 resolve
        // 常见于服务端正常关闭连接但漏发 done，或被 abort 提前终止
        settle(() => resolve(''))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // 用户主动取消，兜底 resolve（不报错）
          settle(() => resolve(''))
        } else {
          settle(() => reject(err as Error))
        }
      }
    }

    pump()
  })
}
