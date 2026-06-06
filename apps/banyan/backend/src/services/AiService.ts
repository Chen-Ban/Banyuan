/**
 * AI 服务（HTTP 代理层）— V6（ADR-041 Orchestrator 架构）
 *
 * 核心设计：
 *   - Dialogue 是唯一权威状态机，phase 字段驱动全生命周期
 *   - SSE 期间所有状态写入 Dialogue
 *   - chat 模式：start → responding → done（直接 commit）
 *   - task 模式：start → planning → awaiting_confirm → executing → committing → done
 *   - confirm 从 Dialogue 读取 appJSON/collections 落库，无需 Snapshot/PendingStore 中间层
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ Dialogue 集合（唯一暂存）
 *                     ↕ 持久化表（confirm 后同步）
 *
 * SSE 事件类型（ADR-041 Orchestrator 统一事件协议）：
 *   phase_change / agent_progress / tool_activity / audit_progress
 *   text_delta / done / error / app_state / started
 *
 * 事件透传策略：
 *   - app_state：拦截（不转发前端），从中提取最终 appJSON/schema/cloudFunctions 暂存
 *   - started：透传
 *   - 其余事件：原样透传
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
import memoryService from './MemoryService.js'
import type { ICollectionDef, IAssistantContent, DialogueType } from '../models/types/index.js'
import dialogueService from './DialogueService.js'
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

// ─── 统一 SSE 代理核心（ADR-041 Orchestrator 事件协议）───────────────────────

interface ProxySSECallbacks {
  /** 流结束时回调：携带最终 appJSON 和助手内容 */
  onDone: (appJSON: string, assistantContent: IAssistantContent[], summary: string | null) => Promise<void>
  /** 错误时回调 */
  onError?: () => Promise<void>
  /** 收到 app_state 事件（包含 schema + cloudFunctions）时回调 */
  onAppState?: (state: { appJSON: string; schema: ICollectionDef[]; cloudFunctions: unknown[] }) => void
}

interface ProxySSEOptions {
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
    let summaryBuffer: string | null = null
    const assistantContentBuffer: IAssistantContent[] = []
    /** app_state 中的最终 appJSON（覆盖 done 中可能没有的 appJSON） */
    let finalAppJSON = ''

    const phaseCtrl = options?.phaseCtrl

    function dispatchEvent(currentEvent: string, dataStr: string): void {
      if (!currentEvent || !dataStr) return

      // ── text_delta：累积文字 + 透传 ──
      if (currentEvent === 'text_delta') {
        try {
          const parsed = JSON.parse(dataStr) as { delta?: string; text?: string }
          const text = parsed.delta ?? parsed.text ?? ''
          if (text) textBuffer += text
        } catch { /* ignore */ }
      }

      // ── tool_activity：收集工具调用记录 + 透传 ──
      if (currentEvent === 'tool_activity') {
        try {
          const parsed = JSON.parse(dataStr) as { agent?: string; tool?: string; status?: string; inputSummary?: string; outputSummary?: string; error?: string }
          if (parsed.status === 'started') {
            assistantContentBuffer.push({ type: 'tool_call', id: `${parsed.agent}_${parsed.tool}_${Date.now()}`, name: parsed.tool ?? '', input: parsed.inputSummary ?? '' })
          } else if (parsed.status === 'completed' || parsed.status === 'error') {
            assistantContentBuffer.push({ type: 'tool_result', id: `${parsed.agent}_${parsed.tool}_${Date.now()}`, result: parsed.outputSummary ?? parsed.error ?? '', isError: parsed.status === 'error' })
          }
        } catch { /* ignore */ }
      }

      // ── app_state：拦截，不透传给前端 ──
      if (currentEvent === 'app_state') {
        try {
          const parsed = JSON.parse(dataStr) as { appJSON?: string; schema?: ICollectionDef[]; cloudFunctions?: unknown[] }
          finalAppJSON = parsed.appJSON ?? ''
          callbacks.onAppState?.({
            appJSON: finalAppJSON,
            schema: parsed.schema ?? [],
            cloudFunctions: parsed.cloudFunctions ?? [],
          })
        } catch { /* ignore */ }
        // 不透传：return 提前退出
        return
      }

      // ── done：触发 onDone + Phase 推进 ──
      if (currentEvent === 'done') {
        try {
          const parsed = JSON.parse(dataStr) as { summary?: string; artifacts?: unknown }
          summaryBuffer = parsed.summary ?? null
          if (textBuffer) {
            assistantContentBuffer.unshift({ type: 'text', text: textBuffer })
          }
          assistantContentBuffer.push({ type: 'app_snapshot', appJSON: finalAppJSON })

          callbacks.onDone(finalAppJSON, assistantContentBuffer, summaryBuffer).then(async () => {
            if (phaseCtrl && !phaseCtrl.isTerminal()) {
              const phase = phaseCtrl.getPhase()
              if (phase === 'responding') {
                await phaseCtrl.transition('done')
              } else if (phase === 'building') {
                await phaseCtrl.transition('awaiting_confirm')
              }
            }
          }).catch((err) => {
            console.error('[AiService] onDone 回调或 phase 转移失败:', err)
            if (phaseCtrl && !phaseCtrl.isTerminal()) {
              phaseCtrl.fail().catch(() => {})
            }
          })
        } catch { /* ignore */ }
      }

      // ── error：Phase → failed ──
      if (currentEvent === 'error') {
        try {
          const parsed = JSON.parse(dataStr) as { message?: string }
          assistantContentBuffer.push({ type: 'error', message: parsed.message ?? '未知错误' })
        } catch { /* ignore */ }
        if (phaseCtrl && !phaseCtrl.isTerminal()) {
          phaseCtrl.fail().catch(() => {})
        }
        callbacks.onError?.().catch((err) => {
          console.error('[AiService] onError 回调失败:', err)
        })
      }

      // ── 透传所有非 app_state 事件给前端 ──
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
   * 统一对话执行（ADR-041 Orchestrator 架构）
   *
   * chat 模式：onDone 直接落库，phase 走 responding → done
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
    // 1. 创建 Dialogue
    const conv = await conversationService.getOrCreate(appId)
    const dlgDoc = await dialogueService.create({
      appId,
      conversationId: conv._id as import('mongoose').Types.ObjectId,
      type,
      userMessage: { prompt, images },
      appJSON: type === 'task' ? currentAppJSON : undefined,
    })
    const dialogueId = dlgDoc._id as import('mongoose').Types.ObjectId

    // 2. PhaseController 创建 + 初始 phase 推进
    const phaseCtrl = PhaseController.create(dialogueId, res)
    await phaseCtrl.transition(type === 'task' ? 'requirements' : 'responding')

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

    // 4. 构造 requestBody（ADR-041 协议：无 threadId/requireApproval）
    const imageUrls = images.length > 0 ? images.map(img => img.url) : undefined
    const requestBody = JSON.stringify({
      appId,
      prompt,
      mode: type,
      previousMessages: historyMessages,
      ...(contextSummary ? { memoryHint: contextSummary } : {}),
      ...(agentMemoryText ? { agentMemory: agentMemoryText } : {}),
      ...(imageUrls ? { images: imageUrls } : {}),
    })

    // 5. proxySSECore — 回调统一写 Dialogue
    await proxySSECore('/ai/run', requestBody, res, {
      onDone: async (finalAppJSON, assistantContent, summary) => {
        // 5a. 写入 Dialogue（所有模式共享）
        await dialogueService.updateAppJSON(dialogueId, finalAppJSON)
        await dialogueService.appendAssistantContent(dialogueId, assistantContent)
        if (summary) {
          await dialogueService.setRoundSummary(dialogueId, summary)
        }

        // 5b. chat 模式：直接落库（无确认环节）
        if (type === 'chat') {
          await applicationService.updateApplication(appId, { appJSON: finalAppJSON })
          await conversationService.registerDialogue(appId, dialogueId)
          if (summary) {
            this.persistDialogueSummary(appId, dialogueId, summary).catch(err => {
              console.error('[AiService] 对话摘要持久化失败:', err)
            })
          }
        }
        // task 模式：phase 自动驱动到 awaiting_confirm，等用户 confirm
      },
      onError: async () => {
        // Phase 由 dispatchEvent 中自动驱动到 failed
      },
      onAppState: (state) => {
        // Schema 变更写入 Dialogue + chat 模式直接落库
        if (Array.isArray(state.schema) && state.schema.length > 0) {
          const collectionSnapshots = state.schema.map(col => ({
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
          if (type === 'chat') {
            SchemaService.setCollections(appId, state.schema).catch(err => {
              console.error('[AiService] Schema 写入失败:', err)
            })
          }
        }
      },
    }, appId, { phaseCtrl })
  }

  // ─── Confirm / Discard（事务确认/撤销）──────────────────────────────────────

  /**
   * 确认对话：Dialogue phase → executing → committing → done
   *
   * 使用 withAppLock 防止与 SSE 流竞态。
   */
  async confirmDialogue(appId: string): Promise<{ dialogueId: string }> {
    return withAppLock(appId, () => this._confirmDialogueCore(appId))
  }

  private async _confirmDialogueCore(appId: string): Promise<{ dialogueId: string }> {
    const dlg = await dialogueService.getActiveByApp(appId)

    if (!dlg || dlg.phase !== 'awaiting_confirm') {
      throw new Error(`[AiService] confirmDialogue: 没有处于 awaiting_confirm 状态的对话 (appId=${appId})`)
    }

    const dlgId = dlg._id as Types.ObjectId

    // 1. Phase 推进：awaiting_confirm → committing
    await dialogueService.setPhase(dlgId, 'committing')

    // 2. 应用状态落库
    if (dlg.appJSON) {
      await applicationService.updateApplication(appId, { appJSON: dlg.appJSON })
    }

    // 3. Schema 落库
    if (dlg.collections && dlg.collections.length > 0) {
      await SchemaService.setCollections(appId, dlg.collections as unknown as ICollectionDef[])
    }

    // 4. 对话摘要向量化
    if (dlg.summary?.text) {
      this.persistDialogueSummary(appId, dlgId, dlg.summary.text).catch(err => {
        console.error('[AiService] 对话摘要持久化失败:', err)
      })
    }

    // 5. Phase 完成：committing → done，并注册到 Conversation 索引
    await dialogueService.setPhase(dlgId, 'done')
    await conversationService.registerDialogue(appId, dlgId)

    return { dialogueId: dlgId.toString() }
  }

  /**
   * 撤销对话：Dialogue phase → discarded
   */
  async discardDialogue(appId: string): Promise<void> {
    return this.stopDialogue(appId, 'user_aborted')
  }

  // ─── Stop（用户主动中止）──────────────────────────────────────────────────

  /**
   * 用户主动中止正在进行的 AI 执行
   *
   * 保护策略：committing 阶段不允许中断（数据一致性优先）。
   */
  async stopDialogue(appId: string, reason: 'user_aborted' | 'connection_lost' = 'user_aborted'): Promise<void> {
    return withAppLock(appId, async () => {
      const dlg = await dialogueService.getActiveByApp(appId)
      if (!dlg) return

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
   * 查询应用当前的 AI 执行状态
   */
  async getStatus(appId: string): Promise<{ dialogueId: string; threadId: string; status: string; canConfirm: boolean } | null> {
    let dlg = await dialogueService.getActiveByApp(appId)

    if (!dlg) {
      dlg = await dialogueService.getRecentFailed(appId)
      if (!dlg) return null
    }

    const dlgId = (dlg._id as Types.ObjectId).toString()

    switch (dlg.phase) {
      case 'start':
      case 'requirements':
      case 'ui_design':
      case 'contract':
      case 'building':
      case 'committing':
      case 'responding':
        return { dialogueId: dlgId, threadId: dlgId, status: 'running', canConfirm: false }
      case 'awaiting_confirm':
        return { dialogueId: dlgId, threadId: dlgId, status: 'awaiting_confirm', canConfirm: true }
      case 'failed':
        return { dialogueId: dlgId, threadId: dlgId, status: 'failed', canConfirm: false }
      case 'done':
      case 'discarded':
      default:
        return null
    }
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
    _appId: string,
    dialogueId: Types.ObjectId,
    summary: string
  ): Promise<void> {
    const { default: knowledgeClient } = await import('./KnowledgeClient.js')
    const embedding = await knowledgeClient.embedPassage(summary)

    if (!embedding) {
      console.warn('[AiService] Embedding 生成失败（知识服务不可用），dialogue 将无向量')
    }

    await dialogueService.setSummary(dialogueId, {
      text: summary,
      embedding: embedding ?? null,
      pageIds: [],
      viewIds: [],
      changeTags: [],
    })
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
