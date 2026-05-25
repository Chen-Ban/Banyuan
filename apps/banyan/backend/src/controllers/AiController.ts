/**
 * AI Controller
 *
 * 处理 AI 相关的 HTTP 请求，核心是 SSE 流式接口。
 * Koa 的 ctx.res 是底层 Node.js ServerResponse，
 * 直接操作它来实现 SSE，绕过 Koa 的响应体封装。
 */

import type { Context } from 'koa'
import aiService from '../services/AiService.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{
   *   prompt: string,
   *   pages?: string[],
   *   schema?: ICollectionDef[],
   *   cloudFunctions?: Array<{ functionId, name, displayName?, description?, flowSchema? }>
   * }
   *   - 会话自动按 appId 续接（1 App = 1 Conversation）
   *   - 前端在发起 AI chat 时收集内存中的全量状态统一上传，后端先持久化再调用 XiangDi
   *
   * 响应：SSE 流
   *   event: text_delta        data: { text: string }
   *   event: tool_call         data: { id: string, name: string, input: unknown }
   *   event: tool_result       data: { id: string, result: unknown, isError: boolean }
   *   event: checkpoint        data: { threadId: string, node: string, step: number }
   *   event: done              data: { pages: string[] }
   *   event: error             data: { message: string }
   */
  async chat(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      prompt?: string
      pages?: string[]
      schema?: ICollectionDef[]
      cloudFunctions?: Array<{
        functionId: string
        name: string
        displayName?: string
        description?: string
        flowSchema?: Record<string, unknown>
      }>
    }
    const prompt = body?.prompt?.trim()
    const pages = Array.isArray(body?.pages) ? body.pages : undefined
    const schema = Array.isArray(body?.schema) ? body.schema : undefined
    const cloudFunctions = Array.isArray(body?.cloudFunctions) ? body.cloudFunctions : undefined

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
      await aiService.runWithSSE(appId, prompt, res, pages, schema, cloudFunctions)
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
   * POST /api/ai/:appId/resume
   *
   * 从 checkpoint 恢复 AI 执行（断点续跑）。
   *
   * 请求体：{ threadId?: string, resumeValue?: unknown }
   *   - threadId 可选，未传时自动查找最近 pending thread
   *   - resumeValue 可选，用于 human-in-the-loop 审批响应
   *
   * 响应：SSE 流（与 chat 格式一致）
   */
  async resume(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { threadId?: string; resumeValue?: unknown }

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

    // 告知 Koa 不要自动处理响应体
    ctx.respond = false

    const res = ctx.res
    res.flushHeaders?.()

    try {
      await aiService.resumeSSE(appId, res, body?.threadId, body?.resumeValue)
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
   * 前端刷新/重连时调用，判断是否有可恢复的 thread。
   *
   * 响应：
   *   有 pending thread: { threadId: string, status: string, canResume: boolean }
   *   无 pending thread: { threadId: null, status: 'idle', canResume: false }
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
        ctx.body = { threadId: null, status: 'idle', canResume: false }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * POST /api/ai/disambiguation-response
   *
   * 转发消歧选择到 XiangDi 服务，resolve 挂起的 MasterGraph。
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
