/**
 * useXiangDi Hook
 *
 * 封装与后端 XiangDi AI 服务的 SSE 通信逻辑。
 * 提供：
 * - 发送指令（sendPrompt）
 * - 实时进度消息列表（messages）
 * - 加载状态（loading）
 * - 中止请求（abort）
 */

import { useState, useCallback, useRef } from 'react'
import { aiApi } from '@/api'
import type { AiStreamEvent, DisambiguationOptions } from '@/api'

// ─── 进度消息类型 ─────────────────────────────────────────────────────────────

export type ProgressMessageType = 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'

export interface ProgressMessage {
  id: string
  type: ProgressMessageType
  /** 主要展示文本 */
  content: string
  /** 工具调用时的工具名 */
  toolName?: string
  /** 是否为错误 */
  isError?: boolean
  timestamp: number
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseXiangDiOptions {
  appId: string
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
  /** 进度消息列表（按时间顺序） */
  messages: ProgressMessage[]
  /** 当前累积的 LLM 文字输出 */
  currentText: string
  /** 发送指令 */
  sendPrompt: (prompt: string) => Promise<void>
  /** 中止当前请求 */
  abort: () => void
  /** 清空消息列表 */
  clearMessages: () => void
  /** 响应消歧选择，通知后端恢复 AgentLoop */
  respondToDisambiguation: (choiceId: string) => Promise<void>
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`
}

export function useXiangDi(options: UseXiangDiOptions): UseXiangDiReturn {
  const { appId, onDone, onPagesSnapshot, onError, onDisambiguation } = options

  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [currentText, setCurrentText] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  // 用于在 SSE 回调中累积文字（避免闭包陷阱）
  const currentTextRef = useRef('')

  const addMessage = useCallback((msg: Omit<ProgressMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: nextMsgId(), timestamp: Date.now() },
    ])
  }, [])

  const sendPrompt = useCallback(async (prompt: string) => {
    if (loading) return

    // 重置状态
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
          // 工具名做友好化处理
          const friendlyName = formatToolName(event.name)
          addMessage({
            type: 'tool_call',
            content: `正在执行：${friendlyName}`,
            toolName: event.name,
          })
          break
        }
        case 'tool_result': {
          if (event.isError) {
            addMessage({
              type: 'tool_result',
              content: `操作失败：${typeof event.result === 'string' ? event.result : JSON.stringify(event.result)}`,
              isError: true,
            })
          }
          // 成功的 tool_result 不展示，避免信息过载
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
          // 将最终文字输出作为一条消息
          if (currentTextRef.current.trim()) {
            addMessage({
              type: 'done',
              content: currentTextRef.current.trim(),
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
  }, [loading, appId, addMessage, onDone, onError])

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

  return { loading, messages, currentText, sendPrompt, abort, clearMessages, respondToDisambiguation: respondToDisambiguationFn }
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
