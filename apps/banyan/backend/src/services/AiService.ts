/**
 * AI 服务（HTTP 代理层）
 *
 * 负责：
 * 1. 从 MongoDB 读取目标应用的 pages 数据
 * 2. 将 pages + prompt 发送给 XiangDi 独立服务（:3002）
 * 3. 透传 XiangDi 返回的 SSE 流给前端
 * 4. 收到 done 事件后，将最终 pages 写回 MongoDB
 *
 * 架构：
 *   前端 ←SSE── banyan 后端(:3001) ←SSE── XiangDi 服务(:3002)
 *                     ↕ MongoDB
 *
 * XiangDi 服务是无状态的：pages 随请求传入，随 done 事件返回，
 * banyan 后端负责持久化，XiangDi 服务不访问 MongoDB。
 *
 * SSE 事件类型（与 XiangDi 服务保持一致）：
 *   text_delta   — LLM 输出的文字片段
 *   tool_call    — 工具调用开始（含工具名和入参）
 *   tool_result  — 工具调用结果
 *   done         — 完成，携带最终 pages JSON
 *   error        — 发生错误
 */

import type { IncomingMessage, ServerResponse } from 'http'
import http from 'http'
import applicationService from './ApplicationService.js'

// XiangDi 服务地址，通过环境变量配置，默认本地开发地址
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'

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
   * @param appId     目标应用 ID
   * @param prompt    用户自然语言指令
   * @param res       Koa 的底层 ServerResponse（用于 SSE 写入）
   */
  async runWithSSE(appId: string, prompt: string, res: ServerResponse): Promise<void> {
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
      // 1. 从 MongoDB 读取当前 pages
      const app = await applicationService.getApplicationById(appId)
      if (!app) throw new Error(`应用 ${appId} 不存在`)
      const pages: string[] = app.pages ?? []

      // 2. 构造请求体，发送给 XiangDi 服务
      const requestBody = JSON.stringify({ appId, prompt, pages })

      // 3. 向 XiangDi 服务发起 SSE 请求并透传给前端
      await this.proxySSE(requestBody, res, async (finalPages: string[]) => {
        // 4. 收到 done 事件后，将最终 pages 写回 MongoDB
        await applicationService.updateApplication(appId, { pages: finalPages })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sseWrite(res, 'error', { message })
      sseDone(res)
    }
  }

  /**
   * 向 XiangDi 服务发起 HTTP 请求，透传 SSE 流
   * 当收到 done 事件时，调用 onDone 回调（携带最终 pages）
   */
  private proxySSE(
    requestBody: string,
    clientRes: ServerResponse,
    onDone: (pages: string[]) => Promise<void>
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
        },
      }

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

              if (currentEvent === 'done') {
                // done 事件：解析 pages，写回 MongoDB，再转发给前端
                try {
                  const parsed = JSON.parse(dataStr) as { pages?: string[] }
                  const finalPages = parsed.pages ?? []
                  // 异步写回，不阻塞 SSE 流
                  onDone(finalPages).catch((err) => {
                    console.error('[AiService] 写回 pages 失败:', err)
                  })
                } catch {
                  // 解析失败不影响透传
                }
              }

              // 透传所有事件给前端（包括 done）
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
}

export default new AiService()
