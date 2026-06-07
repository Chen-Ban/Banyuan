/**
 * AI Controller（V4 — ADR-041 Orchestrator 架构）
 *
 * 端点：
 *   - POST /api/ai/:appId/chat — SSE 流式对话
 *   - POST /api/ai/:appId/confirm — 确认 task 对话
 *   - POST /api/ai/:appId/discard — 撤销 task 对话
 *   - POST /api/ai/:appId/stop — 中止执行
 *   - GET  /api/ai/:appId/status — 查询执行状态
 *   - GET  /api/ai/:appId/pending — 获取待确认数据
 *   - GET  /api/ai/models — 查询 LLM 列表
 *   - POST /api/ai/models/switch — 切换 LLM
 */

import type { Context } from 'koa'
import { Types } from 'mongoose'
import aiService from '../services/AiService.js'
import dialogueService from '../services/DialogueService.js'
import { AiMissingParamError } from '../errors/index.js'
import { sseWriteError } from '../errors/sse.js'

class AiController {
  /**
   * POST /api/ai/:appId/chat
   *
   * 请求体：{ prompt: string, type: 'chat' | 'task', images?: Array<{ url: string, alt?: string }> }
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

    if (!appId) throw new AiMissingParamError('appId')
    if (!prompt) throw new AiMissingParamError('prompt')

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
        sseWriteError(res, err)
        res.end()
      }
    }
  }

  /**
   * POST /api/ai/:appId/confirm
   *
   * 确认对话：将 pending 中暂存的所有数据一次性写入 MongoDB。
   */
  async confirm(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    if (!appId) throw new AiMissingParamError('appId')

    const result = await aiService.confirmDialogue(appId)
    ctx.body = { success: true, ...result }
  }

  /**
   * POST /api/ai/:appId/discard
   *
   * 撤销对话：丢弃 pending 中的所有暂存数据，不写 DB。
   */
  async discard(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    if (!appId) throw new AiMissingParamError('appId')

    await aiService.discardDialogue(appId)
    ctx.body = { success: true }
  }

  /**
   * GET /api/ai/:appId/pending
   *
   * 获取当前 pending 对话的数据，用于前端页面刷新后恢复"确认/撤销"状态。
   */
  async getPending(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    if (!appId) throw new AiMissingParamError('appId')

    const dlg = await dialogueService.getConfirmable(appId)
    if (dlg) {
      const userMsg = dlg.messages.find(m => m.role === 'user')
      const assistantMsgs = dlg.messages.filter(m => m.role === 'assistant')
      const assistantText = assistantMsgs
        .flatMap(m => m.assistantContent ?? [])
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('')

      ctx.body = {
        hasPending: true,
        pending: {
          dialogueId: (dlg._id as Types.ObjectId).toString(),
          type: dlg.type,
          status: 'done',
          userContent: userMsg?.userContent?.prompt ?? '',
          assistantContent: assistantText || null,
          createdAt: dlg.createdAt.toISOString(),
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
    if (!appId) throw new AiMissingParamError('appId')

    const status = await aiService.getStatus(appId)
    if (status) {
      ctx.body = status
    } else {
      ctx.body = { dialogueId: null, threadId: null, status: 'idle', canConfirm: false }
    }
  }

  /**
   * POST /api/ai/:appId/stop
   *
   * 用户主动中止正在进行的 AI 执行。
   */
  async stop(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    if (!appId) throw new AiMissingParamError('appId')

    const body = ctx.request.body as { reason?: 'user_aborted' | 'connection_lost' } | undefined
    const reason = body?.reason ?? 'user_aborted'

    await aiService.stopDialogue(appId, reason)
    ctx.body = { success: true }
  }

  /**
   * GET /api/ai/models
   */
  async getModels(ctx: Context): Promise<void> {
    const result = await aiService.getModels()
    ctx.body = { success: true, data: result }
  }

  /**
   * POST /api/ai/models/switch
   */
  async switchModel(ctx: Context): Promise<void> {
    const body = ctx.request.body as { provider?: string }
    const provider = body?.provider?.trim()
    if (!provider) throw new AiMissingParamError('provider')

    const result = await aiService.switchModel(provider)
    ctx.body = result
  }
}

export default new AiController()
