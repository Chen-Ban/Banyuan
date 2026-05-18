/**
 * AI Controller
 *
 * 处理 AI 相关的 HTTP 请求，核心是 SSE 流式接口。
 * Koa 的 ctx.res 是底层 Node.js ServerResponse，
 * 直接操作它来实现 SSE，绕过 Koa 的响应体封装。
 */

import type { Context } from 'koa'
import aiService from '../services/AiService.js'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{ prompt: string, conversationId?: string }
   *   - conversationId 可选，传入则续接已有会话，不传则自动创建新会话
   *
   * 响应：SSE 流
   *   event: conversation_id  data: { conversationId: string }  ← 第一个事件，前端需持久化
   *   event: text_delta        data: { text: string }
   *   event: tool_call         data: { id: string, name: string, input: unknown }
   *   event: tool_result       data: { id: string, result: unknown, isError: boolean }
   *   event: done              data: { pages: string[] }
   *   event: error             data: { message: string }
   */
  async chat(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { prompt?: string; conversationId?: string }
    const prompt = body?.prompt?.trim()
    const conversationId = body?.conversationId?.trim() || undefined

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
      await aiService.runWithSSE(appId, prompt, res, conversationId)
    } catch (err) {
      // runWithSSE 内部已处理错误并写入 SSE，此处仅做兜底
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : String(err)
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
        res.end()
      }
    }
  }

  /**
   * POST /api/ai/disambiguation-response
   *
   * 转发消歧选择到 XiangDi 服务，resolve 挂起的 AgentLoop。
   *
   * 请求体：{ choiceId: string }
   * 响应：{ success: boolean, error?: string }
   */
  async disambiguationResponse(ctx: Context): Promise<void> {
    const body = ctx.request.body as { choiceId?: string }
    const choiceId = body?.choiceId?.trim()

    if (!choiceId) {
      ctx.status = 400
      ctx.body = { success: false, error: '缺少 choiceId 参数' }
      return
    }

    try {
      const result = await aiService.respondToDisambiguation(choiceId)
      ctx.body = result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * GET /api/ai/models
   *
   * 透传到 XiangDi 服务的 GET /ai/models，返回所有可用 provider 及当前激活状态。
   *
   * 响应示例：
   * {
   *   "providers": [
   *     { "provider": "deepseek", "model": "deepseek-chat", "availableModels": [...], "active": true },
   *     { "provider": "kimi",     "model": "moonshot-v1-32k", "availableModels": [...], "active": false }
   *   ],
   *   "activeProvider": "deepseek"
   * }
   */
  async getModels(ctx: Context): Promise<void> {
    try {
      const result = await aiService.getModels()
      ctx.body = result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * POST /api/ai/models/switch
   *
   * 透传到 XiangDi 服务的 POST /ai/models/switch，切换激活的 LLM provider。
   *
   * 请求体：{ provider: string }
   *   provider — 目标 provider ID（如 "deepseek" 或 "kimi"）
   *
   * 响应：
   *   成功：{ success: true, activeProvider: string }
   *   失败：{ success: false, error: string }
   */
  async switchModel(ctx: Context): Promise<void> {
    const body = ctx.request.body as { provider?: string }
    const provider = body?.provider?.trim()

    if (!provider) {
      ctx.status = 400
      ctx.body = { success: false, error: '缺少 provider 参数' }
      return
    }

    try {
      const result = await aiService.switchModel(provider)
      ctx.body = result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }
}

export default new AiController()
