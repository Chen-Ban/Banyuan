/**
 * AI 服务（HTTP 代理层）— V5（Dialogue 单一数据路径，ADR-039 Phase 4）
 *
 * 核心设计：
 *   - Dialogue 是唯一权威状态机，phase 字段驱动全生命周期
 *   - SSE 期间所有状态（appJSON/collections/memoryUpdates/planningEntries）写入 Dialogue
 *   - chat 模式：start → responding → done（直接 commit）
 *   - task 模式：start → planning → awaiting_confirm → executing → committing → done
 *   - confirm 从 Dialogue 读取 appJSON/collections 落库，无需 Snapshot/PendingStore 中间层
 *   - resume 功能已废弃（Dialogue 不支持 interrupted 状态）
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ Dialogue 集合（唯一暂存）
 *                     ↕ 持久化表（confirm 后同步）
 *
 * SSE 事件类型（与 XiangDi 服务保持一致）：
 *   text_delta / tool_call / tool_result / app_snapshot / schema_update
 *   round_summary / memory_update / planning_progress / planning_failed / done / error
 */

import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import https from 'https'
import { Types } from 'mongoose'
import applicationService from './ApplicationService.js'
import conversationService from './ConversationService.js'
import contextBuilder, { ContextBudgetOverflowError } from './ContextBuilder.js'
import type { ContextBuildOptions } from './ContextBuilder.js'
import { SchemaService } from './SchemaService.js'
import memoryService, { type MemoryUpdateInput } from './MemoryService.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'
import type { IAssistantContent, DialogueType } from '../models/Conversation.js'
import type { AgentRole } from '../models/PlanningArtifact.js'
import dialogueService from './DialogueService.js'
import Conversation from '../models/Conversation.js'
import { PhaseController } from './PhaseController.js'

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

/** proxySSECore 可选配置 */
interface ProxySSEOptions {
  /** Phase 控制器：传入后自动驱动 phase 转移 */
  phaseCtrl?: PhaseController
}

function proxySSECore(
  xiangdiPath: string,
  requestBody: string,
  clientRes: ServerResponse,
  callbacks: ProxySSECallbacks,
  _appId: string,
  options?: ProxySSEOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(xiangdiPath, XIANGDI_BASE_URL)
    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    const reqOptions: http.RequestOptions = {
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

    const phaseCtrl = options?.phaseCtrl

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
          // Phase 驱动：先执行 onDone 数据写入，再推进 phase
          // 确保 phase=done 时所有数据已落盘（避免查询竞态）
          callbacks.onDone(finalAppJSON, assistantContentBuffer, roundSummaryBuffer).then(async () => {
            if (phaseCtrl && !phaseCtrl.isTerminal()) {
              const phase = phaseCtrl.getPhase()
              if (phase === 'responding') {
                await phaseCtrl.transition('done')
              } else if (phase === 'planning') {
                await phaseCtrl.transition('awaiting_confirm')
              }
            }
          }).catch((err) => {
            console.error('[AiService] onDone 回调或 phase 转移失败:', err)
            // onDone 失败时尝试标记 failed
            if (phaseCtrl && !phaseCtrl.isTerminal()) {
              phaseCtrl.fail().catch(() => {})
            }
          })
        } catch { /* ignore */ }
      }

      if (currentEvent === 'error') {
        try {
          const parsed = JSON.parse(dataStr) as { message?: string }
          assistantContentBuffer.push({ type: 'error', message: parsed.message ?? '未知错误' })
        } catch { /* ignore */ }
        // Phase 驱动：error → failed
        if (phaseCtrl && !phaseCtrl.isTerminal()) {
          phaseCtrl.fail().catch(() => {})
        }
        callbacks.onError?.().catch((err) => {
          console.error('[AiService] onError 回调失败:', err)
        })
      }

      if (currentEvent === 'interrupt') {
        // Phase 驱动：interrupt → discarded (connection_lost)
        if (phaseCtrl && !phaseCtrl.isTerminal()) {
          phaseCtrl.interrupt('connection_lost').catch(() => {})
        }
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

    upstreamReq = transport.request(reqOptions, (upstream: IncomingMessage) => {
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
   * Phase 4 统一路径：Dialogue 为唯一数据载体
   * - chat 模式：onDone 直接落库到应用态三张表（无确认环节）
   * - task 模式：onDone 只写 Dialogue，等用户 confirm 再落库
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
      await this._runDialogue(appId, prompt, type, images, res, app.appJSON ?? '')
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
   * 统一对话执行（Phase 4：Dialogue 为唯一数据路径）
   *
   * chat 模式：onDone 直接落库（无确认环节），phase 走 responding → done
   * task 模式：onDone 只写 Dialogue，phase 走 planning → awaiting_confirm，等 confirm 落库
   */
  private async _runDialogue(
    appId: string,
    prompt: string,
    type: DialogueType,
    images: Array<{ url: string; alt?: string }>,
    res: ServerResponse,
    currentAppJSON: string,
  ): Promise<void> {
    // 1. 创建 Dialogue（唯一数据创建点）
    const conv = await conversationService.getOrCreate(appId)
    const dlgDoc = await dialogueService.create({
      appId,
      conversationId: conv._id as import('mongoose').Types.ObjectId,
      type,
      userMessage: { prompt, images },
      baseAppJSON: type === 'task' ? currentAppJSON : undefined,
    })
    const dialogueId = dlgDoc._id as import('mongoose').Types.ObjectId
    const threadId = `${appId}:${dialogueId.toString()}`
    await dialogueService.setThreadId(dialogueId, threadId)

    // 2. PhaseController 创建 + 初始 phase 推进
    const phaseCtrl = PhaseController.create(dialogueId, res)
    await phaseCtrl.transition(type === 'task' ? 'planning' : 'responding')

    // 3. 构建上下文
    const agentMemoryText = await memoryService.recall(appId, prompt)
    const contextOptions: ContextBuildOptions = {
      modelName: getActiveModelName(),
      systemPromptTokens: 2500,
      agentMemoryTokens: estimateTokens(agentMemoryText ?? ''),
      currentPromptTokens: estimateTokens(prompt),
    }
    const layeredContext = await contextBuilder.build(appId, prompt, contextOptions)
    const { contextSummary, recentMessages: historyMessages } = layeredContext

    // 4. 构造 requestBody
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
      ...(type === 'task' ? { requireApproval: true } : {}),
    })

    // 5. proxySSECore — 回调统一写 Dialogue
    await proxySSECore('/ai/run', requestBody, res, {
      onDone: async (finalAppJSON, assistantContent, roundSummary) => {
        // 5a. 写入 Dialogue（所有模式共享）
        await dialogueService.updateAppJSON(dialogueId, finalAppJSON)
        await dialogueService.appendAssistantContent(dialogueId, assistantContent)
        if (roundSummary) {
          await dialogueService.setRoundSummary(dialogueId, roundSummary)
        }

        // 5b. chat 模式：直接落库（无确认环节）
        if (type === 'chat') {
          await applicationService.updateApplication(appId, { appJSON: finalAppJSON })
          await Conversation.updateOne({ appId }, { $addToSet: { dialogueIds: dialogueId } })
          // chat 摘要异步生成 embedding
          if (roundSummary) {
            this.persistDialogueSummary(appId, dialogueId, roundSummary).catch(err => {
              console.error('[AiService] 对话摘要持久化失败:', err)
            })
          }
        }
        // task 模式：phase 自动驱动到 awaiting_confirm，等用户 confirm
      },
      onError: async () => {
        // Phase 由 PhaseController 在 dispatchEvent 中自动驱动到 failed
      },
      onInterrupt: async () => {
        // Phase 由 PhaseController 在 dispatchEvent 中自动驱动到 discarded
      },
      onSchemaUpdate: (collections) => {
        // Schema 变更写入 Dialogue
        const collectionSnapshots = collections.map(col => ({
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
        }))
        dialogueService.updateCollections(dialogueId, collectionSnapshots).catch(err => {
          console.error('[AiService] Dialogue collections 更新失败:', err)
        })
        // chat 模式同步落库
        if (type === 'chat') {
          SchemaService.setCollections(appId, collections).catch(err => {
            console.error('[AiService] Schema 写入失败:', err)
          })
        }
      },
      onMemoryUpdate: (memoryInput) => {
        if (type === 'chat') {
          // chat 直接写入 Agent 记忆
          memoryService.handleMemoryUpdate(appId, memoryInput).catch(err => {
            console.error('[AiService] Agent 记忆写入失败:', err)
          })
        } else {
          // task 暂存到 Dialogue，confirm 时落库
          dialogueService.setMemoryUpdates(dialogueId, memoryInput).catch(err => {
            console.error('[AiService] Dialogue memoryUpdates 写入失败:', err)
          })
        }
      },
      onPlanningProgress: async (agent, entry) => {
        await dialogueService.appendPlanningEntry(dialogueId, {
          agent,
          output: entry.output,
          reasoning: entry.reasoning,
          tokenUsage: entry.tokenUsage,
          durationMs: entry.durationMs,
        })
      },
      onPlanningFailed: async (agent) => {
        await dialogueService.setPlanningFailed(dialogueId, agent)
      },
    }, appId, { phaseCtrl })
  }

  // ─── Resume（已废弃） ──────────────────────────────────────────────────────

  /**
   * @deprecated ADR-039 Phase 4: resume 功能已废弃。
   * Dialogue 作为唯一状态机后，不再支持"中断-恢复"模式。
   * 保留方法签名以兼容路由层调用，但直接返回错误。
   */
  async resumeSSE(
    _appId: string,
    res: ServerResponse,
    _dialogueId?: string,
    _resumeValue?: unknown
  ): Promise<void> {
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }
    sseWrite(res, 'error', { message: 'resume 功能已废弃（ADR-039 Phase 4），请使用新的对话流程' })
    sseDone(res)
  }

  // ─── Confirm / Discard（事务确认/撤销）──────────────────────────────────────

  /**
   * 确认对话：Dialogue phase → executing → committing → done（ADR-039 Phase 4）
   *
   * 这是"对话即事务"的 commit 操作。
   * 使用 withAppLock 防止与 SSE 流竞态。
   */
  async confirmDialogue(appId: string): Promise<{ dialogueId: string }> {
    return withAppLock(appId, () => this._confirmDialogueCore(appId))
  }

  private async _confirmDialogueCore(appId: string): Promise<{ dialogueId: string }> {
    // ─── 纯 Dialogue 路径：从 Dialogue 读取状态并确认（ADR-039 Phase 4）────────
    const dlg = await dialogueService.getActiveByApp(appId)

    if (!dlg || dlg.phase !== 'awaiting_confirm') {
      throw new Error(`[AiService] confirmDialogue: 没有处于 awaiting_confirm 状态的对话 (appId=${appId})`)
    }

    const dlgId = dlg._id as Types.ObjectId

    // 1. Phase 推进：awaiting_confirm → executing
    await dialogueService.setPhase(dlgId, 'executing')

    // 2. 应用状态落库（从 Dialogue.appJSON 同步到持久化表）
    if (dlg.appJSON) {
      await applicationService.updateApplication(appId, { appJSON: dlg.appJSON })
    }

    // 3. Schema 落库（从 Dialogue.collections 同步）
    if (dlg.collections && dlg.collections.length > 0) {
      await SchemaService.setCollections(appId, dlg.collections as unknown as ICollectionDef[])
    }

    // 4. Phase 推进：executing → committing
    await dialogueService.setPhase(dlgId, 'committing')

    // 5. Conversation 集合写入（从 Dialogue.messages 提取 userContent / assistantContent）
    const userMsg = dlg.messages.find(m => m.role === 'user')
    const assistantMsgs = dlg.messages.filter(m => m.role === 'assistant')
    const assistantContent = assistantMsgs.flatMap(m => m.assistantContent ?? [])

    if (userMsg?.userContent) {
      await conversationService.createDialogueWithId(
        appId,
        dlgId,
        dlg.type,
        { prompt: userMsg.userContent.prompt, images: userMsg.userContent.images }
      )
    }
    if (dlg.threadId) {
      await conversationService.setThreadInfo(appId, dlgId, dlg.threadId, 'completed')
    }
    if (assistantContent.length > 0) {
      await conversationService.appendAssistantMessage(appId, dlgId, assistantContent)
    }

    // 6. Agent 记忆落库（从 Dialogue.memoryUpdates）
    if (dlg.memoryUpdates) {
      await memoryService.handleMemoryUpdate(appId, dlg.memoryUpdates)
    }

    // 7. 对话摘要向量化（从 Dialogue.summary）
    if (dlg.summary?.text) {
      this.persistDialogueSummary(appId, dlgId, dlg.summary.text).catch(err => {
        console.error('[AiService] 对话摘要持久化失败:', err)
      })
    }

    // 8. Phase 完成：committing → done
    await dialogueService.setPhase(dlgId, 'done')
    await Conversation.updateOne({ appId }, { $addToSet: { dialogueIds: dlgId } })

    return { dialogueId: dlgId.toString() }
  }

  /**
   * 撤销对话：Dialogue phase → discarded
   *
   * 这是"对话即事务"的 rollback 操作（ADR-039 Phase 4）。
   * 持久化表不受影响（应用状态恢复到对话开始前）。
   *
   * 语义上等同于 stopDialogue('user_aborted')，前端两个按钮（stop / discard）
   * 最终都通过 stopDialogue 实现，保持单一中断路径。
   */
  async discardDialogue(appId: string): Promise<void> {
    return this.stopDialogue(appId, 'user_aborted')
  }

  // ─── Stop（用户主动中止）──────────────────────────────────────────────────

  /**
   * 用户主动中止正在进行的 AI 执行
   *
   * Dialogue 写中断归因（phase → discarded + interruptMetadata）（ADR-039 Phase 4）
   *
   * 注意：stop 不负责断开 SSE 连接，前端应在调用 stop 后自行关闭 EventSource。
   * 使用 withAppLock 防止与其他操作竞态。
   *
   * 保护策略：如果 Dialogue 处于 committing 阶段（正在写持久化表），
   * 不允许中断（数据一致性优先），只打 warn 日志。
   */
  async stopDialogue(appId: string, reason: 'user_aborted' | 'connection_lost' = 'user_aborted'): Promise<void> {
    return withAppLock(appId, async () => {
      const dlg = await dialogueService.getActiveByApp(appId)
      if (!dlg) return

      // committing 阶段不允许中断：此时持久化表正在写入，中断会导致数据不一致
      if (dlg.phase === 'committing') {
        console.warn(`[AiService] stopDialogue: 对话 ${dlg._id} 处于 committing 阶段，拒绝中断`)
        return
      }

      await dialogueService.interrupt(
        dlg._id as Types.ObjectId,
        reason,
        dlg.phase
      )
    })
  }

  // ─── 查询接口 ──────────────────────────────────────────────────────────────

  /**
   * 查询应用当前的 AI 执行状态（ADR-039 Phase 4：纯 Dialogue 路径）
   *
   * 从 Dialogue 的 phase 字段直接推导前端所需状态。
   * 注意：getActiveByApp 排除终态（done/discarded/failed），
   * 因此 failed 状态需要单独查询以展示给用户。
   */
  async getStatus(appId: string): Promise<{ dialogueId: string; threadId: string; status: string; canResume: boolean; canConfirm: boolean } | null> {
    // 先查活跃态（start/planning/executing/committing/responding/awaiting_confirm）
    let dlg = await dialogueService.getActiveByApp(appId)

    // 活跃态未找到时，查最近的 failed（让前端能展示失败状态）
    if (!dlg) {
      dlg = await dialogueService.getRecentFailed(appId)
      if (!dlg) return null
    }

    const dlgId = (dlg._id as Types.ObjectId).toString()
    const threadId = dlg.threadId ?? `${appId}:${dlgId}`

    // Phase -> frontend status mapping
    switch (dlg.phase) {
      case 'start':
      case 'planning':
      case 'executing':
      case 'committing':
      case 'responding':
        return { dialogueId: dlgId, threadId, status: 'running', canResume: false, canConfirm: false }
      case 'awaiting_confirm':
        return { dialogueId: dlgId, threadId, status: 'awaiting_confirm', canResume: false, canConfirm: true }
      case 'failed':
        return { dialogueId: dlgId, threadId, status: 'failed', canResume: false, canConfirm: false }
      case 'done':
      case 'discarded':
      default:
        return null
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
   *
   * 双写策略：
   *   1. Dialogue 集合：写入结构化 summary.embedding（权威数据源，ADR-039）
   *   2. Conversation 子文档：写入 dialogues.$.embedding（兼容旧查询，后续迁移后移除）
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

    // 写入独立 Dialogue 文档的 embedding（权威路径）
    await dialogueService.setSummary(dialogueId, { text: summary, pageIds: [], viewIds: [], changeTags: [] }, embedding)
    // 兼容写入 Conversation 子文档（过渡期保留，后续移除）
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
