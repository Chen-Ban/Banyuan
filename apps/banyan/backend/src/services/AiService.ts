/**
 * AI 服务（HTTP 代理层）— V4（Snapshot 事务化）
 *
 * 核心变更（V4）：
 *   - task 模式引入"对话即事务"语义：SSE 期间应用状态数据（appJSON/collections/cloudFunctions）
 *     暂存到 Snapshot 表（MongoDB），对话元数据（消息/摘要/规划产物等）暂存在 PendingStore（内存）
 *   - 用户确认：snapshotService.confirm() 同步应用状态到持久化表 + PendingStore 写对话数据到 DB
 *   - 用户撤销：snapshotService.discard() 标记丢弃 + PendingStore 清除
 *   - chat 模式保持直接写 DB（纯文字问答无应用副作用，不需要确认）
 *   - resume 场景从 Snapshot 读取当前 appJSON（而非持久化表）
 *
 * Snapshot vs PendingStore 分工：
 *   - Snapshot（MongoDB）：appJSON / collections / cloudFunctions — 可回滚、可持久化恢复
 *   - PendingStore（内存）：对话消息、摘要、规划产物 — 进程内缓存，confirm 时一次性写 DB
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ Snapshot 表 (task, 应用状态)
 *                     ↕ PendingStore (task, 对话元数据)
 *                     ↕ 持久化表 (confirm后同步)
 *
 * SSE 事件类型（与 XiangDi 服务保持一致）：
 *   text_delta / tool_call / tool_result / app_snapshot / schema_update
 *   round_summary / memory_update / checkpoint / interrupt / resumed / done / error
 */

import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import https from 'https'
import { Types } from 'mongoose'
import applicationService from './ApplicationService.js'
import conversationService from './ConversationService.js'
import snapshotService from './SnapshotService.js'
import planningArtifactService from './PlanningArtifactService.js'
import contextBuilder, { ContextBudgetOverflowError } from './ContextBuilder.js'
import type { ContextBuildOptions } from './ContextBuilder.js'
import { SchemaService } from './SchemaService.js'
import memoryService, { type MemoryUpdateInput } from './MemoryService.js'
import pendingStore from './PendingStore.js'
import type { PendingDialogueData } from './PendingStore.js'
import type { ISnapshot } from '../models/Snapshot.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'
import type { IAssistantContent, DialogueType } from '../models/Conversation.js'
import type { AgentRole } from '../models/PlanningArtifact.js'

// XiangDi 服务地址
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'
const XIANGDI_INTERNAL_TOKEN = process.env.XIANGDI_INTERNAL_TOKEN

/** 向 XiangDi 发起请求的超时（毫秒），默认 10 分钟 */
const PROXY_REQUEST_TIMEOUT_MS = Number(process.env.AI_PROXY_TIMEOUT_MS ?? 600_000)

/** SSE 心跳间隔（毫秒） */
const SSE_HEARTBEAT_INTERVAL_MS = 20_000

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function getActiveModelName(): string {
  const provider = process.env.LLM_PROVIDER ?? 'deepseek'
  if (provider === 'kimi') {
    return process.env.KIMI_MODEL ?? 'kimi-k2.6'
  }
  return process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro'
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 2)
}

// ─── SSE 工具函数 ─────────────────────────────────────────────────────────────

function sseWrite(res: ServerResponse, event: string, data: unknown): void {
  if (res.writableEnded) return
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${event}\ndata: ${payload}\n\n`)
}

function sseDone(res: ServerResponse): void {
  if (!res.writableEnded) res.end()
}

function startHeartbeat(res: ServerResponse): () => void {
  const timer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(timer)
      return
    }
    res.write(':ping\n\n')
  }, SSE_HEARTBEAT_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

// ─── 统一 SSE 代理核心 ────────────────────────────────────────────────────────

interface ProxySSECallbacks {
  onDone: (appJSON: string, assistantContent: IAssistantContent[], roundSummary: string | null) => Promise<void>
  onError?: () => Promise<void>
  onInterrupt?: () => Promise<void>
  /** schema_update 事件：调用者决定直接写 DB 还是暂存 */
  onSchemaUpdate?: (collections: ICollectionDef[]) => void
  /** memory_update 事件：调用者决定直接写 DB 还是暂存 */
  onMemoryUpdate?: (memoryInput: MemoryUpdateInput) => void
  /** planning_progress 事件：某个 Agent 完成 */
  onPlanningProgress?: (agent: AgentRole, entry: { output: unknown; reasoning?: string; tokenUsage: { input: number; output: number }; durationMs: number }) => Promise<void>
  /** planning_progress 事件：某个 Agent 失败 */
  onPlanningFailed?: (agent: AgentRole) => Promise<void>
}

function proxySSECore(
  xiangdiPath: string,
  requestBody: string,
  clientRes: ServerResponse,
  callbacks: ProxySSECallbacks,
  _appId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(xiangdiPath, XIANGDI_BASE_URL)
    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 3002),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'Accept': 'text/event-stream',
        ...(XIANGDI_INTERNAL_TOKEN ? { 'X-Internal-Token': XIANGDI_INTERNAL_TOKEN } : {}),
      },
    }

    let settled = false
    let upstreamReq: http.ClientRequest | null = null

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    const stopHeartbeat = startHeartbeat(clientRes)

    const onClientClose = () => {
      if (!settled && upstreamReq) {
        upstreamReq.destroy(new Error('Client disconnected'))
      }
    }
    clientRes.on('close', onClientClose)

    function cleanup(): void {
      stopHeartbeat()
      clientRes.removeListener('close', onClientClose)
    }

    // ── 收集状态 ─────────────────────────────────────────────────────────────
    let textBuffer = ''
    let roundSummaryBuffer: string | null = null
    const assistantContentBuffer: IAssistantContent[] = []

    function dispatchEvent(currentEvent: string, dataStr: string): void {
      if (!currentEvent || !dataStr) return

      if (currentEvent === 'text_delta') {
        try {
          const parsed = JSON.parse(dataStr) as { text?: string }
          if (parsed.text) textBuffer += parsed.text
        } catch { /* ignore */ }
      }

      if (currentEvent === 'tool_call') {
        try {
          const parsed = JSON.parse(dataStr) as { id: string; name: string; input: unknown }
          assistantContentBuffer.push({ type: 'tool_call', id: parsed.id, name: parsed.name, input: parsed.input })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'tool_result') {
        try {
          const parsed = JSON.parse(dataStr) as { id: string; result: unknown; isError: boolean }
          assistantContentBuffer.push({ type: 'tool_result', id: parsed.id, result: parsed.result, isError: parsed.isError ?? false })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'app_snapshot') {
        try {
          const parsed = JSON.parse(dataStr) as { appJSON: string }
          assistantContentBuffer.push({ type: 'app_snapshot', appJSON: parsed.appJSON ?? '' })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'schema_update') {
        try {
          const parsed = JSON.parse(dataStr) as { collections?: ICollectionDef[] }
          if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
            callbacks.onSchemaUpdate?.(parsed.collections)
            assistantContentBuffer.push({ type: 'schema_update', collections: parsed.collections })
          }
        } catch { /* ignore */ }
      }

      if (currentEvent === 'disambiguation') {
        try {
          const parsed = JSON.parse(dataStr)
          assistantContentBuffer.push({ type: 'disambiguation', options: parsed })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'planning_progress') {
        try {
          const parsed = JSON.parse(dataStr) as {
            agent: AgentRole
            status: 'started' | 'completed' | 'failed'
            output?: unknown
            reasoning?: string
            tokenUsage?: { input: number; output: number }
            durationMs?: number
          }
          if (parsed.status === 'completed' && parsed.output && callbacks.onPlanningProgress) {
            callbacks.onPlanningProgress(parsed.agent, {
              output: parsed.output,
              reasoning: parsed.reasoning,
              tokenUsage: parsed.tokenUsage ?? { input: 0, output: 0 },
              durationMs: parsed.durationMs ?? 0,
            }).catch(err => {
              console.error('[AiService] planning_progress 处理失败:', err)
            })
          }
          if (parsed.status === 'failed' && callbacks.onPlanningFailed) {
            callbacks.onPlanningFailed(parsed.agent).catch(err => {
              console.error('[AiService] planning_failed 处理失败:', err)
            })
          }
        } catch { /* ignore */ }
      }

      if (currentEvent === 'round_summary') {
        try {
          const parsed = JSON.parse(dataStr) as { summary?: string }
          if (parsed.summary) roundSummaryBuffer = parsed.summary
        } catch { /* ignore */ }
      }

      if (currentEvent === 'memory_update') {
        try {
          const parsed = JSON.parse(dataStr) as {
            episode?: {
              title: string; content: string; outcome: string
              lessons: string[]; involvedEntities: string[]; tags: string[]; importance: number
            } | null
            facts?: Array<{ category: string; content: string; confidence: number }>
          }
          const memoryInput: MemoryUpdateInput = {
            episode: (parsed.episode ?? null) as MemoryUpdateInput['episode'],
            facts: (parsed.facts ?? []) as MemoryUpdateInput['facts'],
          }
          callbacks.onMemoryUpdate?.(memoryInput)
        } catch { /* ignore */ }
        // memory_update 不转发给前端
        return
      }

      if (currentEvent === 'done') {
        try {
          const parsed = JSON.parse(dataStr) as { appJSON?: string }
          const finalAppJSON = parsed.appJSON ?? ''
          if (textBuffer) {
            assistantContentBuffer.unshift({ type: 'text', text: textBuffer })
          }
          assistantContentBuffer.push({ type: 'done', appJSON: finalAppJSON })
          callbacks.onDone(finalAppJSON, assistantContentBuffer, roundSummaryBuffer).catch((err) => {
            console.error('[AiService] onDone 回调失败:', err)
          })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'error') {
        try {
          const parsed = JSON.parse(dataStr) as { message?: string }
          assistantContentBuffer.push({ type: 'error', message: parsed.message ?? '未知错误' })
        } catch { /* ignore */ }
        callbacks.onError?.().catch((err) => {
          console.error('[AiService] onError 回调失败:', err)
        })
      }

      if (currentEvent === 'interrupt') {
        callbacks.onInterrupt?.().catch((err) => {
          console.error('[AiService] onInterrupt 回调失败:', err)
        })
      }

      // 透传所有非 memory_update 事件给前端
      sseWrite(clientRes, currentEvent, dataStr)

      const socket = clientRes.socket
      if (socket && !socket.destroyed) {
        socket.cork()
        process.nextTick(() => socket.uncork())
      }
    }

    function parseBuffer(buf: string): string {
      const blocks = buf.split('\n\n')
      const remaining = blocks.pop() ?? ''
      for (const block of blocks) {
        if (!block.trim()) continue
        let currentEvent = ''
        let dataStr = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && !dataStr) {
            dataStr = line.slice(6)
          }
        }
        dispatchEvent(currentEvent, dataStr)
      }
      return remaining
    }

    let lineBuffer = ''

    upstreamReq = transport.request(options, (upstream: IncomingMessage) => {
      if (upstream.statusCode && upstream.statusCode >= 400) {
        callbacks.onError?.().catch(() => {})
        settle(() => reject(new Error(`XiangDi 服务返回错误状态码: ${upstream.statusCode}`)))
        return
      }

      upstream.on('data', (chunk: Buffer) => {
        if (settled) return
        lineBuffer += chunk.toString()
        lineBuffer = parseBuffer(lineBuffer)
      })

      upstream.on('end', () => {
        if (lineBuffer.trim()) {
          parseBuffer(lineBuffer + '\n\n')
          lineBuffer = ''
        }
        sseDone(clientRes)
        settle(() => resolve())
      })

      upstream.on('error', (err) => {
        if (settled) return
        callbacks.onError?.().catch(() => {})
        sseWrite(clientRes, 'error', { message: err.message })
        sseDone(clientRes)
        settle(() => reject(err))
      })
    })

    upstreamReq.setTimeout(PROXY_REQUEST_TIMEOUT_MS, () => {
      if (!settled) {
        upstreamReq?.destroy(new Error(`XiangDi 请求超时 (${PROXY_REQUEST_TIMEOUT_MS}ms)`))
      }
    })

    upstreamReq.on('error', (err) => {
      if (settled) return
      if (err.message === 'Client disconnected') {
        sseDone(clientRes)
        settle(() => resolve())
        return
      }
      callbacks.onError?.().catch(() => {})
      const message = `无法连接到 XiangDi 服务 (${XIANGDI_BASE_URL}): ${err.message}`
      sseWrite(clientRes, 'error', { message })
      sseDone(clientRes)
      settle(() => reject(new Error(message)))
    })

    upstreamReq.write(requestBody)
    upstreamReq.end()
  })
}

// ─── Per-App 并发互斥锁 ──────────────────────────────────────────────────────

const appLockMap = new Map<string, Promise<void>>()

function withAppLock<T>(appId: string, fn: () => Promise<T>): Promise<T> {
  const prev = appLockMap.get(appId) ?? Promise.resolve()
  let releaseLock!: () => void
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve })
  appLockMap.set(appId, lockPromise)

  return prev.then(() => fn()).finally(() => {
    if (appLockMap.get(appId) === lockPromise) {
      appLockMap.delete(appId)
    }
    releaseLock()
  })
}

// ─── AiService ────────────────────────────────────────────────────────────────

class AiService {
  /**
   * 处理一次 AI 对话请求，通过 SSE 流式推送进度
   *
   * - chat 模式：直接写 DB（无副作用回滚需求）
   * - task 模式：应用状态暂存到 Snapshot 表，对话元数据暂存在 PendingStore，等 confirm 后同步
   */
  async runWithSSE(
    appId: string,
    prompt: string,
    type: DialogueType,
    images: Array<{ url: string; alt?: string }>,
    res: ServerResponse,
  ): Promise<void> {
    return withAppLock(appId, () => this._runWithSSECore(appId, prompt, type, images, res))
  }

  private async _runWithSSECore(
    appId: string,
    prompt: string,
    type: DialogueType,
    images: Array<{ url: string; alt?: string }>,
    res: ServerResponse,
  ): Promise<void> {
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }
    res.socket?.setNoDelay(true)

    try {
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)

      await conversationService.getOrCreate(appId)

      if (type === 'task') {
        await this._runTaskMode(appId, prompt, type, images, res)
      } else {
        await this._runChatMode(appId, prompt, type, images, res)
      }
    } catch (err) {
      if (err instanceof ContextBudgetOverflowError) {
        sseWrite(res, 'error', { code: err.code, message: err.message, details: err.details })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        sseWrite(res, 'error', { message })
      }
      sseDone(res)
    }
  }

  /**
   * Chat 模式：直接写 DB（无副作用回滚需求）
   */
  private async _runChatMode(
    appId: string,
    prompt: string,
    type: DialogueType,
    images: Array<{ url: string; alt?: string }>,
    res: ServerResponse,
  ): Promise<void> {
    const { dialogueId } = await conversationService.createDialogue(appId, type, { prompt, images })
    const threadId = `${appId}:${dialogueId.toString()}`
    await conversationService.setThreadInfo(appId, dialogueId, threadId, 'running')

    const agentMemoryText = await memoryService.recall(appId, prompt)
    const contextOptions: ContextBuildOptions = {
      modelName: getActiveModelName(),
      systemPromptTokens: 2500,
      agentMemoryTokens: estimateTokens(agentMemoryText ?? ''),
      currentPromptTokens: estimateTokens(prompt),
    }
    const layeredContext = await contextBuilder.build(appId, prompt, contextOptions)
    const { contextSummary, recentMessages: historyMessages } = layeredContext

    const imageUrls = images.length > 0 ? images.map(img => img.url) : undefined
    const requestBody = JSON.stringify({
      appId,
      prompt,
      threadId,
      mode: type,
      previousMessages: historyMessages,
      ...(contextSummary ? { memoryHint: contextSummary } : {}),
      ...(agentMemoryText ? { agentMemory: agentMemoryText } : {}),
      ...(imageUrls ? { images: imageUrls } : {}),
    })

    await proxySSECore('/ai/run', requestBody, res, {
      onDone: async (finalAppJSON, assistantContent, roundSummary) => {
        await Promise.all([
          applicationService.updateApplication(appId, { appJSON: finalAppJSON }),
          conversationService.appendAssistantMessage(appId, dialogueId, assistantContent),
          conversationService.updateThreadStatus(appId, dialogueId, 'completed'),
        ])
        if (roundSummary) {
          this.persistDialogueSummary(appId, dialogueId, roundSummary).catch(err => {
            console.error('[AiService] 对话摘要持久化失败:', err)
          })
        }
      },
      onError: async () => {
        await conversationService.updateThreadStatus(appId, dialogueId, 'failed').catch(err => {
          console.error('[AiService] 更新 threadStatus(failed) 失败:', err)
        })
      },
      onSchemaUpdate: (collections) => {
        SchemaService.setCollections(appId, collections).catch(err => {
          console.error('[AiService] Schema 写入失败:', err)
        })
      },
      onMemoryUpdate: (memoryInput) => {
        memoryService.handleMemoryUpdate(appId, memoryInput).catch(err => {
          console.error('[AiService] Agent 记忆写入失败:', err)
        })
      },
    }, appId)
  }

  /**
   * Task 模式：应用状态暂存到 Snapshot 表，对话元数据暂存在 PendingStore，等 confirm 后同步
   */
  private async _runTaskMode(
    appId: string,
    prompt: string,
    type: DialogueType,
    images: Array<{ url: string; alt?: string }>,
    res: ServerResponse,
  ): Promise<void> {
    // 预生成 dialogueId，不写持久化表
    const dialogueId = new Types.ObjectId()
    const threadId = `${appId}:${dialogueId.toString()}`

    // 创建 pending Snapshot（写入 MongoDB Snapshot 集合，status=pending）
    // Snapshot 以当前持久化表的状态作为基线
    await snapshotService.createPending(appId, dialogueId)

    // 对话元数据暂存在 PendingStore（内存）
    pendingStore.create({
      appId,
      dialogueId: dialogueId.toString(),
      threadId,
      type,
      userMessage: { prompt, images },
    })

    // 构建上下文
    const agentMemoryText = await memoryService.recall(appId, prompt)
    const contextOptions: ContextBuildOptions = {
      modelName: getActiveModelName(),
      systemPromptTokens: 2500,
      agentMemoryTokens: estimateTokens(agentMemoryText ?? ''),
      currentPromptTokens: estimateTokens(prompt),
    }
    const layeredContext = await contextBuilder.build(appId, prompt, contextOptions)
    const { contextSummary, recentMessages: historyMessages } = layeredContext

    const imageUrls = images.length > 0 ? images.map(img => img.url) : undefined
    const requestBody = JSON.stringify({
      appId,
      prompt,
      threadId,
      mode: type,
      previousMessages: historyMessages,
      ...(contextSummary ? { memoryHint: contextSummary } : {}),
      ...(agentMemoryText ? { agentMemory: agentMemoryText } : {}),
      ...(imageUrls ? { images: imageUrls } : {}),
      requireApproval: true,
    })

    // 代理 SSE：应用状态写 Snapshot，对话元数据写 PendingStore
    await proxySSECore('/ai/run', requestBody, res, {
      onDone: async (finalAppJSON, assistantContent, roundSummary) => {
        // 应用状态 → Snapshot
        await snapshotService.updateAppJSON(appId, finalAppJSON)
        await snapshotService.markDone(appId)
        // 对话元数据 → PendingStore
        pendingStore.setFinalAppJSON(appId, finalAppJSON)
        pendingStore.setAssistantContent(appId, assistantContent)
        if (roundSummary) {
          pendingStore.setRoundSummary(appId, roundSummary)
        }
        pendingStore.updateStatus(appId, 'done')
      },
      onError: async () => {
        // 即使失败，Snapshot 中可能已有部分改动，标记为 done 让用户选择
        await snapshotService.markDoneOnInterrupt(appId)
        pendingStore.updateStatus(appId, 'failed')
      },
      onInterrupt: async () => {
        await snapshotService.markDoneOnInterrupt(appId)
        pendingStore.updateStatus(appId, 'interrupted')
      },
      onSchemaUpdate: (collections) => {
        // Schema 变更 → Snapshot（持久化）+ PendingStore（confirm 时写 DB 兼容）
        snapshotService.updateCollections(appId, collections.map(col => ({
          name: col.name,
          displayName: col.displayName,
          fields: (col.fields ?? []).map(f => ({
            name: f.name,
            displayName: f.displayName,
            type: f.type,
            required: f.required ?? false,
            defaultValue: f.defaultValue,
            refCollection: f.refCollection,
            enumValues: f.enumValues,
          })),
        }))).catch(err => {
          console.error('[AiService] Snapshot collections 更新失败:', err)
        })
        pendingStore.setSchemaUpdates(appId, collections)
      },
      onMemoryUpdate: (memoryInput) => {
        pendingStore.setMemoryUpdates(appId, memoryInput)
      },
      onPlanningProgress: async (agent, entry) => {
        pendingStore.addPlanningEntry(appId, { agent, ...entry })
      },
      onPlanningFailed: async (agent) => {
        pendingStore.setPlanningFailed(appId, agent)
      },
    }, appId)
  }

  // ─── Resume（断点续跑） ─────────────────────────────────────────────────────

  /**
   * 从 checkpoint 恢复 AI 执行
   *
   * task 模式：从 Snapshot 读取当前 appJSON（含已有改动），继续执行
   * 恢复后若成功完成（done），Snapshot/PendingStore 状态变为 done，仍等 confirm。
   */
  async resumeSSE(
    appId: string,
    res: ServerResponse,
    dialogueId?: string,
    resumeValue?: unknown
  ): Promise<void> {
    return withAppLock(appId, () => this._resumeSSECore(appId, res, dialogueId, resumeValue))
  }

  private async _resumeSSECore(
    appId: string,
    res: ServerResponse,
    dialogueId?: string,
    resumeValue?: unknown
  ): Promise<void> {
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }
    res.socket?.setNoDelay(true)

    try {
      // 1. 确定要恢复的对话
      let resolvedThreadId: string

      // 优先从 PendingStore 中查找（task 模式的 interrupted）
      const pending = pendingStore.get(appId)
      if (pending && pending.status === 'interrupted') {
        resolvedThreadId = pending.threadId
      } else if (dialogueId) {
        // 兼容：从 DB 中查找（chat 模式或旧数据）
        resolvedThreadId = `${appId}:${dialogueId}`
      } else {
        // 从 DB 查找最近 pending dialogue
        const dbPending = await conversationService.getLastPendingDialogue(appId)
        if (!dbPending) {
          throw new Error('没有找到可恢复的执行线程')
        }
        resolvedThreadId = dbPending.threadId
      }

      // 2. 如果是 task 模式，更新 PendingStore 状态
      if (pending && pending.status === 'interrupted') {
        pendingStore.updateStatus(appId, 'streaming')
      }

      // 3. 读取 appJSON：task 模式从 Snapshot 读取（含已有改动），chat 模式从持久化表读取
      let appJSON: string
      if (pending) {
        const snapshot = await snapshotService.getActivePending(appId)
        appJSON = snapshot?.appJSON ?? ''
      } else {
        const app = await applicationService.getApplicationById(appId)
        if (!app) throw new Error(`应用 ${appId} 不存在`)
        appJSON = app.appJSON ?? ''
      }

      // 4. 构造请求体
      const requestBody = JSON.stringify({
        threadId: resolvedThreadId,
        appJSON,
        ...(resumeValue !== undefined ? { resumeValue } : {}),
      })

      // 5. 根据是否有 pending 决定回调策略
      if (pending) {
        // task 模式 resume：应用状态继续写 Snapshot，对话元数据写 PendingStore
        await proxySSECore('/ai/resume', requestBody, res, {
          onDone: async (finalAppJSON, assistantContent, roundSummary) => {
            await snapshotService.updateAppJSON(appId, finalAppJSON)
            await snapshotService.markDone(appId)
            pendingStore.setFinalAppJSON(appId, finalAppJSON)
            pendingStore.setAssistantContent(appId, assistantContent)
            if (roundSummary) {
              pendingStore.setRoundSummary(appId, roundSummary)
            }
            pendingStore.updateStatus(appId, 'done')
          },
          onError: async () => {
            await snapshotService.markDoneOnInterrupt(appId)
            pendingStore.updateStatus(appId, 'failed')
          },
          onInterrupt: async () => {
            await snapshotService.markDoneOnInterrupt(appId)
            pendingStore.updateStatus(appId, 'interrupted')
          },
          onSchemaUpdate: (collections) => {
            snapshotService.updateCollections(appId, collections.map(col => ({
              name: col.name,
              displayName: col.displayName,
              fields: (col.fields ?? []).map(f => ({
                name: f.name,
                displayName: f.displayName,
                type: f.type,
                required: f.required ?? false,
                defaultValue: f.defaultValue,
                refCollection: f.refCollection,
                enumValues: f.enumValues,
              })),
            }))).catch(err => {
              console.error('[AiService] Snapshot collections 更新失败:', err)
            })
            pendingStore.setSchemaUpdates(appId, collections)
          },
          onMemoryUpdate: (memoryInput) => {
            pendingStore.setMemoryUpdates(appId, memoryInput)
          },
          onPlanningProgress: async (agent, entry) => {
            pendingStore.addPlanningEntry(appId, { agent, ...entry })
          },
          onPlanningFailed: async (agent) => {
            pendingStore.setPlanningFailed(appId, agent)
          },
        }, appId)
      } else {
        // chat 模式 resume（罕见）：直接写 DB
        const resolvedDialogueId = dialogueId
          ? new Types.ObjectId(dialogueId)
          : (await conversationService.getLastPendingDialogue(appId))!.dialogueId

        await conversationService.updateThreadStatus(appId, resolvedDialogueId, 'running')

        await proxySSECore('/ai/resume', requestBody, res, {
          onDone: async (finalAppJSON, assistantContent, roundSummary) => {
            await Promise.all([
              applicationService.updateApplication(appId, { appJSON: finalAppJSON }),
              conversationService.appendAssistantMessage(appId, resolvedDialogueId, assistantContent),
              conversationService.updateThreadStatus(appId, resolvedDialogueId, 'completed'),
            ])
            if (roundSummary) {
              this.persistDialogueSummary(appId, resolvedDialogueId, roundSummary).catch(err => {
                console.error('[AiService] resume 对话摘要持久化失败:', err)
              })
            }
          },
          onError: async () => {
            await conversationService.updateThreadStatus(appId, resolvedDialogueId, 'failed').catch(err => {
              console.error('[AiService] 更新 threadStatus(failed) 失败:', err)
            })
          },
          onInterrupt: async () => {
            await conversationService.updateThreadStatus(appId, resolvedDialogueId, 'interrupted').catch(err => {
              console.error('[AiService] 更新 threadStatus(interrupted) 失败:', err)
            })
          },
          onSchemaUpdate: (collections) => {
            SchemaService.setCollections(appId, collections).catch(err => {
              console.error('[AiService] Schema 写入失败:', err)
            })
          },
          onMemoryUpdate: (memoryInput) => {
            memoryService.handleMemoryUpdate(appId, memoryInput).catch(err => {
              console.error('[AiService] Agent 记忆写入失败:', err)
            })
          },
        }, appId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sseWrite(res, 'error', { message })
      sseDone(res)
    }
  }

  // ─── Confirm / Discard（事务确认/撤销）──────────────────────────────────────

  /**
   * 确认对话：
   *   1. snapshotService.confirm() — 将 Snapshot 中的应用状态同步到持久化表
   *   2. 从 PendingStore 取对话元数据，写入 Conversation 集合
   *
   * 这是"对话即事务"的 commit 操作。
   * 使用 withAppLock 防止与 SSE 流（runWithSSE/resumeSSE）竞态。
   */
  async confirmDialogue(appId: string): Promise<{ dialogueId: string }> {
    return withAppLock(appId, () => this._confirmDialogueCore(appId))
  }

  private async _confirmDialogueCore(appId: string): Promise<{ dialogueId: string }> {
    // ─── Step 1: 确认 Snapshot（应用状态 → 持久化表） ────────────────────────
    const snapshot = await snapshotService.confirm(appId)
    const dialogueId = snapshot.dialogueId

    // ─── Step 2: 对话元数据 → Conversation 集合 ─────────────────────────────
    const pending = pendingStore.getConfirmable(appId)
    if (!pending) {
      // Snapshot 已确认但 PendingStore 无数据（进程重启恢复场景）
      // 应用状态已同步，但对话消息丢失，返回 dialogueId 即可
      return { dialogueId: dialogueId.toString() }
    }

    // 1. 创建 Dialogue + user 消息 → 写 DB
    await conversationService.createDialogueWithId(
      appId,
      dialogueId,
      pending.type,
      { prompt: pending.userMessage.prompt, images: pending.userMessage.images }
    )

    // 2. 设置 threadInfo
    await conversationService.setThreadInfo(appId, dialogueId, pending.threadId, 'completed')

    // 3. 追加 assistant 消息
    if (pending.assistantContent.length > 0) {
      await conversationService.appendAssistantMessage(appId, dialogueId, pending.assistantContent)
    }

    // 4. 写 Agent 记忆
    if (pending.memoryUpdates) {
      await memoryService.handleMemoryUpdate(appId, pending.memoryUpdates)
    }

    // 5. 写规划产物（如果有）
    if (pending.planningEntries.length > 0) {
      const artifact = await planningArtifactService.create(appId, dialogueId)
      const artifactId = artifact._id as Types.ObjectId
      await conversationService.setPlanningArtifactId(appId, dialogueId, artifactId)
      for (const entry of pending.planningEntries) {
        await planningArtifactService.writeAgentOutput(artifactId, entry.agent, {
          output: entry.output,
          reasoning: entry.reasoning,
          tokenUsage: entry.tokenUsage,
          durationMs: entry.durationMs,
        })
      }
      if (pending.planningFailedAgent) {
        await planningArtifactService.updateStatus(artifactId, 'failed', { failedAt: pending.planningFailedAgent })
      } else {
        await planningArtifactService.updateStatus(artifactId, 'completed', { completedAt: new Date() })
      }
    }

    // 6. 持久化对话摘要 + embedding（异步）
    if (pending.roundSummary) {
      this.persistDialogueSummary(appId, dialogueId, pending.roundSummary).catch(err => {
        console.error('[AiService] 对话摘要持久化失败:', err)
      })
    }

    // 7. 清除 PendingStore
    await pendingStore.delete(appId)

    return { dialogueId: dialogueId.toString() }
  }

  /**
   * 撤销对话：Snapshot 标记为 discarded + 清除 PendingStore
   *
   * 这是"对话即事务"的 rollback 操作。
   * 持久化表不受影响（应用状态恢复到对话开始前）。
   * 使用 withAppLock 防止与 SSE 流竞态。
   */
  async discardDialogue(appId: string): Promise<void> {
    return withAppLock(appId, async () => {
      await snapshotService.discard(appId)
      await pendingStore.delete(appId)
    })
  }

  /**
   * 获取待确认的 pending 对话数据
   * 用于前端重新加载页面时恢复"确认/撤销"状态
   *
   * 注意：进程重启后 PendingStore（内存）数据丢失，但 Snapshot 仍在 MongoDB 中。
   * 前端可通过 getStatus 检测到 Snapshot 存在（status=done），此时只能 confirm/discard，
   * 但对话消息等元数据将丢失（可接受的降级行为）。
   */
  getPendingDialogue(appId: string): PendingDialogueData | null {
    return pendingStore.get(appId)
  }

  /**
   * 获取待确认的 Snapshot（用于进程恢复场景，PendingStore 可能为空但 Snapshot 仍在）
   */
  async getPendingSnapshot(appId: string): Promise<ISnapshot | null> {
    return snapshotService.getActivePending(appId)
  }

  // ─── 查询接口 ──────────────────────────────────────────────────────────────

  /**
   * 查询应用当前的 AI 执行状态
   *
   * 优先级：PendingStore（进程内） → Snapshot（MongoDB） → Conversation DB
   */
  async getStatus(appId: string): Promise<{ dialogueId: string; threadId: string; status: string; canResume: boolean; canConfirm: boolean } | null> {
    // 1. 优先检查 PendingStore（进程内状态）
    const pending = pendingStore.get(appId)
    if (pending) {
      if (pending.status === 'streaming' || pending.status === 'interrupted') {
        return {
          dialogueId: pending.dialogueId,
          threadId: pending.threadId,
          status: pending.status === 'streaming' ? 'running' : 'interrupted',
          canResume: pending.status === 'interrupted',
          canConfirm: false,
        }
      }
      if (pending.status === 'done' || pending.status === 'failed') {
        return {
          dialogueId: pending.dialogueId,
          threadId: pending.threadId,
          status: pending.status === 'done' ? 'awaiting_confirm' : 'failed',
          canResume: false,
          canConfirm: true,
        }
      }
    }

    // 2. 再查 Snapshot（进程重启恢复场景，PendingStore 空但 Snapshot 仍在）
    const snapshot = await snapshotService.getActivePending(appId)
    if (snapshot && snapshot.status === 'done') {
      return {
        dialogueId: snapshot.dialogueId.toString(),
        threadId: `${appId}:${snapshot.dialogueId.toString()}`,
        status: 'awaiting_confirm',
        canResume: false,
        canConfirm: true,
      }
    }

    // 3. 最后查 DB（chat 模式的旧数据）
    const dbPending = await conversationService.getLastPendingDialogue(appId)
    if (!dbPending) return null
    return {
      dialogueId: dbPending.dialogueId.toString(),
      threadId: dbPending.threadId,
      status: dbPending.status,
      canResume: dbPending.status === 'interrupted' || dbPending.status === 'running',
      canConfirm: false,
    }
  }

  /**
   * 转发消歧响应到 XiangDi 服务
   */
  async respondToDisambiguation(choiceId: string): Promise<unknown> {
    return this.proxyJSON('POST', '/ai/disambiguation-response', { choiceId })
  }

  /**
   * 获取所有可用 LLM provider 及当前激活状态
   */
  async getModels(): Promise<unknown> {
    return this.proxyJSON('GET', '/ai/models', null)
  }

  /**
   * 切换激活的 LLM provider
   */
  async switchModel(provider: string): Promise<unknown> {
    return this.proxyJSON('POST', '/ai/models/switch', { provider })
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────────

  /**
   * 持久化对话摘要 + 调用知识服务生成向量
   */
  private async persistDialogueSummary(
    appId: string,
    dialogueId: Types.ObjectId,
    summary: string
  ): Promise<void> {
    const { default: knowledgeClient } = await import('./KnowledgeClient.js')
    const embedding = await knowledgeClient.embedPassage(summary)

    if (!embedding) {
      console.warn('[AiService] Embedding 生成失败（知识服务不可用），dialogue 将无向量')
    }

    await conversationService.setSummary(appId, dialogueId, summary, embedding)
  }

  /**
   * 通用 JSON 请求代理（非 SSE）
   */
  private proxyJSON(method: 'GET' | 'POST', path: string, body: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, XIANGDI_BASE_URL)
      const isHttps = url.protocol === 'https:'
      const transport = isHttps ? https : http

      const bodyStr = body !== null ? JSON.stringify(body) : undefined

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 3002),
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...(XIANGDI_INTERNAL_TOKEN ? { 'X-Internal-Token': XIANGDI_INTERNAL_TOKEN } : {}),
        },
      }

      const req = transport.request(options, (res: IncomingMessage) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve({ raw: data })
          }
        })
        res.on('error', reject)
      })

      req.on('error', (err) => {
        reject(new Error(`无法连接到 XiangDi 服务 (${XIANGDI_BASE_URL}): ${err.message}`))
      })

      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  }
}

export default new AiService()
