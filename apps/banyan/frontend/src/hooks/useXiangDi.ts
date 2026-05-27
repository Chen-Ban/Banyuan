/**
 * useXiangDi Hook（V2）
 *
 * 封装与后端 XiangDi AI 服务的 SSE 通信逻辑。
 * 提供：
 * - 加载对话历史（Dialogue 列表）
 * - 发送指令（sendPrompt），支持 type 参数（chat/task）
 * - 实时进度消息列表（messages）
 * - 对话历史（dialogues / history 兼容层）
 * - 加载状态（loading）
 * - 中止请求（abort）
 *
 * V2 变更：
 *   - 历史数据从 ConversationMessage[] 改为 Dialogue[]
 *   - sendPrompt 新增 type 参数（默认 task）
 *   - 保留 history（ConversationMessage[]）兼容层，通过 dialoguesToFlatMessages 转换
 *   - 新增 dialogues 状态，暴露完整的 Dialogue 结构
 *
 * 会话模型：1 App = 1 Conversation，以 appId 为唯一标识，
 * 前端无需管理 conversationId。
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { aiApi, conversationApi } from '@/api'
import type { AiStreamEvent, DisambiguationOptions } from '@/api'
import type { ConversationMessage, Dialogue, DialogueType } from '@/api'
import { dialoguesToFlatMessages } from '@/api/conversations'

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
   * 发送前保存当前应用状态的回调（可选）。
   * sendPrompt 时会先 await 此函数，确保 DB 是最新快照，
   * 后端 XiangDi 通过内部 API 按需拉取，无需随请求体传入。
   */
  onBeforeSend?: () => Promise<void>
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
  /** 对话列表（V2 完整结构） */
  dialogues: Dialogue[]
  /** 对话历史消息（兼容层：user + assistant 交替的扁平列表） */
  history: ConversationMessage[]
  /** 当前轮次的进度消息列表（按时间顺序） */
  messages: ProgressMessage[]
  /** 当前累积的 LLM 文字输出 */
  currentText: string
  /** 发送指令（type 默认 task） */
  sendPrompt: (prompt: string, type?: DialogueType, images?: Array<{ url: string; alt?: string }>) => Promise<void>
  /** 中止当前请求 */
  abort: () => void
  /** 清空进度消息列表（不清空历史） */
  clearMessages: () => void
  /** 新建对话（清空所有历史和进度消息） */
  newConversation: () => void
  /** 响应消歧选择，通知后端恢复 AgentLoop */
  respondToDisambiguation: (choiceId: string) => Promise<void>
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`
}

export function useXiangDi(options: UseXiangDiOptions): UseXiangDiReturn {
  const { appId, onBeforeSend, onDone, onPagesSnapshot, onError, onDisambiguation } = options

  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [currentText, setCurrentText] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  // 用于在 SSE 回调中累积文字（避免闭包陷阱）
  const currentTextRef = useRef('')

  // ─── 兼容层：从 dialogues 派生扁平 history ──────────────────────────────────

  const history = dialoguesToFlatMessages(dialogues)

  // ─── 加载对话历史 ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appId) return

    let cancelled = false
    setHistoryLoading(true)

    conversationApi.getDialogues(appId).then((result) => {
      if (!cancelled) {
        setDialogues(result)
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

  const sendPrompt = useCallback(async (prompt: string, type: DialogueType = 'task', images: Array<{ url: string; alt?: string }> = []) => {
    if (loading) return

    // 乐观追加 user 消息到 dialogues（创建一个临时 Dialogue）
    const tempDialogue: Dialogue = {
      _id: `temp_${Date.now()}`,
      type,
      messages: [{
        role: 'user',
        userContent: { prompt, images: images.map((img) => img.url) },
        createdAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setDialogues((prev) => [...prev, tempDialogue])

    // 重置当前轮次状态
    setLoading(true)
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''

    // 创建新的 AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller

    // 发送前先保存当前应用状态，确保 DB 是最新快照
    if (onBeforeSend) {
      try {
        await onBeforeSend()
      } catch {
        // 保存失败不阻断 AI 请求（DB 中已有上次保存的状态）
      }
    }

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
          // 将 assistant 回复追加到临时 Dialogue 中
          const assistantText = currentTextRef.current.trim()
          if (assistantText) {
            setDialogues((prev) => {
              const updated = [...prev]
              const lastDialogue = updated[updated.length - 1]
              if (lastDialogue) {
                lastDialogue.messages = [
                  ...lastDialogue.messages,
                  {
                    role: 'assistant',
                    assistantContent: [{ type: 'text', text: assistantText }],
                    createdAt: new Date().toISOString(),
                  },
                ]
              }
              return updated
            })
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
        type,
        images,
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
  }, [loading, appId, onBeforeSend, addMessage, onDone, onError, onPagesSnapshot, onDisambiguation])

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

  const newConversation = useCallback(() => {
    setDialogues([])
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
  }, [])

  return {
    loading,
    historyLoading,
    dialogues,
    history,
    messages,
    currentText,
    sendPrompt,
    abort,
    clearMessages,
    newConversation,
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
