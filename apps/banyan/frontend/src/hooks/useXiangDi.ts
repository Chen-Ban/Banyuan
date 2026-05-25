/**
 * useXiangDi Hook
 *
 * 封装与后端 XiangDi AI 服务的 SSE 通信逻辑。
 * 提供：
 * - 加载历史消息（loadHistory）
 * - 发送指令（sendPrompt）
 * - 实时进度消息列表（messages）
 * - 对话历史（history）
 * - 加载状态（loading）
 * - 中止请求（abort）
 * - 清空对话（clearConversation）
 *
 * 会话模型：1 App = 1 Conversation，以 appId 为唯一标识，
 * 前端无需管理 conversationId。
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { aiApi, conversationApi } from '@/api'
import type { AiStreamEvent, DisambiguationOptions, SchemaCollectionDef } from '@/api'
import type { ConversationMessage } from '@/api'

// ─── 进度消息类型 ─────────────────────────────────────────────────────────────

export type ProgressMessageType = 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'

export interface ProgressMessage {
  id: string
  type: ProgressMessageType
  /** 主要展示文本 */
  content: string
  /** 工具调用时的工具名 */
  toolName?: string
  /** 工具调用关联的 tool_use_id，用于匹配 tool_result */
  toolCallId?: string
  /** 是否为错误 */
  isError?: boolean
  /** 工具调用是否已完成（收到 tool_result 后标记） */
  completed?: boolean
  timestamp: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseXiangDiOptions {
  appId: string
  /**
   * 获取当前最新 pages 的回调。
   * sendPrompt 时会调用此函数，将返回的 pages 一同发送给 AI，
   * 确保 AI 操作的是前端内存中的最新状态而非 DB 快照。
   */
  getPages: () => string[]
  /** 获取当前 Schema 的回调（可选，由 DatabasePage 提供） */
  getSchema?: () => SchemaCollectionDef[]
  /** 获取当前云函数列表的回调（可选，由 FunctionsPage 提供） */
  getCloudFunctions?: () => Array<{
    functionId: string
    name: string
    displayName?: string
    description?: string
    flowSchema?: Record<string, unknown>
  }>
  /** AI 完成后回调，携带最终 pages JSON */
  onDone?: (pages: string[]) => void
  /** 写操作工具执行完毕后实时推送当前 pages，用于画布实时更新 */
  onPagesSnapshot?: (pages: string[]) => void
  /** 发生错误时回调 */
  onError?: (message: string) => void
  /** 检测到意图冲突时回调，前端展示消歧 UI */
  onDisambiguation?: (options: DisambiguationOptions) => void
}

export interface UseXiangDiReturn {
  /** 是否正在运行 */
  loading: boolean
  /** 历史消息是否正在加载 */
  historyLoading: boolean
  /** 对话历史消息（user + assistant 交替） */
  history: ConversationMessage[]
  /** 当前轮次的进度消息列表（按时间顺序） */
  messages: ProgressMessage[]
  /** 当前累积的 LLM 文字输出 */
  currentText: string
  /** 发送指令 */
  sendPrompt: (prompt: string) => Promise<void>
  /** 中止当前请求 */
  abort: () => void
  /** 清空进度消息列表（不清空历史） */
  clearMessages: () => void
  /** 响应消歧选择，通知后端恢复 AgentLoop */
  respondToDisambiguation: (choiceId: string) => Promise<void>
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`
}

export function useXiangDi(options: UseXiangDiOptions): UseXiangDiReturn {
  const { appId, getPages, getSchema, getCloudFunctions, onDone, onPagesSnapshot, onError, onDisambiguation } = options

  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<ConversationMessage[]>([])
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [currentText, setCurrentText] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  // 用于在 SSE 回调中累积文字（避免闭包陷阱）
  const currentTextRef = useRef('')

  // ─── 加载历史消息 ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appId) return

    let cancelled = false
    setHistoryLoading(true)

    conversationApi.getMessages(appId).then((msgs) => {
      if (!cancelled) {
        setHistory(msgs)
        setHistoryLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setHistoryLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [appId])

  // ─── 消息操作 ──────────────────────────────────────────────────────────────

  const addMessage = useCallback((msg: Omit<ProgressMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: nextMsgId(), timestamp: Date.now() },
    ])
  }, [])

  const sendPrompt = useCallback(async (prompt: string) => {
    if (loading) return

    // 乐观追加 user 消息到历史
    setHistory((prev) => [...prev, { role: 'user', content: prompt }])

    // 重置当前轮次状态
    setLoading(true)
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''

    // 创建新的 AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller

    const handleEvent = (event: AiStreamEvent) => {
      switch (event.type) {
        case 'text_delta': {
          currentTextRef.current += event.text
          setCurrentText(currentTextRef.current)
          break
        }
        case 'tool_call': {
          const friendlyName = formatToolName(event.name)
          addMessage({
            type: 'tool_call',
            content: `正在执行：${friendlyName}`,
            toolName: event.name,
            toolCallId: event.id,
          })
          break
        }
        case 'tool_result': {
          setMessages((prev) =>
            prev.map((m) =>
              m.type === 'tool_call' && m.toolCallId === event.id
                ? { ...m, completed: true }
                : m
            )
          )
          if (event.isError) {
            addMessage({
              type: 'tool_result',
              content: `操作失败：${typeof event.result === 'string' ? event.result : JSON.stringify(event.result)}`,
              isError: true,
            })
          }
          break
        }
        case 'pages_snapshot': {
          onPagesSnapshot?.(event.pages)
          break
        }
        case 'disambiguation': {
          onDisambiguation?.(event.options)
          break
        }
        case 'done': {
          // 将 assistant 回复追加到历史
          const assistantText = currentTextRef.current.trim()
          if (assistantText) {
            setHistory((prev) => [...prev, { role: 'assistant', content: assistantText }])
            addMessage({
              type: 'done',
              content: assistantText,
            })
          }
          break
        }
        case 'error': {
          addMessage({
            type: 'error',
            content: event.message,
            isError: true,
          })
          break
        }
      }
    }

    try {
      const finalPages = await aiApi.aiChat({
        appId,
        prompt,
        pages: getPages(),
        schema: getSchema?.(),
        cloudFunctions: getCloudFunctions?.(),
        onEvent: handleEvent,
        signal: controller.signal,
      })
      onDone?.(finalPages)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      addMessage({ type: 'error', content: msg, isError: true })
      onError?.(msg)
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }, [loading, appId, getPages, getSchema, getCloudFunctions, addMessage, onDone, onError, onPagesSnapshot, onDisambiguation])

  const respondToDisambiguationFn = useCallback(async (choiceId: string) => {
    await aiApi.respondToDisambiguation(choiceId)
  }, [])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    setLoading(false)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
  }, [])

  return {
    loading,
    historyLoading,
    history,
    messages,
    currentText,
    sendPrompt,
    abort,
    clearMessages,
    respondToDisambiguation: respondToDisambiguationFn,
  }
}

// ─── 工具名友好化 ─────────────────────────────────────────────────────────────

const TOOL_NAME_MAP: Record<string, string> = {
  banvas_get_app_state: '读取画布状态',
  banvas_create_page: '创建页面',
  banvas_add_node: '添加元素',
  banvas_update_node: '更新元素',
  banvas_delete_node: '删除元素',
  banvas_move_node: '移动元素',
  banvas_resize_node: '调整尺寸',
  banvas_apply_patch: '批量操作',
}

function formatToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name
}
