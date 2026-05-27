/**
 * AI 服务（HTTP 代理层）— V2
 *
 * 负责：
 * 1. 从 MongoDB 获取/创建该应用的唯一会话
 * 2. 创建 Dialogue（对话）并追加用户消息
 * 3. 通过 ContextBuilder 组装分层上下文（contextSummary + recentMessages）
 * 4. 从 AgentMemory 检索相关记忆（L2 层），作为 agentMemory 字段传入
 * 5. 将精简请求体（appId + prompt + context）发送给 XiangDi 独立服务（:3002）
 *    XiangDi 通过内部 API（/internal/apps/:appId/*）按需拉取 pages/schema/cloudFunctions
 * 6. 透传 XiangDi 返回的 SSE 流给前端（memory_update 除外）
 * 7. 收集所有 SSE 事件作为 AssistantContent 持久化到 Dialogue
 * 8. 收到 done 事件后，将最终 pages 写回 MongoDB，持久化对话摘要
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
 *   pages_snapshot   — 写操作完成后推送当前 pages
 *   schema_update    — AI 调用 schema_set_collections 后推送新 Schema（后端持久化 + 转发）
 *   round_summary    — 本轮对话总结（转发给前端 + 后端持久化为 dialogue.summary）
 *   memory_update    — Agent 记忆更新（仅后端持久化，不转发给前端）
 *   checkpoint       — 执行状态已持久化 { threadId, node, step }
 *   interrupt        — 图执行被中断，等待人工介入 { threadId, node, value }
 *   resumed          — 从 checkpoint 恢复执行 { fromNode, step }
 *   done             — 完成，携带最终 pages JSON + threadId
 *   error            — 发生错误
 */

import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import https from 'https'
import { Types } from 'mongoose'
import applicationService from './ApplicationService.js'
import conversationService from './ConversationService.js'
import snapshotService from './SnapshotService.js'
import contextBuilder, { ContextBudgetOverflowError } from './ContextBuilder.js'
import type { ContextBuildOptions } from './ContextBuilder.js'
import { SchemaService } from './SchemaService.js'
import memoryService, { type MemoryUpdateInput } from './MemoryService.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'
import type { IAssistantContent, DialogueType } from '../models/Conversation.js'

// XiangDi 服务地址，通过环境变量配置，默认本地开发地址
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'
// 内部认证 token，与 XiangDi 服务共享
const XIANGDI_INTERNAL_TOKEN = process.env.XIANGDI_INTERNAL_TOKEN

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
   *   6. done 时：追加 assistant 消息 + 写回 pages + 创建 Snapshot（task 类型）
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
    // 设置 SSE 响应头（由 Controller 负责，此处仅做防御性检查）
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }

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
      })

      // 7. 向 XiangDi 服务发起 SSE 请求并透传给前端
      await this.proxySSE(requestBody, res, {
        onDone: async (finalPages: string[], assistantContent: IAssistantContent[], roundSummary: string | null) => {
          // 收到 done 事件后，并行执行：写回 pages + 保存 assistant 消息 + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { pages: finalPages }),
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
    // 设置 SSE 响应头
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
    }

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

      // 3. 读取最新 pages（resume 时需传递给 XiangDi 初始化 adapter）
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)
      const pages: string[] = app.pages ?? []

      // 4. 构造请求体
      const requestBody = JSON.stringify({
        threadId: resolvedThreadId,
        pages,
        ...(resumeValue !== undefined ? { resumeValue } : {}),
      })

      // 5. 转发到 XiangDi 服务 /ai/resume
      await this.proxyResumeSSE(requestBody, res, {
        onDone: async (finalPages: string[], assistantContent: IAssistantContent[], roundSummary: string | null) => {
          // 写回 pages + 追加 assistant 消息 + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { pages: finalPages }),
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
   * 向 XiangDi 服务 /ai/run 发起 SSE 请求并透传
   *
   * V2 变更：收集所有 SSE 事件作为 AssistantContent[]，在 onDone 时一并传出
   */
  private proxySSE(
    requestBody: string,
    clientRes: ServerResponse,
    callbacks: {
      onDone: (pages: string[], assistantContent: IAssistantContent[], roundSummary: string | null) => Promise<void>
      onError?: () => Promise<void>
      onInterrupt?: () => Promise<void>
    },
    appId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL('/ai/run', XIANGDI_BASE_URL)
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

      // 收集 text_delta 拼接完整文本（用于 AssistantContent 中的 text 块）
      let textBuffer = ''
      // 收集 round_summary 事件的摘要内容
      let roundSummaryBuffer: string | null = null
      // 收集所有 SSE 事件作为 AssistantContent（持久化用）
      const assistantContentBuffer: IAssistantContent[] = []

      const req = transport.request(options, (upstream: IncomingMessage) => {
        if (upstream.statusCode && upstream.statusCode >= 400) {
          reject(new Error(`XiangDi 服务返回错误状态码: ${upstream.statusCode}`))
          return
        }

        let buffer = ''

        upstream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)

              if (currentEvent === 'text_delta') {
                try {
                  const parsed = JSON.parse(dataStr) as { text?: string }
                  if (parsed.text) textBuffer += parsed.text
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'tool_call') {
                try {
                  const parsed = JSON.parse(dataStr) as { id: string; name: string; input: unknown }
                  assistantContentBuffer.push({
                    type: 'tool_call',
                    id: parsed.id,
                    name: parsed.name,
                    input: parsed.input,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'tool_result') {
                try {
                  const parsed = JSON.parse(dataStr) as { id: string; result: unknown; isError: boolean }
                  assistantContentBuffer.push({
                    type: 'tool_result',
                    id: parsed.id,
                    result: parsed.result,
                    isError: parsed.isError ?? false,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'pages_snapshot') {
                try {
                  const parsed = JSON.parse(dataStr) as { pages: string[] }
                  assistantContentBuffer.push({
                    type: 'pages_snapshot',
                    pages: parsed.pages ?? [],
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'schema_update') {
                try {
                  const parsed = JSON.parse(dataStr) as { collections?: ICollectionDef[] }
                  if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
                    // 写入 DB（异步 fire-and-forget）
                    SchemaService.setCollections(appId, parsed.collections).catch((err) => {
                      console.error('[AiService] 写入 Schema 失败:', err)
                    })
                    assistantContentBuffer.push({
                      type: 'schema_update',
                      collections: parsed.collections,
                    })
                  }
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'disambiguation') {
                try {
                  const parsed = JSON.parse(dataStr)
                  assistantContentBuffer.push({
                    type: 'disambiguation',
                    options: parsed,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'round_summary') {
                try {
                  const parsed = JSON.parse(dataStr) as { summary?: string }
                  if (parsed.summary) {
                    roundSummaryBuffer = parsed.summary
                  }
                } catch {
                  // 解析失败不影响主流程
                }
              }

              if (currentEvent === 'memory_update') {
                try {
                  const parsed = JSON.parse(dataStr) as {
                    episode?: { title: string; content: string; outcome: string; lessons: string[]; involvedEntities: string[]; tags: string[]; importance: number } | null
                    facts?: Array<{ category: string; content: string; confidence: number }>
                  }
                  const memoryInput: MemoryUpdateInput = {
                    episode: (parsed.episode ?? null) as MemoryUpdateInput['episode'],
                    facts: (parsed.facts ?? []) as MemoryUpdateInput['facts'],
                  }
                  memoryService.handleMemoryUpdate(appId, memoryInput).catch((err) => {
                    console.error('[AiService] Agent 记忆写入失败:', err)
                  })
                } catch {
                  // 解析失败不影响主流程
                }
                // 跳过透传：memory_update 是后端内部事件，不发送给前端
                currentEvent = ''
              }

              if (currentEvent === 'done') {
                try {
                  const parsed = JSON.parse(dataStr) as { pages?: string[] }
                  const finalPages = parsed.pages ?? []

                  // 将累积的文本作为 text 内容块加入（放在最前面）
                  if (textBuffer) {
                    assistantContentBuffer.unshift({ type: 'text', text: textBuffer })
                  }

                  // 添加 done 内容块
                  assistantContentBuffer.push({ type: 'done', pages: finalPages })

                  // 异步写回，不阻塞 SSE 流
                  callbacks.onDone(finalPages, assistantContentBuffer, roundSummaryBuffer).catch((err) => {
                    console.error('[AiService] 写回数据失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'error') {
                try {
                  const parsed = JSON.parse(dataStr) as { message?: string }
                  assistantContentBuffer.push({
                    type: 'error',
                    message: parsed.message ?? '未知错误',
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'interrupt') {
                callbacks.onInterrupt?.().catch((err) => {
                  console.error('[AiService] onInterrupt 回调失败:', err)
                })
              }

              // 透传所有事件给前端（memory_update 除外，已在上面置空 currentEvent）
              if (currentEvent) {
                sseWrite(clientRes, currentEvent, dataStr)
              }
              currentEvent = ''
            }
          }
        })

        upstream.on('end', () => {
          sseDone(clientRes)
          resolve()
        })

        upstream.on('error', (err) => {
          callbacks.onError?.().catch(() => {})
          sseWrite(clientRes, 'error', { message: err.message })
          sseDone(clientRes)
          reject(err)
        })
      })

      req.on('error', (err) => {
        callbacks.onError?.().catch(() => {})
        const message = `无法连接到 XiangDi 服务 (${XIANGDI_BASE_URL}): ${err.message}`
        sseWrite(clientRes, 'error', { message })
        sseDone(clientRes)
        reject(new Error(message))
      })

      req.write(requestBody)
      req.end()
    })
  }

  /**
   * 向 XiangDi 服务 /ai/resume 发起 SSE 请求并透传
   *
   * V2 变更：同样收集 AssistantContent[]
   */
  private proxyResumeSSE(
    requestBody: string,
    clientRes: ServerResponse,
    callbacks: {
      onDone: (pages: string[], assistantContent: IAssistantContent[], roundSummary: string | null) => Promise<void>
      onError?: () => Promise<void>
      onInterrupt?: () => Promise<void>
    },
    appId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL('/ai/resume', XIANGDI_BASE_URL)
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

      let textBuffer = ''
      let roundSummaryBuffer: string | null = null
      const assistantContentBuffer: IAssistantContent[] = []

      const req = transport.request(options, (upstream: IncomingMessage) => {
        if (upstream.statusCode && upstream.statusCode >= 400) {
          callbacks.onError?.().catch(() => {})
          reject(new Error(`XiangDi /ai/resume 返回错误状态码: ${upstream.statusCode}`))
          return
        }

        let buffer = ''

        upstream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)

              if (currentEvent === 'text_delta') {
                try {
                  const parsed = JSON.parse(dataStr) as { text?: string }
                  if (parsed.text) textBuffer += parsed.text
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'tool_call') {
                try {
                  const parsed = JSON.parse(dataStr) as { id: string; name: string; input: unknown }
                  assistantContentBuffer.push({
                    type: 'tool_call',
                    id: parsed.id,
                    name: parsed.name,
                    input: parsed.input,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'tool_result') {
                try {
                  const parsed = JSON.parse(dataStr) as { id: string; result: unknown; isError: boolean }
                  assistantContentBuffer.push({
                    type: 'tool_result',
                    id: parsed.id,
                    result: parsed.result,
                    isError: parsed.isError ?? false,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'pages_snapshot') {
                try {
                  const parsed = JSON.parse(dataStr) as { pages: string[] }
                  assistantContentBuffer.push({
                    type: 'pages_snapshot',
                    pages: parsed.pages ?? [],
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'schema_update') {
                // schema_update 事件：解析 collections，写入 DB（异步 fire-and-forget）
                try {
                  const parsed = JSON.parse(dataStr) as { collections?: ICollectionDef[] }
                  if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
                    SchemaService.setCollections(appId, parsed.collections).catch((err) => {
                      console.error('[AiService] resume 写入 Schema 失败:', err)
                    })
                    assistantContentBuffer.push({
                      type: 'schema_update',
                      collections: parsed.collections,
                    })
                  }
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'disambiguation') {
                try {
                  const parsed = JSON.parse(dataStr)
                  assistantContentBuffer.push({
                    type: 'disambiguation',
                    options: parsed,
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'round_summary') {
                // round_summary 事件：捕获对话摘要
                try {
                  const parsed = JSON.parse(dataStr) as { summary?: string }
                  if (parsed.summary) {
                    roundSummaryBuffer = parsed.summary
                  }
                } catch {
                  // 解析失败不影响主流程
                }
              }

              if (currentEvent === 'memory_update') {
                // memory_update 事件：持久化到 AgentMemory 集合，不转发给前端
                try {
                  const parsed = JSON.parse(dataStr) as {
                    episode?: { title: string; content: string; outcome: string; lessons: string[]; involvedEntities: string[]; tags: string[]; importance: number } | null
                    facts?: Array<{ category: string; content: string; confidence: number }>
                  }
                  const memoryInput: MemoryUpdateInput = {
                    episode: (parsed.episode ?? null) as MemoryUpdateInput['episode'],
                    facts: (parsed.facts ?? []) as MemoryUpdateInput['facts'],
                  }
                  memoryService.handleMemoryUpdate(appId, memoryInput).catch((err) => {
                    console.error('[AiService] resume Agent 记忆写入失败:', err)
                  })
                } catch {
                  // 解析失败不影响主流程
                }
                // 跳过透传：memory_update 是后端内部事件，不发送给前端
                currentEvent = ''
              }

              if (currentEvent === 'done') {
                try {
                  const parsed = JSON.parse(dataStr) as { pages?: string[] }
                  const finalPages = parsed.pages ?? []

                  // 将累积的文本作为 text 内容块加入（放在最前面）
                  if (textBuffer) {
                    assistantContentBuffer.unshift({ type: 'text', text: textBuffer })
                  }

                  // 添加 done 内容块
                  assistantContentBuffer.push({ type: 'done', pages: finalPages })

                  callbacks.onDone(finalPages, assistantContentBuffer, roundSummaryBuffer).catch((err) => {
                    console.error('[AiService] resume 写回数据失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'error') {
                try {
                  const parsed = JSON.parse(dataStr) as { message?: string }
                  assistantContentBuffer.push({
                    type: 'error',
                    message: parsed.message ?? '未知错误',
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'interrupt') {
                callbacks.onInterrupt?.().catch((err) => {
                  console.error('[AiService] resume onInterrupt 回调失败:', err)
                })
              }

              // 透传所有事件给前端（memory_update 除外，已在上面置空 currentEvent）
              if (currentEvent) {
                sseWrite(clientRes, currentEvent, dataStr)
              }
              currentEvent = ''
            }
          }
        })

        upstream.on('end', () => {
          sseDone(clientRes)
          resolve()
        })

        upstream.on('error', (err) => {
          callbacks.onError?.().catch(() => {})
          sseWrite(clientRes, 'error', { message: err.message })
          sseDone(clientRes)
          reject(err)
        })
      })

      req.on('error', (err) => {
        callbacks.onError?.().catch(() => {})
        const message = `无法连接到 XiangDi 服务 (${XIANGDI_BASE_URL}): ${err.message}`
        sseWrite(clientRes, 'error', { message })
        sseDone(clientRes)
        reject(new Error(message))
      })

      req.write(requestBody)
      req.end()
    })
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
