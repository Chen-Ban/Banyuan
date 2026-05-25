/**
 * AI 服务（HTTP 代理层）
 *
 * 负责：
 * 1. 接收前端上传的全量状态（pages + schema + cloudFunctions）并持久化到 MongoDB
 * 2. 从 MongoDB 获取/创建该应用的唯一会话
 * 3. 通过 ContextBuilder 组装分层上下文（contextSummary + recentMessages）
 * 4. 从 AgentMemory 检索相关记忆（L2 层），作为 agentMemory 字段传入
 * 5. 将精简请求体（appId + prompt + context）发送给 XiangDi 独立服务（:3002）
 *    XiangDi 通过内部 API（/internal/apps/:appId/*）按需拉取 pages/schema/cloudFunctions
 * 6. 透传 XiangDi 返回的 SSE 流给前端（memory_update 除外）
 * 7. 收到 done 事件后，将最终 pages 写回 MongoDB，保存本轮消息，持久化 round
 * 8. 收到 memory_update 事件后，异步持久化到 AgentMemory 集合
 * 9. 管理 threadId 生命周期（生成 → running → completed/failed/interrupted）
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ MongoDB          ↕ Internal API (pull-based)
 *                   (persist)        (on-demand fetch)
 *
 * 会话模型（1 App = 1 Conversation）：
 *   - 每个应用只有一个会话，以 appId 为唯一标识
 *   - 前端无需管理 conversationId，打开应用即自动续接历史
 *   - 每次请求前：追加 user 消息，通过 ContextBuilder 构建分层上下文
 *   - done 事件后：追加 assistant 消息 + 持久化 round
 *
 * Checkpoint/Resume 能力（ADR-023）：
 *   - 每次 AI 请求生成 threadId = `${appId}:${userMessage._id}`
 *   - threadId 传递给 XiangDi 服务，用于 LangGraph Checkpointer 持久化
 *   - SSE 事件回调更新 threadStatus（running → completed/failed/interrupted）
 *   - 支持从断点恢复（resumeSSE）
 *
 * SSE 事件类型（与 XiangDi 服务保持一致）：
 *   text_delta       — LLM 输出的文字片段
 *   tool_call        — 工具调用开始（含工具名和入参）
 *   tool_result      — 工具调用结果
 *   pages_snapshot   — 写操作完成后推送当前 pages
 *   schema_update    — AI 调用 schema_set_collections 后推送新 Schema（后端持久化 + 转发）
 *   round_summary    — 本轮对话总结（转发给前端 + 后端持久化）
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
import applicationService from './ApplicationService.js'
import conversationService from './ConversationService.js'
import contextBuilder, { ContextBudgetOverflowError } from './ContextBuilder.js'
import type { ContextBuildOptions } from './ContextBuilder.js'
import { SchemaService } from './SchemaService.js'
import cloudFunctionService from './CloudFunctionService.js'
import memoryService, { type MemoryUpdateInput } from './MemoryService.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'

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
   * 流程变更（ADR-023）：
   *   1. appendUserMessage 返回 message._id
   *   2. 构建 threadId = `${appId}:${message._id}`
   *   3. 标记 threadStatus = 'running'
   *   4. 请求体携带 threadId 传给 XiangDi 服务
   *   5. SSE 事件回调更新 threadStatus（done → completed, error → failed, interrupt → interrupted）
   *
   * @param appId                   目标应用 ID
   * @param prompt                  用户自然语言指令
   * @param res                     Koa 的底层 ServerResponse（用于 SSE 写入）
   * @param frontendPages           前端传入的当前 pages（最新内存状态）
   * @param frontendSchema          前端传入的 CollectionSchema（数据库表结构定义）
   * @param frontendCloudFunctions  前端传入的云函数列表（FlowSchema 定义）
   */
  async runWithSSE(
    appId: string,
    prompt: string,
    res: ServerResponse,
    frontendPages?: string[],
    frontendSchema?: ICollectionDef[],
    frontendCloudFunctions?: Array<{
      functionId: string
      name: string
      displayName?: string
      description?: string
      flowSchema?: Record<string, unknown>
    }>
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

      // 2. 持久化前端上传的全量状态（快照式写入 DB）
      //    前端在发起 AI chat 时收集内存中的最新状态并统一上传，
      //    后端在调用 XiangDi 之前先落库，确保 DB 始终是最新快照。
      //    XiangDi 后续通过内部 API 按需拉取，而非随请求体传入。
      const persistOps: Promise<unknown>[] = []

      // 2a. 持久化 pages
      if (frontendPages) {
        persistOps.push(applicationService.updateApplication(appId, { pages: frontendPages }))
      }
      // 2b. 持久化 Schema（数据库表结构）
      if (frontendSchema && frontendSchema.length > 0) {
        persistOps.push(SchemaService.setCollections(appId, frontendSchema))
      }
      // 2c. 持久化 CloudFunctions（云函数）
      if (frontendCloudFunctions && frontendCloudFunctions.length > 0) {
        persistOps.push(cloudFunctionService.bulkSync(appId, frontendCloudFunctions))
      }

      // 并行写入，全部完成后再继续（确保 XiangDi 拉取时 DB 已是最新）
      if (persistOps.length > 0) {
        await Promise.all(persistOps)
      }

      // 3. 获取或创建会话（1 App = 1 Conversation）
      await conversationService.getOrCreate(appId)

      // 4. 追加用户消息到会话历史（返回含 _id 的消息对象）
      const userMessage = await conversationService.appendUserMessage(appId, prompt)

      // 5. 构建 threadId 并标记执行状态为 running
      const threadId = `${appId}:${userMessage._id.toString()}`
      await conversationService.updateThreadStatus(appId, threadId, 'running')

      // 6. 检索 Agent 记忆（L2 层）+ 构建分层上下文
      const agentMemoryText = await memoryService.recall(appId, prompt)

      // 6a. 构建 ContextBuilder 所需的外部层 token 信息
      //     L1 (SystemPrompt): ~2500 tokens (AISchema doc + 基础 system prompt，由 XiangDi 构建)
      //     L2 (AgentMemory): 通过检索结果估算
      //     L5 (CurrentPrompt): 当前 prompt 的 token 数
      const contextOptions: ContextBuildOptions = {
        modelName: getActiveModelName(),
        systemPromptTokens: 2500, // buildSystemPrompt({ aiSchemaDoc }) 的稳定估值
        agentMemoryTokens: estimateTokens(agentMemoryText ?? ''),
        currentPromptTokens: estimateTokens(prompt),
      }

      // 6b. 通过 ContextBuilder 构建分层上下文（传入 prompt 用于语义检索 + 预算信息）
      //     ContextBuilder 用 modelContextWindow × 40% − L1 − L2 − L5 = L3+L4 可用预算
      const layeredContext = await contextBuilder.build(appId, prompt, contextOptions)
      const { contextSummary, recentMessages: historyMessages } = layeredContext

      // 7. 构造请求体，发送给 XiangDi 服务
      //    架构变更：不再传 pages/appSchema/cloudFunctions，XiangDi 通过内部 API 按需拉取
      //    threadId 传递给 XiangDi，用于 LangGraph Checkpointer 的 thread_id 配置
      //    contextSummary 传为 memoryHint（XiangDi 会注入 system prompt 尾部）
      //    recentMessages 传为 previousMessages（XiangDi 转为 LangChain BaseMessages）
      //    agentMemory 作为独立字段传递，XiangDi 将其格式化为 L2 层注入
      const requestBody = JSON.stringify({
        appId,
        prompt,
        threadId,
        previousMessages: historyMessages,
        ...(contextSummary ? { memoryHint: contextSummary } : {}),
        ...(agentMemoryText ? { agentMemory: agentMemoryText } : {}),
      })

      // 8. 向 XiangDi 服务发起 SSE 请求并透传给前端
      await this.proxySSE(requestBody, res, {
        onDone: async (finalPages: string[], agentOutput: string, roundSummary: string | null) => {
          // 收到 done 事件后，并行执行：写回 pages + 保存消息 + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { pages: finalPages }),
            conversationService.appendAssistantMessage(appId, agentOutput),
            conversationService.updateThreadStatus(appId, threadId, 'completed'),
          ])

          // 持久化 roundSummary + 生成 embedding（异步 fire-and-forget）
          if (roundSummary) {
            this.persistRound(appId, prompt, roundSummary).catch(err => {
              console.error('[AiService] Round 持久化失败:', err)
            })
          }

        },
        onError: async () => {
          await conversationService.updateThreadStatus(appId, threadId, 'failed').catch(err => {
            console.error('[AiService] 更新 threadStatus(failed) 失败:', err)
          })
        },
        onInterrupt: async () => {
          await conversationService.updateThreadStatus(appId, threadId, 'interrupted').catch(err => {
            console.error('[AiService] 更新 threadStatus(interrupted) 失败:', err)
          })
        },
      }, appId)
    } catch (err) {
      if (err instanceof ContextBudgetOverflowError) {
        // 刚性保障超预算：向前端发送结构化错误，便于展示针对性提示
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
   * 流程（ADR-023 · §9）：
   *   1. 若前端未传 threadId，从最近消息中查找 pending thread
   *   2. 更新 threadStatus 为 'running'（恢复中）
   *   3. 调用 XiangDi 服务 POST /ai/resume { threadId, resumeValue? }
   *   4. 透传 SSE 流，done/error 时更新 threadStatus
   *
   * @param appId        目标应用 ID
   * @param res          Koa 的底层 ServerResponse（用于 SSE 写入）
   * @param threadId     要恢复的 threadId（可选，未传时自动查找最近 pending thread）
   * @param resumeValue  用户对 interrupt 的响应值（如审批结果）
   */
  async resumeSSE(
    appId: string,
    res: ServerResponse,
    threadId?: string,
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
      // 1. 确定要恢复的 threadId
      const resolvedThreadId = threadId
        ?? (await conversationService.getLastPendingThread(appId))?.threadId
      if (!resolvedThreadId) {
        throw new Error('没有找到可恢复的执行线程')
      }

      // 2. 更新状态为 running（恢复中）
      await conversationService.updateThreadStatus(appId, resolvedThreadId, 'running')

      // 3. 读取最新 pages（resume 时需传递给 XiangDi 初始化 adapter）
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)
      const pages: string[] = app.pages ?? []

      // 4. 构造请求体（含 pages，确保 adapter 以最新状态恢复）
      const requestBody = JSON.stringify({
        threadId: resolvedThreadId,
        pages,
        ...(resumeValue !== undefined ? { resumeValue } : {}),
      })

      // 5. 转发到 XiangDi 服务 /ai/resume
      await this.proxyResumeSSE(requestBody, res, {
        onDone: async (finalPages: string[]) => {
          // 写回 pages + 标记完成
          await Promise.all([
            applicationService.updateApplication(appId, { pages: finalPages }),
            conversationService.updateThreadStatus(appId, resolvedThreadId, 'completed'),
          ])
        },
        onError: async () => {
          await conversationService.updateThreadStatus(appId, resolvedThreadId, 'failed').catch(err => {
            console.error('[AiService] 更新 threadStatus(failed) 失败:', err)
          })
        },
        onInterrupt: async () => {
          await conversationService.updateThreadStatus(appId, resolvedThreadId, 'interrupted').catch(err => {
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
   *
   * 若存在 pending（running/interrupted）的 thread，返回 threadId 和状态；
   * 否则返回 null，表示无未完成的执行。
   */
  async getStatus(appId: string): Promise<{ threadId: string; status: string; canResume: boolean } | null> {
    const pending = await conversationService.getLastPendingThread(appId)
    if (!pending) return null
    return {
      threadId: pending.threadId,
      status: pending.status,
      canResume: pending.status === 'interrupted' || pending.status === 'running',
    }
  }

  /**
   * 转发消歧响应到 XiangDi 服务
   * 透传到 XiangDi 服务的 POST /ai/disambiguation-response
   */
  async respondToDisambiguation(choiceId: string): Promise<unknown> {
    return this.proxyJSON('POST', '/ai/disambiguation-response', { choiceId })
  }

  /**
   * 获取所有可用 LLM provider 及当前激活状态
   * 透传到 XiangDi 服务的 GET /ai/models
   */
  async getModels(): Promise<unknown> {
    return this.proxyJSON('GET', '/ai/models', null)
  }

  /**
   * 切换激活的 LLM provider
   * 透传到 XiangDi 服务的 POST /ai/models/switch
   */
  async switchModel(provider: string): Promise<unknown> {
    return this.proxyJSON('POST', '/ai/models/switch', { provider })
  }

  /**
   * 向 XiangDi 服务 /ai/run 发起 SSE 请求并透传
   * 支持 onDone / onError / onInterrupt 生命周期回调
   */
  private proxySSE(
    requestBody: string,
    clientRes: ServerResponse,
    callbacks: {
      onDone: (pages: string[], agentOutput: string, roundSummary: string | null) => Promise<void>
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

      // 收集 text_delta 拼接 agent 最终输出
      let agentOutputBuffer = ''
      // 收集 round_summary 事件的摘要内容
      let roundSummaryBuffer: string | null = null

      const req = transport.request(options, (upstream: IncomingMessage) => {
        if (upstream.statusCode && upstream.statusCode >= 400) {
          reject(new Error(`XiangDi 服务返回错误状态码: ${upstream.statusCode}`))
          return
        }

        // 逐行解析 SSE，透传给前端
        let buffer = ''

        upstream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          // 最后一行可能不完整，保留到下次
          buffer = lines.pop() ?? ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)

              // 收集 text_delta 拼接完整输出
              if (currentEvent === 'text_delta') {
                try {
                  const parsed = JSON.parse(dataStr) as { text?: string }
                  if (parsed.text) agentOutputBuffer += parsed.text
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
                      console.error('[AiService] 写入 Schema 失败:', err)
                    })
                  }
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'round_summary') {
                // round_summary 事件：捕获整轮对话摘要（由 XiangDi summarize 节点产出）
                // 同时转发给前端（作为本轮对话总结展示）+ 后端持久化
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
                // memory_update 事件：由 extractMemory 节点产出
                // 持久化到 AgentMemory 集合（fire-and-forget），不转发给前端
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
                // done 事件：解析 pages，写回 MongoDB + 保存消息 + 持久化 round，再转发给前端
                try {
                  const parsed = JSON.parse(dataStr) as { pages?: string[] }
                  const finalPages = parsed.pages ?? []
                  // 异步写回，不阻塞 SSE 流
                  callbacks.onDone(finalPages, agentOutputBuffer, roundSummaryBuffer).catch((err) => {
                    console.error('[AiService] 写回数据失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'interrupt') {
                // interrupt 事件：XiangDi 服务暂停了图执行（等待用户输入）
                callbacks.onInterrupt?.().catch((err) => {
                  console.error('[AiService] onInterrupt 回调失败:', err)
                })
              }

              // 透传所有事件给前端（包括 round_summary，作为本轮对话总结展示）
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
   * 与 proxySSE 类似，但路由为 /ai/resume，且 onDone 只接收 pages（不拼接 agentOutput）。
   * 同样处理 schema_update / memory_update / round_summary 等事件的副作用。
   */
  private proxyResumeSSE(
    requestBody: string,
    clientRes: ServerResponse,
    callbacks: {
      onDone: (pages: string[]) => Promise<void>
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

              if (currentEvent === 'schema_update') {
                // schema_update 事件：解析 collections，写入 DB（异步 fire-and-forget）
                try {
                  const parsed = JSON.parse(dataStr) as { collections?: ICollectionDef[] }
                  if (Array.isArray(parsed.collections) && parsed.collections.length > 0) {
                    SchemaService.setCollections(appId, parsed.collections).catch((err) => {
                      console.error('[AiService] resume 写入 Schema 失败:', err)
                    })
                  }
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'round_summary') {
                // round_summary 事件：持久化 round 记录（resume 后的 round 也需要保存）
                try {
                  const parsed = JSON.parse(dataStr) as { summary?: string }
                  if (parsed.summary) {
                    this.persistRound(appId, '(resume)', parsed.summary).catch(err => {
                      console.error('[AiService] resume Round 持久化失败:', err)
                    })
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
                  callbacks.onDone(finalPages).catch((err) => {
                    console.error('[AiService] resume 写回数据失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              if (currentEvent === 'interrupt') {
                // interrupt 事件：恢复执行后再次被中断（例如多步 humanGate）
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
   * 持久化本轮对话 Round 记录 + 调用知识服务生成向量
   *
   * 异步执行（fire-and-forget），不阻塞主流程。
   * 流程：roundSummary → 知识服务(:3003) embedPassage → 写入 Conversation.rounds[]
   */
  private async persistRound(appId: string, userPrompt: string, roundSummary: string): Promise<void> {
    const { default: knowledgeClient } = await import('./KnowledgeClient.js')
    const embedding = await knowledgeClient.embedPassage(roundSummary)

    // embedding 为 null 时不阻塞 round 写入（知识服务可能暂时不可用）
    if (!embedding) {
      console.warn('[AiService] Embedding 生成失败（知识服务不可用），round 将无向量')
    }

    // 写入 Conversation.rounds[]
    await conversationService.appendRound(appId, userPrompt, roundSummary, embedding)
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
