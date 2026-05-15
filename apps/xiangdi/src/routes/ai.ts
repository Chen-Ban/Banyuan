/**
 * AI Agent 路由
 *
 * POST /ai/run
 *   Body: { appId: string, prompt: string, pages: string[] }
 *   Response: text/event-stream（SSE）
 *
 * SSE 事件类型：
 *   text_delta   — LLM 输出的文字片段 { text: string }
 *   tool_call    — 工具调用开始 { id, name, input }
 *   tool_result  — 工具调用结果 { id, result, isError }
 *   done         — 完成，携带最终 pages { pages: string[] }
 *   error        — 发生错误 { message: string }
 */

import type { ServerResponse } from 'http'
import Router from '@koa/router'
import {
    AgentLoop,
    ContextManager,
    AgentLifecycle,
    DeepSeekClient,
    loadApiKeyFromFile,
    createBanvasToolRegistry,
    buildSystemPrompt,
} from 'xiangdi'
import type { BanvasHostAdapter } from 'xiangdi'

const router = new Router({ prefix: '/ai' })

// ─── SSE 工具函数 ─────────────────────────────────────────────────────────────

function sseWrite(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded) return
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    res.write(`event: ${event}\ndata: ${payload}\n\n`)
}

function sseDone(res: ServerResponse): void {
    if (!res.writableEnded) res.end()
}

// ─── 内存 BanvasHostAdapter（pages 随请求传入，不访问 MongoDB）────────────────

function createMemoryAdapter(initialPages: string[]): BanvasHostAdapter & { getPages(): Promise<string[]> } {
    let pages = [...initialPages]
    return {
        async getPages(): Promise<string[]> {
            return pages
        },
        async setPages(newPages: string[]): Promise<void> {
            pages = newPages
        },
        async getAppMeta(): Promise<{ id: string; name: string; version: string }> {
            return { id: 'runtime', name: 'Banyuan App', version: '1.0.0' }
        },
    }
}

// ─── POST /ai/run ─────────────────────────────────────────────────────────────

router.post('/run', async (ctx) => {
    const { appId, prompt, pages } = ctx.request.body as {
        appId?: string
        prompt?: string
        pages?: string[]
    }

    if (!prompt || typeof prompt !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'prompt is required' }
        return
    }
    if (!Array.isArray(pages)) {
        ctx.status = 400
        ctx.body = { success: false, error: 'pages must be an array' }
        return
    }

    // 切换为 SSE 模式
    const res = ctx.res as ServerResponse
    ctx.respond = false  // 接管响应，绕过 Koa 的默认响应处理
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    })

    try {
        // 1. 构建内存 adapter（pages 来自请求体，不访问 MongoDB）
        const adapter = createMemoryAdapter(pages)
        const registry = createBanvasToolRegistry(adapter)

        // 2. 初始化 LLM 客户端
        const apiKey = await loadApiKeyFromFile()
        const client = new DeepSeekClient({ apiKey })

        // 3. 构建 AgentLoop
        const context = new ContextManager()
        const lifecycle = new AgentLifecycle()
        const loop = new AgentLoop(
            {
                llm: {
                    model: 'deepseek-chat',
                    maxTokens: 8192,
                    temperature: 0.3,
                },
                systemPrompt: buildSystemPrompt(),
                maxIterations: 30,
            },
            registry,
            context,
            lifecycle
        )

        // 4. 订阅 StreamBridge 事件 → SSE
        const unsubscribe = loop.stream.subscribe((event) => {
            switch (event.type) {
                case 'text_delta':
                    sseWrite(res, 'text_delta', { text: event.data.text })
                    break
                case 'tool_call':
                    sseWrite(res, 'tool_call', {
                        id: event.data.id,
                        name: event.data.name,
                        input: event.data.input,
                    })
                    break
                case 'tool_result':
                    sseWrite(res, 'tool_result', {
                        id: event.data.tool_use_id,
                        result: event.data.result,
                        isError: event.data.is_error ?? false,
                    })
                    break
                case 'error':
                    sseWrite(res, 'error', { message: event.data.error.message })
                    break
                // lifecycle 事件不转发给调用方（仅用于调试）
            }
        })

        // 5. 运行 Agent
        try {
            await loop.run(client, prompt)

            // 6. 完成后读取最终 pages，随 done 事件一起发送
            const finalPages = await adapter.getPages()
            sseWrite(res, 'done', { pages: finalPages })
        } finally {
            unsubscribe()
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sseWrite(res, 'error', { message })
    } finally {
        sseDone(res)
    }
})

export default router
