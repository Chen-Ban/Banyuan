/**
 * AI Controller（V2）
 *
 * 处理 AI 相关的 HTTP 请求，核心是 SSE 流式接口。
 * V2 变更：请求体新增 type 字段（chat/task），由前端按钮状态决定。
 */

import type { Context } from 'koa'
import aiService from '../services/AiService.js'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{ prompt: string, type: 'chat' | 'task', images?: Array<{ url: string, alt?: string }> }
   *   - type: 对话类型，chat=纯聊天，task=做任务（默认 task）
   *   - images: 用户上传的图片列表（可选）
   *   - 会话自动按 appId 续接（1 App = 1 Conversation）
   *   - 前端在发起 AI chat 前已通过常规保存接口将最新状态写入 DB
   *
   * 响应：SSE 流
   *   event: text_delta        data: { text: string }
   *   event: tool_call         data: { id: string, name: string, input: unknown }
   *   event: tool_result       data: { id: string, result: unknown, isError: boolean }
*   event: app_snapshot      data: { appJSON: string }
*   event: schema_update     data: { collections: [...] }
*   event: disambiguation    data: { conflictContext, options }
*   event: checkpoint        data: { threadId: string, node: string, step: number }
*   event: done              data: { appJSON: string }
   *   event: error             data: { message: string }
   */
  async chat(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      prompt?: string
      type?: 'chat' | 'task'
      images?: Array<{ url: string; alt?: string }>
    }
    const prompt = body?.prompt?.trim()
    const type = body?.type ?? 'task' // 默认做任务
    const images = body?.images ?? []

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
    // 禁用 Nagle 算法，让每次 write() 立即发送独立 TCP 包，实现逐字流式输出
    res.socket?.setNoDelay(true)
    res.flushHeaders?.()

    try {
      await aiService.runWithSSE(appId, prompt, type, images, res)
    } catch (err) {
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : String(err)
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
        res.end()
      }
    }
  }

  /**
   * POST /api/ai/:appId/resume
   *
   * 从 checkpoint 恢复 AI 执行（断点续跑）。
   *
   * 请求体：{ dialogueId?: string, resumeValue?: unknown }
   *   - dialogueId 可选，未传时自动查找最近 pending dialogue
   *   - resumeValue 可选，用于 human-in-the-loop 审批响应
   *
   * 响应：SSE 流（与 chat 格式一致）
   */
  async resume(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { dialogueId?: string; resumeValue?: unknown }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
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

    ctx.respond = false

    const res = ctx.res
    // 禁用 Nagle 算法，让每次 write() 立即发送独立 TCP 包，实现逐字流式输出
    res.socket?.setNoDelay(true)
    res.flushHeaders?.()

    try {
      await aiService.resumeSSE(appId, res, body?.dialogueId, body?.resumeValue)
    } catch (err) {
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : String(err)
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
        res.end()
      }
    }
  }

  /**
   * GET /api/ai/:appId/status
   *
   * 查询应用当前的 AI 执行状态。
   */
  async getStatus(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    try {
      const status = await aiService.getStatus(appId)
      if (status) {
        ctx.body = status
      } else {
        ctx.body = { dialogueId: null, threadId: null, status: 'idle', canResume: false }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * POST /api/ai/disambiguation-response
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
   */
  async getModels(ctx: Context): Promise<void> {
    try {
      const result = await aiService.getModels()
      ctx.body = { success: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * POST /api/ai/models/switch
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
