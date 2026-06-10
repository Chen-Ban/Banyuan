/**
 * useXiangDi Hook
 *
 * 封装与后端 XiangDi AI 服务的 SSE 通信逻辑。
 * 提供：
 * - 加载对话历史（Dialogue 列表）
 * - 发送指令（sendPrompt），支持 type 参数（chat/task）
 * - 实时进度消息列表（messages）
 * - 对话历史（dialogues / history 兼容层）
 * - 加载状态（loading）
 * - 中止请求（abort）
 * - 确认/撤销 task 模式对话结果（confirmTask / discardTask）
 *
 * SSE 事件协议（ADR-041 Orchestrator）：
 *   started / phase_change / agent_progress / tool_activity
 *   audit_progress / text_delta / done / error
 *
 * 会话模型：1 App = 1 Conversation，以 appId 为唯一标识，
 * 前端无需管理 conversationId。
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { aiApi, conversationApi, ApiError } from '@/api'
import type { AiStreamEvent, ErrorPayload } from '@/api'
import type { ConversationMessage, Dialogue, DialogueType, ImageItem } from '@/api'
import { dialoguesToFlatMessages } from '@/api/ai/conversations'

// ─── 进度消息类型 ─────────────────────────────────────────────────────────────

export type ProgressMessageType = 'text' | 'tool_activity' | 'agent_progress' | 'audit' | 'done' | 'error' | 'aborted' | 'phase_change'

/** 重试上下文（仅 retryable 的 error 消息携带） */
export interface RetryContext {
  prompt: string
  type?: DialogueType
  images?: ImageItem[]
}

export interface ProgressMessage {
  id: string
  type: ProgressMessageType
  /** 主要展示文本 */
  content: string
  /** 工具名（tool_activity 时有值） */
  toolName?: string
  /** Agent 名（agent_progress/tool_activity 时有值） */
  agentName?: string
  /** 是否为错误 */
  isError?: boolean
  /** 工具是否已完成 */
  completed?: boolean
  /** 结构化错误信息（仅 type='error' 时有值） */
  errorPayload?: ErrorPayload
  /** 重试上下文（仅 retryable error 消息有值，点击重试可重发） */
  retryContext?: RetryContext
  timestamp: number
}

// ─── Agent 进度状态（ADR-041） ────────────────────────────────────────────────

/** SubAgent 执行步骤状态 */
export interface AgentStep {
  agent: string
  status: 'started' | 'completed' | 'error'
  message: string
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
  /** AI 完成后回调，携带 done 事件的 summary */
  onDone?: (summary: string) => void
  /** 发生错误时回调 */
  onError?: (message: string) => void
  /** task 确认成功后回调（可用于重新加载 appJSON） */
  onConfirmed?: (dialogueId: string) => void
  /** task 撤销后回调（前端应回滚画布到对话前的状态） */
  onDiscarded?: () => void
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
  /** 当前轮次的进度消息列表（按时间顺序混排文字段落和工具活动） */
  messages: ProgressMessage[]
  /** 当前正在流入的 LLM 文字（尚未冻结的最新文字片段，用于光标渲染） */
  currentText: string
  /** SubAgent 进度步骤列表（agent_progress 事件驱动） */
  agentSteps: AgentStep[]
  /** 当前阶段名（phase_change 事件驱动） */
  currentPhase: string | null
  /** 是否有 pending 的 task 对话待确认 */
  hasPendingTask: boolean
  /** pending 对话详情（非 null 时前端应显示确认/撤销按钮） */
  pendingDialogue: import('@/api').PendingDialogueInfo | null
  /** 发送指令（type 默认 task） */
  sendPrompt: (prompt: string, type?: DialogueType, images?: Array<{ url: string; alt?: string }>) => Promise<void>
  /** 中止当前请求 */
  abort: () => void
  /** 清空进度消息列表（不清空历史） */
  clearMessages: () => void
  /** 新建对话（清空所有历史和进度消息） */
  newConversation: () => void
  /** 确认 task 对话：持久化到 DB，画布保持当前状态 */
  confirmTask: () => Promise<void>
  /** 撤销 task 对话：丢弃暂存数据，画布回滚 */
  discardTask: () => Promise<void>
  /** 重试错误消息：移除该错误并重发原始 prompt */
  retryError: (messageId: string) => void
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`
}

export function useXiangDi(options: UseXiangDiOptions): UseXiangDiReturn {
  const { appId, onBeforeSend, onDone, onError, onConfirmed, onDiscarded } = options

  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [currentText, setCurrentText] = useState('')
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [currentPhase, setCurrentPhase] = useState<string | null>(null)
  const [hasPendingTask, setHasPendingTask] = useState(false)
  const [pendingDialogue, setPendingDialogue] = useState<import('@/api').PendingDialogueInfo | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  // 同步互斥锁，防止 loading state 批次更新延迟导致的重复提交
  const sendingRef = useRef(false)
  // 用于在 SSE 回调中累积文字（避免闭包陷阱）
  const currentTextRef = useRef('')
  // 累积所有文字（包括已冻结 + 当前流入的），用于 done 时构建 assistant 消息
  const allTextRef = useRef('')
  // 当前对话类型（用于 done 事件中判断是否需要 pending confirm）
  const currentTypeRef = useRef<DialogueType>('task')
  // 标记 SSE error 事件已通过 handleEvent 处理（防止 catch 中重复追加错误消息）
  const sseErrorHandledRef = useRef(false)
  /** 记录最近一次发送的 prompt 上下文，供错误重试使用 */
  const lastSendRef = useRef<RetryContext | null>(null)

  // ─── 兼容层：从 dialogues 派生扁平 history ──────────────────────────────────

  const history = useMemo(() => dialoguesToFlatMessages(dialogues), [dialogues])

  // ─── 加载对话历史 + 检查 pending 状态 ──────────────────────────────────────────

  useEffect(() => {
    if (!appId) return

    let cancelled = false
    setHistoryLoading(true)

    // 并行加载对话历史和 pending 状态
    Promise.all([
      conversationApi.getDialogues(appId),
      aiApi.getPendingDialogue(appId),
    ]).then(([dialogueResult, pendingResult]) => {
      if (cancelled) return
      setDialogues(dialogueResult)
      if (pendingResult.hasPending && pendingResult.pending) {
        setHasPendingTask(true)
        setPendingDialogue(pendingResult.pending)
      }
      setHistoryLoading(false)
    }).catch(() => {
      if (!cancelled) setHistoryLoading(false)
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

  /**
   * 冻结当前累积的文字为一个 text 类型的 ProgressMessage。
   * 在遇到 tool_activity 时调用，确保文字段落和工具活动按真实顺序混排。
   */
  const freezeCurrentText = useCallback(() => {
    const text = currentTextRef.current
    if (text.trim()) {
      addMessage({ type: 'text', content: text })
    }
    // 重置当前文字（但 allTextRef 保持累积）
    currentTextRef.current = ''
    setCurrentText('')
  }, [addMessage])

  /**
   * 统一的 SSE 事件处理回调。
   * 处理 ADR-041 Orchestrator 事件协议。
   */
  const handleEvent = useCallback((event: AiStreamEvent) => {
    switch (event.type) {
      case 'started': {
        // 流开始，可用于记录 threadId（目前无需特殊处理）
        break
      }
      case 'text_delta': {
        currentTextRef.current += event.delta
        allTextRef.current += event.delta
        setCurrentText(currentTextRef.current)
        break
      }
      case 'phase_change': {
        setCurrentPhase(event.to)
        addMessage({
          type: 'phase_change',
          content: `阶段切换：${event.from} → ${event.to}`,
        })
        break
      }
      case 'agent_progress': {
        setAgentSteps((prev) => {
          // 更新已存在的 agent 或追加新的
          const existing = prev.find((s) => s.agent === event.agent)
          if (existing) {
            return prev.map((s) =>
              s.agent === event.agent
                ? { ...s, status: event.status, message: event.message, timestamp: event.timestamp }
                : s
            )
          }
          return [...prev, {
            agent: event.agent,
            status: event.status,
            message: event.message,
            timestamp: event.timestamp,
          }]
        })
        if (event.status === 'started') {
          addMessage({
            type: 'agent_progress',
            content: event.message || `${event.agent} 开始执行`,
            agentName: event.agent,
          })
        } else if (event.status === 'error') {
          addMessage({
            type: 'agent_progress',
            content: event.message || `${event.agent} 执行失败`,
            agentName: event.agent,
            isError: true,
          })
        }
        break
      }
      case 'tool_activity': {
        if (event.status === 'started') {
          // 冻结之前的文字段落，再追加工具活动
          freezeCurrentText()
          const friendlyName = formatToolName(event.tool)
          addMessage({
            type: 'tool_activity',
            content: `正在执行：${friendlyName}`,
            toolName: event.tool,
            agentName: event.agent,
          })
        } else if (event.status === 'completed') {
          // 标记对应工具为已完成
          setMessages((prev) =>
            prev.map((m) =>
              m.type === 'tool_activity' && m.toolName === event.tool && !m.completed
                ? { ...m, completed: true }
                : m
            )
          )
        } else if (event.status === 'error') {
          addMessage({
            type: 'tool_activity',
            content: `操作失败：${event.error ?? event.tool}`,
            toolName: event.tool,
            agentName: event.agent,
            isError: true,
          })
        }
        break
      }
      case 'audit_progress': {
        addMessage({
          type: 'audit',
          content: event.status === 'started'
            ? '正在审计...'
            : event.status === 'passed'
              ? '审计通过'
              : `审计失败：${event.message ?? ''}`,
          isError: event.status === 'failed',
        })
        break
      }
      case 'done': {
        // 冻结最后剩余的文字
        freezeCurrentText()
        setCurrentPhase(event.finalPhase)

        const assistantText = allTextRef.current.trim()

        if (currentTypeRef.current === 'task') {
          // task 模式：进入 pending confirm 状态
          setHasPendingTask(true)
          setPendingDialogue({
            dialogueId: `pending_${Date.now()}`,
            type: 'task',
            status: 'done',
            userContent: '',
            assistantContent: assistantText || null,
            createdAt: new Date().toISOString(),
          })
          addMessage({
            type: 'done',
            content: event.summary || '任务完成，请确认或撤销修改',
          })
        } else {
          // chat 模式：直接追加 assistant 回复到 dialogues
          if (assistantText) {
            setDialogues((prev) => {
              if (prev.length === 0) return prev
              const updated = prev.slice(0, -1)
              const lastDialogue = prev[prev.length - 1]
              updated.push({
                ...lastDialogue,
                messages: [
                  ...lastDialogue.messages,
                  {
                    role: 'assistant',
                    assistantContent: [{ type: 'text', text: assistantText }],
                    createdAt: new Date().toISOString(),
                  },
                ],
              })
              return updated
            })
          }
          addMessage({
            type: 'done',
            content: event.summary || '完成',
          })
        }
        break
      }
      case 'error': {
        // 冻结之前的文字
        freezeCurrentText()
        sseErrorHandledRef.current = true
        addMessage({
          type: 'error',
          content: event.error.message,
          isError: true,
          errorPayload: event.error,
          retryContext: event.error.retryable ? (lastSendRef.current ?? undefined) : undefined,
        })
        break
      }
    }
  }, [addMessage, freezeCurrentText])

  const sendPrompt = useCallback(async (prompt: string, type: DialogueType = 'task', images: ImageItem[] = []) => {
    // 同步互斥：sendingRef 是即时生效的，比 loading state 更可靠
    if (sendingRef.current) return
    sendingRef.current = true
    currentTypeRef.current = type
    lastSendRef.current = { prompt, type, images }

    // 乐观追加 user 消息到 dialogues（创建一个临时 Dialogue）
    const tempDialogue: Dialogue = {
      _id: `temp_${Date.now()}`,
      type,
      phase: 'idle',
      messages: [{
        role: 'user',
        userContent: { prompt, images },
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
    allTextRef.current = ''
    sseErrorHandledRef.current = false
    setAgentSteps([])
    setCurrentPhase(null)

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

    try {
      const summary = await aiApi.aiChat({
        appId,
        prompt,
        type,
        images,
        onEvent: handleEvent,
        signal: controller.signal,
      })
      onDone?.(summary)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      // SSE error 事件已通过 handleEvent 追加了错误消息并 reject Promise。
      // 此处仅在非 SSE 场景（fetch 失败、网络断开等）补充追加。
      if (!sseErrorHandledRef.current) {
        let payload: ErrorPayload
        if (err instanceof ApiError && err.payload) {
          // 后端返回了结构化 ErrorPayload
          payload = err.payload as ErrorPayload
        } else {
          // 网络错误等兜底
          const msg = err instanceof Error ? err.message : String(err)
          payload = { code: 'NETWORK_ERROR', category: 'upstream', message: msg, retryable: true }
        }
        addMessage({
          type: 'error',
          content: payload.message,
          isError: true,
          errorPayload: payload,
          retryContext: payload.retryable ? (lastSendRef.current ?? undefined) : undefined,
        })
      }
      const msg = err instanceof Error ? err.message : String(err)
      onError?.(msg)
    } finally {
      setLoading(false)
      sendingRef.current = false
      abortControllerRef.current = null
    }
  }, [appId, onBeforeSend, addMessage, handleEvent, onDone, onError])

  // ─── 对话事务控制：confirm / discard ─────────────────────────────────────────

  const confirmTask = useCallback(async () => {
    if (!hasPendingTask) return
    try {
      const result = await aiApi.confirmDialogue(appId)
      setHasPendingTask(false)
      setPendingDialogue(null)
      // 确认成功后重新加载对话历史（确保 _id 等字段是 DB 真实值）
      conversationApi.getDialogues(appId).then(setDialogues).catch(() => { /* ignore */ })
      onConfirmed?.(result.dialogueId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onError?.(msg)
    }
  }, [appId, hasPendingTask, onConfirmed, onError])

  const discardTask = useCallback(async () => {
    if (!hasPendingTask) return
    try {
      await aiApi.discardDialogue(appId)
      setHasPendingTask(false)
      setPendingDialogue(null)
      // 撤销：仅移除 sendPrompt 时乐观添加的临时对话（_id 以 temp_ 开头）
      setDialogues((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last._id.startsWith('temp_')) {
          return prev.slice(0, -1)
        }
        return prev
      })
      // 清空进度消息
      setMessages([])
      setCurrentText('')
      currentTextRef.current = ''
      allTextRef.current = ''
      setAgentSteps([])
      setCurrentPhase(null)
      onDiscarded?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onError?.(msg)
    }
  }, [appId, hasPendingTask, onDiscarded, onError])

  // ─── 通用操作 ──────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    if (!abortControllerRef.current) return
    abortControllerRef.current.abort()
    // 通知后端将 Dialogue 转为 discarded，释放编辑锁
    aiApi.stopDialogue(appId).catch(() => { /* 静默失败 */ })
    addMessage({ type: 'aborted', content: '已停止' })
    setLoading(false)
    sendingRef.current = false
    abortControllerRef.current = null
  }, [appId, addMessage])

  const clearMessages = useCallback(() => {
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
    allTextRef.current = ''
    setAgentSteps([])
    setCurrentPhase(null)
  }, [])

  const newConversation = useCallback(() => {
    setDialogues([])
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
    allTextRef.current = ''
    setAgentSteps([])
    setCurrentPhase(null)
    setHasPendingTask(false)
    setPendingDialogue(null)
  }, [])

  // 重试错误消息：移除该错误消息，重新发送原始 prompt
  const retryError = useCallback((messageId: string) => {
    setMessages(prev => {
      const target = prev.find(m => m.id === messageId)
      if (!target?.retryContext) return prev
      const { prompt, type, images } = target.retryContext
      // 异步触发重发（避免在 setState 中发起副作用）
      setTimeout(() => sendPrompt(prompt, type, images), 0)
      // 移除该错误消息
      return prev.filter(m => m.id !== messageId)
    })
  }, [sendPrompt])

  return {
    loading,
    historyLoading,
    dialogues,
    history,
    messages,
    currentText,
    agentSteps,
    currentPhase,
    hasPendingTask,
    pendingDialogue,
    sendPrompt,
    abort,
    clearMessages,
    newConversation,
    confirmTask,
    discardTask,
    retryError,
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
  app_get_app_json: '获取应用数据',
}

function formatToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name
}
