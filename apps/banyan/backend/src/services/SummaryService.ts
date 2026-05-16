/**
 * 摘要生成服务
 *
 * 在每次对话完成（done 事件）后，异步调用 LLM 为本次会话生成一句话摘要，
 * 并通过 ConversationService.saveSummary() 持久化到 MongoDB。
 *
 * 设计原则：
 *   - 完全异步，不阻塞主流程（fire-and-forget，内部捕获所有异常）
 *   - 输入：最近 10 条消息（user + assistant 交替）
 *   - 输出：≤ 100 字的中文一句话摘要
 *   - 调用同一个 XiangDi 服务的 LLM 端点（复用 XIANGDI_URL 环境变量）
 *
 * 摘要用途：
 *   1. 会话列表页展示（比 lastUserMessage 更有语义）
 *   2. 续接其他会话时，把近期 N 条会话的 summary 拼入 memoryHint，
 *      注入 XiangDi system prompt，让 Agent 感知跨会话上下文
 */

import http from 'http'
import conversationService from './ConversationService.js'
import type { IMessage } from '../models/Conversation.js'

// XiangDi 服务地址（复用同一环境变量）
const XIANGDI_BASE_URL = process.env.XIANGDI_URL ?? 'http://localhost:3002'

// ─── 摘要 Prompt ──────────────────────────────────────────────────────────────

function buildSummaryPrompt(messages: IMessage[]): string {
  const dialogue = messages
    .slice(-10) // 最近 10 条
    .map((m) => {
      const role = m.role === 'user' ? '用户' : 'AI'
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return `${role}：${text.slice(0, 300)}`
    })
    .join('\n')

  return (
    `请根据以下对话内容，用一句话（不超过 100 字）概括本次对话的核心内容。` +
    `只输出摘要本身，不要加任何前缀或解释。\n\n对话内容：\n${dialogue}`
  )
}

// ─── HTTP 调用 XiangDi /ai/summarize ─────────────────────────────────────────

/**
 * 调用 XiangDi 服务的摘要端点
 * 返回摘要文本，失败时返回 null
 */
async function callSummarizeAPI(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ prompt })
    const url = new URL('/ai/summarize', XIANGDI_BASE_URL)

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3002,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as { summary?: string }
          resolve(parsed.summary ?? null)
        } catch {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.setTimeout(15_000, () => {
      req.destroy()
      resolve(null)
    })

    req.write(body)
    req.end()
  })
}

// ─── SummaryService ───────────────────────────────────────────────────────────

class SummaryService {
  /**
   * 异步触发摘要生成（fire-and-forget）
   *
   * 在 done 事件后调用，不 await，不阻塞主流程。
   * 内部捕获所有异常，失败时仅打印日志。
   *
   * @param conversationId 会话 ID
   */
  triggerAsync(conversationId: string): void {
    this.generate(conversationId).catch((err) => {
      console.error(`[SummaryService] 摘要生成失败 (${conversationId}):`, err)
    })
  }

  /**
   * 生成并保存摘要（内部实现）
   */
  private async generate(conversationId: string): Promise<void> {
    // 读取最近消息
    const messages = await conversationService.getMessages(conversationId, 10)
    if (messages.length === 0) return

    // 构造 prompt 并调用 LLM
    const prompt = buildSummaryPrompt(
      messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: new Date(),
      }))
    )

    const summary = await callSummarizeAPI(prompt)
    if (!summary) {
      console.warn(`[SummaryService] 摘要生成返回空 (${conversationId})`)
      return
    }

    // 持久化
    await conversationService.saveSummary(conversationId, summary)
    console.log(`[SummaryService] 摘要已保存 (${conversationId}): ${summary.slice(0, 50)}…`)
  }
}

export default new SummaryService()
