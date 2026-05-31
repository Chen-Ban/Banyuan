/**
 * AI Controller（V3 — 事务化）
 *
 * V3 变更：
 *   - 新增 confirm / discard / getPending 接口
 *   - task 模式对话完成后前端需调用 confirm 才会持久化到 DB
 */

import type { Context } from 'koa'
import aiService from '../services/AiService.js'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{ prompt: string, type: 'chat' | 'task', images?: Array<{ url: string, alt?: string }> }
   *   - type: 对话类型，chat=纯聊天（直接写 DB），task=做任务（走 pending + confirm）
   *   - images: 用户上传的图片列表（可选）
   *
   * 响应：SSE 流
   */
  async chat(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      prompt?: string
      type?: 'chat' | 'task'
      images?: Array<{ url: string; alt?: string }>
    }
    const prompt = body?.prompt?.trim()
    const type = body?.type ?? 'task'
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
    ctx.respond = false

    const res = ctx.res
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
   * 响应：SSE 流
   */
  async resume(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as { dialogueId?: string; resumeValue?: unknown }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    ctx.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    ctx.status = 200
    ctx.respond = false

    const res = ctx.res
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
   * POST /api/ai/:appId/confirm
   *
   * 确认对话：将 pending 中暂存的所有数据一次性写入 MongoDB。
   * 只有 task 模式且 pending.status === 'done' 时才可调用。
   *
   * 响应：{ success: true, dialogueId: string }
   */
  async confirm(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    try {
      const result = await aiService.confirmDialogue(appId)
      ctx.body = { success: true, ...result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 400
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * POST /api/ai/:appId/discard
   *
   * 撤销对话：丢弃 pending 中的所有暂存数据，不写 DB。
   * 前端应同时回滚画布到对话前的状态。
   *
   * 响应：{ success: true }
   */
  async discard(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    try {
      await aiService.discardDialogue(appId)
      ctx.body = { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ctx.status = 500
      ctx.body = { success: false, error: message }
    }
  }

  /**
   * GET /api/ai/:appId/pending
   *
   * 获取当前 pending 对话的数据。
   * 用于前端页面刷新后恢复"确认/撤销"状态。
   *
   * 响应：{ hasPending: boolean, pending?: PendingDialogueDTO }
   * DTO 字段与前端 PendingDialogueInfo 类型对齐。
   */
  async getPending(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    const pending = aiService.getPendingDialogue(appId)
    if (pending) {
      // 转换为前端期望的 DTO 格式（PendingDialogueInfo）
      const assistantText = pending.assistantContent
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')

      ctx.body = {
        hasPending: true,
        pending: {
          dialogueId: pending.dialogueId,
          type: pending.type,
          status: pending.status,
          userContent: pending.userMessage.prompt,
          assistantContent: assistantText || null,
          createdAt: new Date(pending.createdAt).toISOString(),
        },
      }
    } else {
      ctx.body = { hasPending: false }
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
