/**
 * AI Controller
 *
 * 处理 AI 相关的 HTTP 请求，核心是 SSE 流式接口。
 * Koa 的 ctx.res 是底层 Node.js ServerResponse，
 * 直接操作它来实现 SSE，绕过 Koa 的响应体封装。
 */

import type { Context } from 'koa'
import aiService from '../services/AiService'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{ prompt: string }
   * 响应：SSE 流
   *   event: text_delta   data: { text: string }
   *   event: tool_call    data: { id: string, name: string, input: unknown }
   *   event: tool_result  data: { id: string, result: unknown, isError: boolean }
   *   event: done         data: { pages: string[] }
   *   event: error        data: { message: string }
   */
  async chat(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { prompt?: string }
    const prompt = body?.prompt?.trim()

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    if (!prompt) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 prompt 参数' }
      return
    }

    // 设置 SSE 响应头
    ctx.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    ctx.status = 200

    // 告知 Koa 不要自动处理响应体
    ctx.respond = false

    // 直接操作底层 ServerResponse 进行 SSE 写入
    const res = ctx.res
    res.flushHeaders?.()

    try {
      await aiService.runWithSSE(appId, prompt, res)
    } catch (err) {
      // runWithSSE 内部已处理错误并写入 SSE，此处仅做兜底
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : String(err)
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
        res.end()
      }
    }
  }
}

export default new AiController()
