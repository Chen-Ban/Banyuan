/**
 * AI 服务（HTTP 代理层）
 *
 * 负责：
 * 1. 从 MongoDB 读取目标应用的 pages 数据
 * 2. 从 MongoDB 读取/创建对话会话，获取历史消息
 * 3. 将 pages + prompt + previousMessages 发送给 XiangDi 独立服务（:3002）
 * 4. 透传 XiangDi 返回的 SSE 流给前端
 * 5. 收到 done 事件后，将最终 pages 写回 MongoDB，并保存本轮消息
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ MongoDB（Application + Conversation）
 *
 * 会话持久化策略：
 *   - 前端可传入 conversationId（续接已有会话）或不传（自动创建新会话）
 *   - 每次请求前：追加 user 消息，读取历史消息注入 XiangDi
 *   - done 事件后：追加 assistant 消息（LLM 最终输出文本）
 *   - conversationId 随 done 事件一起返回给前端，前端持久化后下次续接
 *
 * SSE 事件类型（与 XiangDi 服务保持一致，新增 conversation_id）：
 *   text_delta       — LLM 输出的文字片段
 *   tool_call        — 工具调用开始（含工具名和入参）
 *   tool_result      — 工具调用结果
 *   conversation_id  — 会话 ID（在第一个事件前发送，前端需持久化）
 *   done             — 完成，携带最终 pages JSON
 *   error            — 发生错误
 *
 * memoryHint 注入策略：
 *   续接会话时，从 MongoDB 读取同一 appId 下最近 5 条已有摘要的历史会话，
 *   格式化为自然语言后拼入 XiangDi 请求体的 memoryHint 字段，
 *   XiangDi 服务将其注入 system prompt，让 Agent 感知跨会话上下文。
 */

import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import https from 'https'
import applicationService from './ApplicationService.js'
import conversationService from './ConversationService.js'
import summaryService from './SummaryService.js'
import { SchemaService } from './SchemaService.js'
import type { ICollectionDef } from '../models/AppSchema.js'

// XiangDi 服务地址，通过环境变量配置，默认本地开发地址
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'
// 内部认证 token，与 XiangDi 服务共享
const XIANGDI_INTERNAL_TOKEN = process.env.XIANGDI_INTERNAL_TOKEN

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
   * @param appId            目标应用 ID
   * @param prompt           用户自然语言指令
   * @param res              Koa 的底层 ServerResponse（用于 SSE 写入）
   * @param conversationId   可选，已有会话 ID（续接对话）
   * @param frontendPages    前端传入的当前 pages（最新内存状态），AI 操作此版本；
   *                         done 事件后写回 DB 作为 checkpoint
   */
  async runWithSSE(
    appId: string,
    prompt: string,
    res: ServerResponse,
    conversationId?: string,
    frontendPages?: string[]
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
      // 1. 校验应用存在（不再从 DB 读 pages，使用前端传入的最新状态）
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)
      // 优先用前端传入的 pages（最新内存状态），前端未传时回退到 DB 快照
      const pages: string[] = frontendPages ?? app.pages ?? []

      // 2. 获取或创建会话
      const conversation = await conversationService.getOrCreate(appId, conversationId)
      const convId = conversation.id

      // 3. 立即推送 conversation_id 给前端（前端需持久化，用于下次续接）
      sseWrite(res, 'conversation_id', { conversationId: convId })

      // 4. 追加用户消息到会话历史
      await conversationService.appendUserMessage(convId, prompt)

      // 5. 读取历史消息（不含本次刚追加的 user 消息，避免重复）
      //    取最近 50 条，足够覆盖大多数对话场景
      const previousMessages = await conversationService.getMessages(convId, 50)
      // 去掉最后一条（刚追加的 user 消息），XiangDi 会把 prompt 作为新消息注入
      const historyMessages = previousMessages.slice(0, -1)

      // 5b. 读取近期历史会话摘要，拼入 memoryHint（跨会话记忆）
      //     仅在有历史消息时注入（全新会话无需注入）
      let memoryHint: string | undefined
      if (historyMessages.length > 0) {
        const summaries = await conversationService.getSummariesForContext(appId, convId, 5)
        if (summaries.length > 0) {
          const lines = summaries.map(
            (s, i) => `${i + 1}. 【${s.title}】${s.summary}`
          )
          memoryHint =
            `以下是用户在同一应用中的近期历史对话摘要，供参考：\n` + lines.join('\n')
        }
      }

      // 6. 读取应用的 AppSchema，注入到请求体的 projectSpec 中
      const schemaDoc = await SchemaService.getSchema(appId)
      const appSchema = schemaDoc.collections.map((col) => ({
        collectionName: col.name,
        fields: col.fields.map((f) => ({
          name: f.name,
          displayName: f.displayName,
          type: f.type,
          required: f.required,
          ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
          ...(f.refCollection ? { refCollection: f.refCollection } : {}),
          ...(f.enumValues?.length ? { enumValues: f.enumValues } : {}),
        })),
      }))

      // 7. 构造请求体，发送给 XiangDi 服务
      const requestBody = JSON.stringify({
        appId,
        prompt,
        pages,
        conversationId: convId,
        previousMessages: historyMessages,
        ...(memoryHint ? { memoryHint } : {}),
        ...(appSchema.length > 0 ? { appSchema } : {}),
      })

      // 8. 向 XiangDi 服务发起 SSE 请求并透传给前端
      await this.proxySSE(requestBody, res, async (finalPages: string[], agentOutput: string) => {
        // 9. 收到 done 事件后，并行执行：写回 pages + 保存 assistant 消息
        await Promise.all([
          applicationService.updateApplication(appId, { pages: finalPages }),
          conversationService.appendAssistantMessage(convId, agentOutput),
        ])
        // 10. 异步触发摘要生成（fire-and-forget，不阻塞 done 响应）
        summaryService.triggerAsync(convId)
      }, appId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sseWrite(res, 'error', { message })
      sseDone(res)
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
   * 向 XiangDi 服务发起 HTTP 请求，透传 SSE 流
   * 当收到 done 事件时，调用 onDone 回调（携带最终 pages 和 agent 输出）
   */
  private proxySSE(
    requestBody: string,
    clientRes: ServerResponse,
    onDone: (pages: string[], agentOutput: string) => Promise<void>,
    appId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL('/ai/run', XIANGDI_BASE_URL)

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 3002,
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

      const req = http.request(options, (upstream: IncomingMessage) => {
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

              if (currentEvent === 'done') {
                // done 事件：解析 pages，写回 MongoDB + 保存消息，再转发给前端
                try {
                  const parsed = JSON.parse(dataStr) as { pages?: string[] }
                  const finalPages = parsed.pages ?? []
                  // 异步写回，不阻塞 SSE 流
                  onDone(finalPages, agentOutputBuffer).catch((err) => {
                    console.error('[AiService] 写回数据失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              // 透传所有事件给前端（包括 done、schema_update）
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
          sseWrite(clientRes, 'error', { message: err.message })
          sseDone(clientRes)
          reject(err)
        })
      })

      req.on('error', (err) => {
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
