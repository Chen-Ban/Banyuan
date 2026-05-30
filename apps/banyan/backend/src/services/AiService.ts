/**
 * AI 服务（HTTP 代理层）— V2
 *
 * 负责：
 * 1. 从 MongoDB 获取/创建该应用的唯一会话
 * 2. 创建 Dialogue（对话）并追加用户消息
 * 3. 通过 ContextBuilder 组装分层上下文（contextSummary + recentMessages）
 * 4. 从 AgentMemory 检索相关记忆（L2 层），作为 agentMemory 字段传入
 * 5. 将精简请求体（appId + prompt + context）发送给 XiangDi 独立服务（:3002）
 *    XiangDi 通过内部 API（/internal/apps/:appId/*）按需拉取 appJSON/schema/cloudFunctions
 * 6. 透传 XiangDi 返回的 SSE 流给前端（memory_update 除外）
 * 7. 收集所有 SSE 事件作为 AssistantContent 持久化到 Dialogue
 * 8. 收到 done 事件后，将最终 appJSON 写回 MongoDB，持久化对话摘要
 * 9. task 类型对话完成时，创建 Snapshot（应用状态快照）
 * 10. 收到 memory_update 事件后，异步持久化到 AgentMemory 集合
 * 11. 管理 threadId 生命周期（生成 → running → completed/failed/interrupted）
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ MongoDB          ↕ Internal API (pull-based)
 *                   (persist)        (on-demand fetch)
 *
 * 会话模型（V2: 1 App = 1 Conversation, Dialogue 为核心聚合单元）：
 *   - 每个应用只有一个会话，以 appId 为唯一标识
 *   - 每次请求创建一个 Dialogue（chat/task），内含 messages[]
 *   - threadId/threadStatus 挂载到 Dialogue 级别
 *   - assistant 消息的 assistantContent[] 完整保留 SSE 实时进度
 *   - task 类型对话完成时生成 Snapshot（支持撤销/恢复）
 *
 * SSE 事件类型（与 XiangDi 服务保持一致）：
 *   text_delta       — LLM 输出的文字片段
 *   tool_call        — 工具调用开始（含工具名和入参）
 *   tool_result      — 工具调用结果
 *   app_snapshot     — 写操作完成后推送当前 appJSON
 *   schema_update    — AI 调用 schema_set_collections 后推送新 Schema（后端持久化 + 转发）
 *   round_summary    — 本轮对话总结（转发给前端 + 后端持久化为 dialogue.summary）
 *   memory_update    — Agent 记忆更新（仅后端持久化，不转发给前端）
 *   checkpoint       — 执行状态已持久化 { threadId, node, step }
 *   interrupt        — 图执行被中断，等待人工介入 { threadId, node, value }
 *   resumed          — 从 checkpoint 恢复执行 { fromNode, step }
 *   done             — 完成，携带最终 appJSON + threadId
 *   error            — 发生错误
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
import type { ICollectionDef } from '../models/CollectionSchema.js'
import type { IAssistantContent, DialogueType } from '../models/Conversation.js'
import type { AgentRole } from '../models/PlanningArtifact.js'

// XiangDi 服务地址，通过环境变量配置，默认本地开发地址
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'
// 内部认证 token，与 XiangDi 服务共享
const XIANGDI_INTERNAL_TOKEN = process.env.XIANGDI_INTERNAL_TOKEN

/** 向 XiangDi 发起请求的超时（毫秒），默认 10 分钟 */
const PROXY_REQUEST_TIMEOUT_MS = Number(process.env.AI_PROXY_TIMEOUT_MS ?? 600_000)

/** SSE 代理层心跳间隔（毫秒），向前端发送 `:ping` 注释帧，防止反向代理/LB 因空闲超时断开 */
const SSE_HEARTBEAT_INTERVAL_MS = 20_000

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 获取当前 LLM 模型名称（与 XiangDi 服务共享环境变量）
 * 用于 ContextBuilder 查询模型上下文窗口大小
 */
function getActiveModelName(): string {
  const provider = process.env.LLM_PROVIDER ?? 'deepseek'
  if (provider === 'kimi') {
    return process.env.KIMI_MODEL ?? 'kimi-k2.6'
  }
  return process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro'
}

/**
 * 估算文本的 token 数量（与 ContextBuilder 内部使用同一算法）
 */
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

/**
 * 启动心跳：每隔 SSE_HEARTBEAT_INTERVAL_MS 向前端发送 SSE 注释帧 `:ping`
 * 防止 Nginx/LB/浏览器因长时间无数据而主动断开 SSE 连接
 * 返回清理函数，在代理结束时调用
 */
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
  /** planning_progress 事件：某个 Agent 完成产出 */
  onPlanningProgress?: (agent: AgentRole, entry: { output: unknown; reasoning?: string; tokenUsage: { input: number; output: number }; durationMs: number }) => Promise<void>
  /** planning_progress 事件：某个 Agent 失败 */
  onPlanningFailed?: (agent: AgentRole) => Promise<void>
}

/**
 * 向 XiangDi 服务发起 SSE 请求并透传给前端（通用核心实现）
 *
 * 修复要点：
 *  1. clientRes.on('close') 监听前端断开 → 立即 destroy 上游请求，防止 XiangDi 空跑
 *  2. upstreamReq.setTimeout() 超时限制，防止连接永久 hang
 *  3. 每次 write 后 cork/uncork，配合 setNoDelay 最小化 flush 延迟
 *  4. SSE 解析：按 \n\n 分割完整事件块，流结束时处理 buffer 残留
 *  5. 心跳：每 20s 发送 :ping 注释帧，防止 Nginx/LB 空闲断连
 *  6. proxySSE / proxyResumeSSE 合并为同一函数，消除代码重复
 */
function proxySSECore(
  xiangdiPath: string,
  requestBody: string,
  clientRes: ServerResponse,
  callbacks: ProxySSECallbacks,
  appId: string,
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

    // 启动心跳
    const stopHeartbeat = startHeartbeat(clientRes)

    // 监听前端断开，立即中止上游请求
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

    /**
     * 解析并分发一个完整的 SSE 事件块（已按 \n\n 切割）
     * 返回 true 表示发现 memory_update（不应透传给前端）
     */
    function dispatchEvent(currentEvent: string, dataStr: string): void {
      if (!currentEvent || !dataStr) return

      if (currentEvent === 'text_delta') {
        try {
          const parsed = JSON.parse(dataStr) as { text?: string }
          if (parsed.text) textBuffer += parsed.text
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'tool_call') {
        try {
          const parsed = JSON.parse(dataStr) as { id: string; name: string; input: unknown }
          assistantContentBuffer.push({ type: 'tool_call', id: parsed.id, name: parsed.name, input: parsed.input })
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'tool_result') {
        try {
          const parsed = JSON.parse(dataStr) as { id: string; result: unknown; isError: boolean }
          assistantContentBuffer.push({ type: 'tool_result', id: parsed.id, result: parsed.result, isError: parsed.isError ?? false })
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'app_snapshot') {
        try {
          const parsed = JSON.parse(dataStr) as { appJSON: string }
          assistantContentBuffer.push({ type: 'app_snapshot', appJSON: parsed.appJSON ?? '' })
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'schema_update') {
        try {
          const parsed = JSON.parse(dataStr) as { collections?: ICollectionDef[] }
          if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
            SchemaService.setCollections(appId, parsed.collections).catch((err) => {
              console.error('[AiService] 写入 Schema 失败:', err)
            })
            assistantContentBuffer.push({ type: 'schema_update', collections: parsed.collections })
          }
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'disambiguation') {
        try {
          const parsed = JSON.parse(dataStr)
          assistantContentBuffer.push({ type: 'disambiguation', options: parsed })
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'planning_progress') {
        try {
          const parsed = JSON.parse(dataStr) as {
            agent: AgentRole
            status: 'started' | 'completed' | 'failed'
            summary?: string
            artifactPreview?: Record<string, number>
            output?: unknown
            reasoning?: string
            tokenUsage?: { input: number; output: number }
            durationMs?: number
          }
          // 持久化 Agent 产出（completed 时 output 非空）
          if (parsed.status === 'completed' && parsed.output && callbacks.onPlanningProgress) {
            callbacks.onPlanningProgress(parsed.agent, {
              output: parsed.output,
              reasoning: parsed.reasoning,
              tokenUsage: parsed.tokenUsage ?? { input: 0, output: 0 },
              durationMs: parsed.durationMs ?? 0,
            }).catch(err => {
              console.error('[AiService] planning_progress 持久化失败:', err)
            })
          }
          if (parsed.status === 'failed' && callbacks.onPlanningFailed) {
            callbacks.onPlanningFailed(parsed.agent).catch(err => {
              console.error('[AiService] planning_failed 处理失败:', err)
            })
          }
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'round_summary') {
        try {
          const parsed = JSON.parse(dataStr) as { summary?: string }
          if (parsed.summary) roundSummaryBuffer = parsed.summary
        } catch { /* 解析失败不影响主流程 */ }
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
          memoryService.handleMemoryUpdate(appId, memoryInput).catch((err) => {
            console.error('[AiService] Agent 记忆写入失败:', err)
          })
        } catch { /* 解析失败不影响主流程 */ }
        // memory_update 不转发给前端，提前返回
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
            console.error('[AiService] 写回数据失败:', err)
          })
        } catch { /* 解析失败不影响透传 */ }
      }

      if (currentEvent === 'error') {
        try {
          const parsed = JSON.parse(dataStr) as { message?: string }
          assistantContentBuffer.push({ type: 'error', message: parsed.message ?? '未知错误' })
        } catch { /* 解析失败不影响透传 */ }
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

      // 强制 flush：cork/uncork trick，配合 setNoDelay 减少缓冲延迟
      const socket = clientRes.socket
      if (socket && !socket.destroyed) {
        socket.cork()
        process.nextTick(() => socket.uncork())
      }
    }

    /**
     * 解析 buffer 中的完整 SSE 事件块，返回剩余未处理的片段
     */
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
            // 取第一行 data（多行 data 极罕见，取首行即可）
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
        // 处理流结束时 buffer 中可能残留的最后一块（无尾部 \n\n）
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

    // 设置请求超时（不含 connect 阶段，覆盖整体响应周期）
    upstreamReq.setTimeout(PROXY_REQUEST_TIMEOUT_MS, () => {
      if (!settled) {
        upstreamReq?.destroy(new Error(`XiangDi 请求超时 (${PROXY_REQUEST_TIMEOUT_MS}ms)`))
      }
    })

    upstreamReq.on('error', (err) => {
      if (settled) return
      // 前端断开主动 destroy 时，静默处理
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

/**
 * 每个 appId 同时只允许一个 AI 请求在跑。
 * 使用 Promise 链实现串行化：新请求必须等上一个完成后才能开始。
 * Map 保存每个 appId 的「最后一个 Promise」。
 */
const appLockMap = new Map<string, Promise<void>>()

function withAppLock<T>(appId: string, fn: () => Promise<T>): Promise<T> {
  // 取出当前锁（上一个请求的 Promise）
  const prev = appLockMap.get(appId) ?? Promise.resolve()

  // 构造新的任务：等上一个完成后才运行 fn
  // 无论 fn 成功/失败，都 resolve 锁（让后续请求得以进入）
  let releaseLock!: () => void
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve })
  appLockMap.set(appId, lockPromise)

  return prev.then(() => fn()).finally(() => {
    // 如果自己仍是最后一个，清理 Map，防止内存泄漏
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
   * 流程（V2）：
   *   1. 创建 Dialogue（含第一条 user 消息）
   *   2. 构建 threadId = `${appId}:${dialogueId}`
   *   3. 标记 Dialogue threadStatus = 'running'
   *   4. 请求体携带 threadId 传给 XiangDi 服务
   *   5. 收集所有 SSE 事件作为 AssistantContent[]
   *   6. done 时：追加 assistant 消息 + 写回 appJSON + 创建 Snapshot（task 类型）
   *   7. SSE 事件回调更新 threadStatus（done → completed, error → failed, interrupt → interrupted）
   *
   * @param appId   目标应用 ID
   * @param prompt  用户自然语言指令
   * @param type    对话类型（chat/task），由前端按钮状态决定
   * @param images  用户上传的图片列表
   * @param res     Koa 的底层 ServerResponse（用于 SSE 写入）
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
    // 设置 SSE 响应头（由 Controller 负责，此处仅做防御性检查）
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }
    // 禁用 Nagle 算法，确保每次 write() 立即发送，实现逐字流式输出
    res.socket?.setNoDelay(true)

    try {
      // 1. 校验应用存在
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)

      // 2. 获取或创建会话（1 App = 1 Conversation）
      await conversationService.getOrCreate(appId)

      // 3. 创建新 Dialogue 并追加第一条 user 消息
      const { dialogueId } = await conversationService.createDialogue(
        appId,
        type,
        { prompt, images }
      )

      // 4. 构建 threadId 并标记执行状态为 running
      const threadId = `${appId}:${dialogueId.toString()}`
      await conversationService.setThreadInfo(appId, dialogueId, threadId, 'running')

      // 4.5. task 类型创建 PlanningArtifact 空壳（Multi-Agent 规划产物容器）
      let artifactId: Types.ObjectId | null = null
      if (type === 'task') {
        const artifact = await planningArtifactService.create(appId, dialogueId)
        artifactId = artifact._id as Types.ObjectId
        await conversationService.setPlanningArtifactId(appId, dialogueId, artifactId)
      }

      // 5. 检索 Agent 记忆（L2 层）+ 构建分层上下文
      const agentMemoryText = await memoryService.recall(appId, prompt)

      const contextOptions: ContextBuildOptions = {
        modelName: getActiveModelName(),
        systemPromptTokens: 2500,
        agentMemoryTokens: estimateTokens(agentMemoryText ?? ''),
        currentPromptTokens: estimateTokens(prompt),
      }

      const layeredContext = await contextBuilder.build(appId, prompt, contextOptions)
      const { contextSummary, recentMessages: historyMessages } = layeredContext

      // 6. 构造请求体，发送给 XiangDi 服务
      const imageUrls = images.length > 0 ? images.map(img => img.url) : undefined
      const requestBody = JSON.stringify({
        appId,
        prompt,
        threadId,
        mode: type,  // chat | task → XiangDi 路由到不同 Graph
        previousMessages: historyMessages,
        ...(contextSummary ? { memoryHint: contextSummary } : {}),
        ...(agentMemoryText ? { agentMemory: agentMemoryText } : {}),
        ...(imageUrls ? { images: imageUrls } : {}),
        // task 模式下启用 humanGate，规划完成后等待用户确认再执行
        ...(type === 'task' ? { requireApproval: true } : {}),
      })

      // 7. 向 XiangDi 服务发起 SSE 请求并透传给前端
      await proxySSECore('/ai/run', requestBody, res, {
        onDone: async (finalAppJSON: string, assistantContent: IAssistantContent[], roundSummary: string | null) => {
          // 收到 done 事件后，并行执行：写回 appJSON + 保存 assistant 消息 + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { appJSON: finalAppJSON }),
            conversationService.appendAssistantMessage(appId, dialogueId, assistantContent),
            conversationService.updateThreadStatus(appId, dialogueId, 'completed'),
          ])

          // task 类型对话完成时，创建 Snapshot（异步 fire-and-forget）
          if (type === 'task') {
            snapshotService.createSnapshot(appId, dialogueId).catch(err => {
              console.error('[AiService] Snapshot 创建失败:', err)
            })
          }

          // 持久化对话摘要 + 生成 embedding（异步 fire-and-forget）
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
        onInterrupt: async () => {
          await conversationService.updateThreadStatus(appId, dialogueId, 'interrupted').catch(err => {
            console.error('[AiService] 更新 threadStatus(interrupted) 失败:', err)
          })
        },
        // Multi-Agent 规划产物持久化回调
        onPlanningProgress: artifactId ? async (agent, entry) => {
          await planningArtifactService.writeAgentOutput(artifactId!, agent, entry)
          // 最后一个 Agent（task）完成时标记 artifact 为 completed
          if (agent === 'task') {
            await planningArtifactService.updateStatus(artifactId!, 'completed', { completedAt: new Date() })
          }
        } : undefined,
        onPlanningFailed: artifactId ? async (agent) => {
          await planningArtifactService.updateStatus(artifactId!, 'failed', { failedAt: agent })
        } : undefined,
      }, appId)
    } catch (err) {
      if (err instanceof ContextBudgetOverflowError) {
        sseWrite(res, 'error', {
          code: err.code,
          message: err.message,
          details: err.details,
        })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        sseWrite(res, 'error', { message })
      }
      sseDone(res)
    }
  }

  /**
   * 从 checkpoint 恢复 AI 执行（断点续跑）
   *
   * 流程（V2）：
   *   1. 若前端未传 dialogueId，从最近对话中查找 pending dialogue
   *   2. 更新 threadStatus 为 'running'（恢复中）
   *   3. 调用 XiangDi 服务 POST /ai/resume { threadId, resumeValue? }
   *   4. 透传 SSE 流，done/error 时更新 threadStatus
   *
   * @param appId        目标应用 ID
   * @param res          Koa 的底层 ServerResponse（用于 SSE 写入）
   * @param dialogueId   要恢复的对话 ID（可选，未传时自动查找最近 pending dialogue）
   * @param resumeValue  用户对 interrupt 的响应值（如审批结果、澄清回复）
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
    // 设置 SSE 响应头
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }
    // 禁用 Nagle 算法，确保每次 write() 立即发送，实现逐字流式输出
    res.socket?.setNoDelay(true)

    try {
      // 1. 确定要恢复的对话
      let resolvedDialogueId: Types.ObjectId
      let resolvedThreadId: string

      if (dialogueId) {
        resolvedDialogueId = new Types.ObjectId(dialogueId)
        resolvedThreadId = `${appId}:${dialogueId}`
      } else {
        const pending = await conversationService.getLastPendingDialogue(appId)
        if (!pending) {
          throw new Error('没有找到可恢复的执行线程')
        }
        resolvedDialogueId = pending.dialogueId
        resolvedThreadId = pending.threadId
      }

      // 2. 更新状态为 running（恢复中）
      await conversationService.updateThreadStatus(appId, resolvedDialogueId, 'running')

      // 3. 读取最新 appJSON（resume 时需传递给 XiangDi 初始化 adapter）
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)
      const appJSON: string = app.appJSON ?? ''

      // 4. 构造请求体
      const requestBody = JSON.stringify({
        threadId: resolvedThreadId,
        appJSON,
        ...(resumeValue !== undefined ? { resumeValue } : {}),
      })

      // 5. 转发到 XiangDi 服务 /ai/resume
      await proxySSECore('/ai/resume', requestBody, res, {
        onDone: async (finalAppJSON: string, assistantContent: IAssistantContent[], roundSummary: string | null) => {
          // 写回 appJSON + 追加 assistant 消息 + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { appJSON: finalAppJSON }),
            conversationService.appendAssistantMessage(appId, resolvedDialogueId, assistantContent),
            conversationService.updateThreadStatus(appId, resolvedDialogueId, 'completed'),
          ])

          // task 类型对话完成时创建 Snapshot
          // 需要查询 dialogue type（从 pending 信息中无法直接获取，此处简化为总是创建）
          snapshotService.createSnapshot(appId, resolvedDialogueId).catch(err => {
            console.error('[AiService] resume Snapshot 创建失败:', err)
          })

          // 持久化对话摘要（异步 fire-and-forget）
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
      }, appId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sseWrite(res, 'error', { message })
      sseDone(res)
    }
  }

  /**
   * 查询应用当前的 AI 执行状态
   */
  async getStatus(appId: string): Promise<{ dialogueId: string; threadId: string; status: string; canResume: boolean } | null> {
    const pending = await conversationService.getLastPendingDialogue(appId)
    if (!pending) return null
    return {
      dialogueId: pending.dialogueId.toString(),
      threadId: pending.threadId,
      status: pending.status,
      canResume: pending.status === 'interrupted' || pending.status === 'running',
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

  /**
   * 持久化对话摘要 + 调用知识服务生成向量
   *
   * 异步执行（fire-and-forget），不阻塞主流程。
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
   * 向 XiangDi 服务发起普通 HTTP 请求并返回解析后的 JSON
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
