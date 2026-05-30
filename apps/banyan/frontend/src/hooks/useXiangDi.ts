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
 * V3 变更（消息混排）：
 *   - text_delta 不再仅累积到独立的 currentText 状态
 *   - 当遇到 tool_call 时，将之前累积的文字"冻结"为 type='text' 的 ProgressMessage
 *   - messages 数组按时间顺序混排 text 段落和 tool_call/tool_result
 *   - currentText 仅表示"当前正在流入、尚未冻结"的文字片段（用于光标渲染）
 *   - 这确保了 UI 能按真实执行顺序展示：文字1 → 工具1 → 文字2 → 工具2 → ...
 *
 * 会话模型：1 App = 1 Conversation，以 appId 为唯一标识，
 * 前端无需管理 conversationId。
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { aiApi, conversationApi } from '@/api'
import type { AiStreamEvent, AiInterruptEvent, AiPlanningProgressEvent, AgentRole } from '@/api'
import type { DisambiguationOptions } from '@/api'
import type { ConversationMessage, Dialogue, DialogueType, ImageItem } from '@/api'
import { dialoguesToFlatMessages } from '@/api/conversations'

// ─── 进度消息类型 ─────────────────────────────────────────────────────────────

export type ProgressMessageType = 'text' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'aborted' | 'plan_approval' | 'planning_progress'

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

// ─── Planning Progress 状态 ───────────────────────────────────────────────────

/** Multi-Agent 规划步骤状态 */
export interface PlanningStep {
  agent: AgentRole
  status: 'pending' | 'running' | 'completed' | 'failed'
  reasoning?: string
  output?: unknown
  durationMs?: number
}

/** 规划步骤顺序 */
const AGENT_ORDER: AgentRole[] = ['pm', 'arch', 'visual', 'task']

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** 方案确认状态（humanGate interrupt 推送给前端的数据） */
export interface PlanApprovalState {
  threadId: string
  node: string
  planDescription: string
  intentSummary: string
  tasks: Array<{ taskId: string; description: string }>
}

export interface UseXiangDiOptions {
  appId: string
  /**
   * 发送前保存当前应用状态的回调（可选）。
   * sendPrompt 时会先 await 此函数，确保 DB 是最新快照，
   * 后端 XiangDi 通过内部 API 按需拉取，无需随请求体传入。
   */
  onBeforeSend?: () => Promise<void>
  /** AI 完成后回调，携带最终 appJSON */
  onDone?: (appJSON: string) => void
  /** 写操作工具执行完毕后实时推送当前 appJSON，用于画布实时更新 */
  onAppSnapshot?: (appJSON: string) => void
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
  /** 当前轮次的进度消息列表（按时间顺序，混排文字段落和工具调用） */
  messages: ProgressMessage[]
  /** 当前正在流入的 LLM 文字（尚未冻结的最新文字片段，用于光标渲染） */
  currentText: string
  /** Multi-Agent 规划步骤状态（仅 task 类型对话有值，null 表示非规划模式） */
  planningSteps: PlanningStep[] | null
  /** 方案确认状态（humanGate interrupt 时非 null） */
  planApproval: PlanApprovalState | null
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
  /** 响应方案确认（approved=true 直接执行，approved=false 附带 feedback 退回修改） */
  resumeApproval: (approved: boolean, feedback?: string) => Promise<void>
}

let msgIdCounter = 0
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgIdCounter}`
}

export function useXiangDi(options: UseXiangDiOptions): UseXiangDiReturn {
  const { appId, onBeforeSend, onDone, onAppSnapshot, onError, onDisambiguation } = options

  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const [currentText, setCurrentText] = useState('')
  const [planningSteps, setPlanningSteps] = useState<PlanningStep[] | null>(null)
  const [planApproval, setPlanApproval] = useState<PlanApprovalState | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  // 同步互斥锁，防止 loading state 批次更新延迟导致的重复提交
  const sendingRef = useRef(false)
  // 用于在 SSE 回调中累积文字（避免闭包陷阱）
  const currentTextRef = useRef('')
  // 累积所有文字（包括已冻结 + 当前流入的），用于 done 时构建 assistant 消息
  const allTextRef = useRef('')

  // ─── 兼容层：从 dialogues 派生扁平 history ──────────────────────────────────

  const history = useMemo(() => dialoguesToFlatMessages(dialogues), [dialogues])

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

  /**
   * 冻结当前累积的文字为一个 text 类型的 ProgressMessage。
   * 在遇到 tool_call 时调用，确保文字段落和工具调用按真实顺序混排。
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
   * 统一的 SSE 事件处理回调（sendPrompt 和 resumeApproval 共享）。
   * 处理所有 SSE 事件类型并更新对应状态。
   */
  const handleEvent = useCallback((event: AiStreamEvent) => {
    switch (event.type) {
      case 'text_delta': {
        currentTextRef.current += event.text
        allTextRef.current += event.text
        setCurrentText(currentTextRef.current)
        break
      }
      case 'tool_call': {
        // 冻结之前的文字段落，再追加 tool_call
        freezeCurrentText()
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
      case 'planning_progress': {
        const progressEvent = event as AiPlanningProgressEvent
        setPlanningSteps((prev) => {
          if (!prev) return prev
          return prev.map((step) => {
            if (step.agent === progressEvent.agent) {
              return {
                ...step,
                status: 'completed',
                reasoning: progressEvent.reasoning,
                output: progressEvent.output,
                durationMs: progressEvent.durationMs,
              }
            }
            // 标记下一个 agent 为 running
            const completedIdx = AGENT_ORDER.indexOf(progressEvent.agent)
            const nextIdx = completedIdx + 1
            if (nextIdx < AGENT_ORDER.length && step.agent === AGENT_ORDER[nextIdx] && step.status === 'pending') {
              return { ...step, status: 'running' }
            }
            return step
          })
        })
        addMessage({
          type: 'planning_progress',
          content: progressEvent.reasoning ?? `${progressEvent.agent} 已完成`,
          toolName: progressEvent.agent,
        })
        break
      }
      case 'app_snapshot': {
        onAppSnapshot?.(event.appJSON)
        break
      }
      case 'disambiguation': {
        // 消歧事件：展示消歧卡片，用户选择后通过 onDisambiguation 回调处理
        // 在 requireApproval 模式下，消歧通过 interrupt 事件统一处理
        // 这里保留兼容：非 requireApproval 模式下仍可能收到独立 disambiguation 事件
        onDisambiguation?.(event.options)
        break
      }
      case 'interrupt': {
        // humanGate 方案确认：冻结已有文字，设置 planApproval 状态
        freezeCurrentText()
        const interruptData = event as AiInterruptEvent
        if (interruptData.value?.type === 'humanGate') {
          const approvalState: PlanApprovalState = {
            threadId: interruptData.threadId,
            node: interruptData.node,
            planDescription: interruptData.value.planDescription,
            intentSummary: interruptData.value.intentSummary,
            tasks: interruptData.value.tasks,
          }
          setPlanApproval(approvalState)
          addMessage({
            type: 'plan_approval',
            content: interruptData.value.planDescription,
          })
        }
        // interrupt 后 loading 保持 true（等待用户操作 → resume）
        break
      }
      case 'done': {
        // 冻结最后剩余的文字
        freezeCurrentText()
        // 规划完成时清空步骤指示器
        setPlanningSteps(null)

        // 将 assistant 回复追加到临时 Dialogue 中
        const assistantText = allTextRef.current.trim()
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
          content: '完成',
        })
        break
      }
      case 'error': {
        // 冻结之前的文字
        freezeCurrentText()
        addMessage({
          type: 'error',
          content: event.message,
          isError: true,
        })
        break
      }
    }
  }, [addMessage, freezeCurrentText, onAppSnapshot, onDisambiguation])

  const sendPrompt = useCallback(async (prompt: string, type: DialogueType = 'task', images: ImageItem[] = []) => {
    // 同步互斥：sendingRef 是即时生效的，比 loading state 更可靠
    if (sendingRef.current) return
    sendingRef.current = true

    // 乐观追加 user 消息到 dialogues（创建一个临时 Dialogue）
    const tempDialogue: Dialogue = {
      _id: `temp_${Date.now()}`,
      type,
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

    // task 类型对话初始化规划步骤
    if (type === 'task') {
      setPlanningSteps(
        AGENT_ORDER.map((agent, idx) => ({
          agent,
          status: idx === 0 ? 'running' : 'pending',
        }))
      )
    } else {
      setPlanningSteps(null)
    }

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
      sendingRef.current = false
      abortControllerRef.current = null
    }
  }, [appId, onBeforeSend, addMessage, freezeCurrentText, handleEvent, onDone, onError])
  // 注意：依赖数组中移除了 loading，因为现在用 sendingRef 做互斥，loading 仅用于 UI 展示

  const respondToDisambiguationFn = useCallback(async (choiceId: string) => {
    await aiApi.respondToDisambiguation(choiceId)
  }, [])

  /**
   * 响应方案确认：
   * - approved=true → 直接恢复执行（resume { approved: true }）
   * - approved=false → 附带 feedback 退回修改（resume { approved: false, feedback }）
   *
   * Resume 本身也是 SSE 流式：恢复执行后，后续事件继续走 handleEvent 推送到 messages/currentText。
   */
  const resumeApproval = useCallback(async (approved: boolean, feedback?: string) => {
    // 清除方案确认状态
    setPlanApproval(null)

    // 重置文字累积（resume 会产生新的 text_delta 流）
    currentTextRef.current = ''
    allTextRef.current = ''
    setCurrentText('')

    // 创建新的 AbortController 用于 resume SSE
    const controller = new AbortController()
    abortControllerRef.current = controller
    sendingRef.current = true

    try {
      const resumeValue = approved
        ? { approved: true }
        : { approved: false, feedback: feedback ?? '请修改方案' }

      const finalPages = await aiApi.aiResume({
        appId,
        resumeValue,
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
      sendingRef.current = false
      abortControllerRef.current = null
    }
  }, [appId, addMessage, handleEvent, onDone, onError])

  const abort = useCallback(() => {
    if (!abortControllerRef.current) return
    abortControllerRef.current.abort()
    // 给用户一条「已停止」的 UI 反馈
    addMessage({ type: 'aborted', content: '已停止' })
    setPlanApproval(null)
    setLoading(false)
    sendingRef.current = false
    abortControllerRef.current = null
  }, [addMessage])

  const clearMessages = useCallback(() => {
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
    allTextRef.current = ''
    setPlanApproval(null)
    setPlanningSteps(null)
  }, [])

  const newConversation = useCallback(() => {
    setDialogues([])
    setMessages([])
    setCurrentText('')
    currentTextRef.current = ''
    allTextRef.current = ''
    setPlanApproval(null)
    setPlanningSteps(null)
  }, [])

  return {
    loading,
    historyLoading,
    dialogues,
    history,
    messages,
    currentText,
    planningSteps,
    planApproval,
    sendPrompt,
    abort,
    clearMessages,
    newConversation,
    respondToDisambiguation: respondToDisambiguationFn,
    resumeApproval,
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
