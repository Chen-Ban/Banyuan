/**
 * AI 接口（ADR-041 Orchestrator 架构）
 *
 * 提供 SSE 流式对话的客户端封装。
 * 使用原生 EventSource 无法发送 POST body，
 * 因此改用 fetch + ReadableStream 手动解析 SSE。
 *
 * SSE 事件协议（ADR-041 Orchestrator 统一事件）：
 *   started / phase_change / agent_progress / tool_activity / audit_progress
 *   text_delta / done / error
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

// ─── SSE 事件类型（ADR-041 Orchestrator 协议）─────────────────────────────────

/** 流式文本增量 */
export interface AiTextDeltaEvent {
  type: 'text_delta'
  delta: string
}

/** 阶段变更 */
export interface AiPhaseChangeEvent {
  type: 'phase_change'
  from: string
  to: string
  timestamp: number
}

/** SubAgent 进度 */
export interface AiAgentProgressEvent {
  type: 'agent_progress'
  agent: string
  status: 'started' | 'completed' | 'error'
  message: string
  timestamp: number
}

/** 工具活动 */
export interface AiToolActivityEvent {
  type: 'tool_activity'
  agent: string
  tool: string
  status: 'started' | 'completed' | 'error'
  inputSummary?: string
  outputSummary?: string
  error?: string
  timestamp: number
}

/** 审计进度 */
export interface AiAuditProgressEvent {
  type: 'audit_progress'
  status: 'started' | 'passed' | 'failed'
  message?: string
  timestamp: number
}

/** 完成事件 */
export interface AiDoneEvent {
  type: 'done'
  finalPhase: string
  summary: string
  artifacts?: {
    pagesModified: string[]
    collectionsModified: string[]
    functionsModified: string[]
  }
  timestamp: number
}

/** 错误事件 */
export interface AiErrorEvent {
  type: 'error'
  message: string
  code?: string
}

/** 流开始事件 */
export interface AiStartedEvent {
  type: 'started'
  threadId: string
}

export type AiStreamEvent =
  | AiTextDeltaEvent
  | AiPhaseChangeEvent
  | AiAgentProgressEvent
  | AiToolActivityEvent
  | AiAuditProgressEvent
  | AiDoneEvent
  | AiErrorEvent
  | AiStartedEvent

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
 * 获取 OSS 预签名 PUT URL
 */
export async function getPresignUrl(appId: string, filename: string): Promise<PresignResponse> {
  const res = await post<ApiResponse<PresignResponse>>(`/applications/${appId}/upload/presign`, { filename })
  return res.data!
}

/**
 * 上传文件到 OSS
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
 */
export async function uploadImage(appId: string, file: File | Blob): Promise<string> {
  const filename = file instanceof File ? file.name : `paste_${Date.now()}.png`
  const { signedUrl, publicUrl } = await getPresignUrl(appId, filename)
  await uploadToOSS(signedUrl, file)
  return publicUrl
}

// ─── 对话事务控制（confirm / discard / pending）──────────────────────────────

export interface PendingDialogueInfo {
  dialogueId: string
  type: 'chat' | 'task'
  status: 'streaming' | 'done' | 'error'
  userContent: string
  assistantContent: string | null
  createdAt: string
}

/**
 * 确认对话：将 pending 暂存数据持久化到 MongoDB。
 */
export async function confirmDialogue(appId: string): Promise<{ dialogueId: string }> {
  return post<{ dialogueId: string }>(`/ai/${appId}/confirm`, {})
}

/**
 * 撤销对话：丢弃 pending 暂存数据。
 */
export async function discardDialogue(appId: string): Promise<void> {
  await post<{ success: boolean }>(`/ai/${appId}/discard`, {})
}

/**
 * 获取当前 pending 对话数据。
 */
export async function getPendingDialogue(appId: string): Promise<{ hasPending: boolean; pending?: PendingDialogueInfo }> {
  return get<{ hasPending: boolean; pending?: PendingDialogueInfo }>(`/ai/${appId}/pending`)
}

// ─── SSE 流式对话 ─────────────────────────────────────────────────────────────

/**
 * 发起 AI 对话，通过 SSE 接收流式事件
 * 返回 Promise，在 done 或 error 事件后 resolve/reject
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
          console.warn('[aiChat] SSE JSON 解析失败', { eventType, dataStr, parseErr })
          continue
        }

        switch (eventType) {
          case 'text_delta': {
            const d = data as { delta?: string; text?: string }
            onEvent({ type: 'text_delta', delta: d.delta ?? d.text ?? '' })
            break
          }
          case 'phase_change':
            onEvent({
              type: 'phase_change',
              from: (data as { from: string }).from,
              to: (data as { to: string }).to,
              timestamp: (data as { timestamp: number }).timestamp ?? Date.now(),
            })
            break
          case 'agent_progress':
            onEvent({
              type: 'agent_progress',
              agent: (data as { agent: string }).agent,
              status: (data as { status: 'started' | 'completed' | 'error' }).status,
              message: (data as { message: string }).message ?? '',
              timestamp: (data as { timestamp: number }).timestamp ?? Date.now(),
            })
            break
          case 'tool_activity':
            onEvent({
              type: 'tool_activity',
              agent: (data as { agent: string }).agent,
              tool: (data as { tool: string }).tool,
              status: (data as { status: 'started' | 'completed' | 'error' }).status,
              inputSummary: (data as { inputSummary?: string }).inputSummary,
              outputSummary: (data as { outputSummary?: string }).outputSummary,
              error: (data as { error?: string }).error,
              timestamp: (data as { timestamp: number }).timestamp ?? Date.now(),
            })
            break
          case 'audit_progress':
            onEvent({
              type: 'audit_progress',
              status: (data as { status: 'started' | 'passed' | 'failed' }).status,
              message: (data as { message?: string }).message,
              timestamp: (data as { timestamp: number }).timestamp ?? Date.now(),
            })
            break
          case 'started':
            onEvent({
              type: 'started',
              threadId: (data as { threadId: string }).threadId ?? '',
            })
            break
          case 'done': {
            const doneData = data as { finalPhase?: string; summary?: string; artifacts?: AiDoneEvent['artifacts']; timestamp?: number }
            onEvent({
              type: 'done',
              finalPhase: doneData.finalPhase ?? 'done',
              summary: doneData.summary ?? '',
              artifacts: doneData.artifacts,
              timestamp: doneData.timestamp ?? Date.now(),
            })
            settle(() => resolve(doneData.summary ?? ''))
            break
          }
          case 'error': {
            const errData = data as { message?: string; code?: string }
            const message = errData.message ?? '未知错误'
            onEvent({ type: 'error', message, code: errData.code })
            settle(() => reject(new Error(message)))
            break
          }
          // 未知事件类型静默忽略
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
