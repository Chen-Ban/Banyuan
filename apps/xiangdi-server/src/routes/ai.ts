/**
 * AI Agent 路由
 *
 * POST /ai/run
 *   Body: { appId: string, prompt: string, pages: string[], runId?: string,
 *           previousMessages?: Message[], memoryHint?: string }
 *   Response: text/event-stream（SSE）
 *
 *   previousMessages: 历史对话消息（由 banyan 后端从 MongoDB 读取后传入）
 *     格式与 XiangDi Message 类型兼容：{ role: 'user'|'assistant', content: string|ContentBlock[] }[]
 *     注入到 ContextManager 后，AgentLoop 可感知多轮对话上下文
 *
 *   memoryHint: 跨会话记忆提示（由 banyan 后端从近期历史会话摘要拼接而成）
 *     注入到 system prompt 末尾，让 Agent 感知用户在同一应用中的历史操作背景
 *
 * POST /ai/summarize
 *   Body: { prompt: string }
 *   Response: { summary: string }
 *
 *   由 banyan 后端在 done 事件后异步调用，生成本次会话的一句话摘要
 *
 * POST /ai/resume/:runId
 *   Body: { approved: boolean, comment?: string, specPatch?: Partial<ChangeSpec>, appId?: string }
 *   Response:
 *     情况 A（进程未重启）：JSON { success: true, resumed: 'in_process' }
 *     情况 B（进程已重启）：text/event-stream（SSE），重建执行上下文后实时推送后续事件
 *
 * GET /ai/models
 *   Response: { providers: ModelInfo[], activeProvider: string }
 *   返回所有已注册 provider 的模型信息及当前激活状态
 *
 * POST /ai/models/switch
 *   Body: { provider: string }
 *   Response: { success: boolean, activeProvider?: string, error?: string }
 *   运行时切换激活的 LLM provider（deepseek / kimi）
 *
 * SSE 事件类型：
 *   text_delta      — LLM 输出的文字片段 { text: string }
 *   tool_call       — 工具调用开始 { id, name, input }
 *   tool_result     — 工具调用结果 { id, name, result, isError }
 *   pages_snapshot  — 写操作后实时推送当前 pages { pages: string[] }
 *   schema_update   — AI 调用 schema_set_collections 后推送新 Schema { collections: SchemaCollectionDef[] }
 *   human_gate      — 等待人工决策 { runId, trigger, prompt }
 *   disambiguation  — 检测到意图冲突，推送消歧选项 { conflictContext, options }
 *   done            — 完成，携带最终 pages { pages: string[] }
 *   error           — 发生错误 { message: string }
 *
 * POST /ai/disambiguation-response
 *   Body: { choiceId: string }
 *   Response: { success: boolean }
 *   当前端用户选择消歧方案后，调用此端点 resolve 挂起的 AgentLoop
 *
 * 架构说明：
 *   prompt → SpecPlanner（规划）→ ChangeSpec
 *          → SSEHarnessRunner（执行）
 *              ├── Memory.loadForTask()       注入历史经验
 *              ├── HumanGate（before_run）    → SSE human_gate + 挂起
 *              ├── AgentLoop.run()            执行工具调用
 *              ├── HumanGate（after_run）     → SSE human_gate + 挂起
 *              └── Memory.saveAfterTask()     保存本次经验
 *
 * HumanGate 断点续跑：
 *   1. SSEHarnessRunner 触发 HumanGate 时，将状态序列化到 LocalCheckpointStore
 *   2. 推送 human_gate SSE 事件给前端（携带 runId）
 *   3. 前端展示确认 UI，用户决策后调用 POST /ai/resume/:runId
 *   4. 若进程未重启：injectHumanDecision() 直接 resolve 挂起的 Promise，返回 JSON
 *   5. 若进程已重启：切换为 SSE 模式，重建执行上下文，实时推送后续事件
 */

import type { ServerResponse } from 'http'
import Router from '@koa/router'
import {
    AgentLoop,
    ContextManager,
    AgentLifecycle,
    createBanvasToolRegistry,
    buildSystemPrompt,
    generateAISchemaDoc,
    SSEHarnessRunner,
    injectHumanDecision,
    LocalCheckpointStore,
    SpecPlanner,
    DefaultMemoryManager,
    LLMRouter,
    LanceDBKnowledgeStore,
    registerKnowledgeSearchTool,
    registerSchemaTools,
} from '@banyuan/xiangdi-agent'
import { createLLMClient, getModelsInfo, switchProvider, PROVIDER_CATALOG } from '../llm/createLLMClient.js'
import type { BanvasHostAdapter, HumanDecision, SchemaCollectionDef, AppSchemaSnapshot } from '@banyuan/xiangdi-agent'
import { version as canvasVersion } from '@banyuan/banvasgl'
import path from 'node:path'
import os from 'node:os'

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

// ─── 写操作工具集合（执行后需推送 pages_snapshot）────────────────

const WRITE_TOOLS = new Set([
    'banvas_create_page',
    'banvas_add_node',
    'banvas_update_node',
    'banvas_delete_node',
    'banvas_move_node',
    'banvas_resize_node',
    'banvas_apply_patch',
])

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

// ─── 存储路径工具 ─────────────────────────────────────────────────────────────

/**
 * 每个 app 的记忆独立存储，路径：
 *   ~/.xiangdi/memory/<appId>/
 */
function getMemoryStoragePath(appId: string): string {
    const safeId = appId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
    return path.join(os.homedir(), '.xiangdi', 'memory', safeId)
}

/**
 * Checkpoint 存储路径（全局共享，按 runId 区分）：
 *   ~/.xiangdi/checkpoints/
 */
const CHECKPOINT_STORAGE_PATH = path.join(os.homedir(), '.xiangdi', 'checkpoints')

// ─── 全局 CheckpointStore（单例，跨请求共享）─────────────────────────────────

const checkpointStore = new LocalCheckpointStore({
    storagePath: CHECKPOINT_STORAGE_PATH,
    ttlMs: 30 * 60 * 1000, // 30 分钟
})

// 每小时清理一次过期 checkpoint
setInterval(() => {
    checkpointStore.cleanup().catch(() => {})
}, 60 * 60 * 1000)

// ─── Disambiguation Pending 存储（request-scoped，一个 SSE 连接对应一个 pending）─

/**
 * 存储当前挂起的消歧 pending resolve 函数。
 * Key: 自增 ID（每次 SSE 连接一个），Value: resolve 函数。
 * 因为一个 SSE 连接对应一次 Agent 运行，所以用最近一个 pending 即可。
 */
let disambiguationPendingResolve: ((choiceId: string) => void) | null = null

// ─── 工具函数：根据当前激活 provider 获取模型名 ───────────────────────────────

function getActiveModel(router: LLMRouter): string {
    return router.getActiveProviderId() === 'kimi'
        ? (process.env.KIMI_MODEL ?? 'moonshot-v1-32k')
        : (process.env.DEEPSEEK_MODEL ?? 'deepseek-chat')
}

// ─── AISchema 文档（启动时生成一次，注入所有 system prompt）─────────────────

const aiSchemaDoc = generateAISchemaDoc();

// ─── 版本化 KnowledgeStore（以 BanvasGL version 作为命名空间）─────────────

const knowledgeStore = new LanceDBKnowledgeStore({
    tableName: `knowledge_v${canvasVersion}`,
});

// ─── 共享：构建 AgentLoop + 订阅 SSE ─────────────────────────────────────────

/**
 * 构建 AgentLoop 并将 StreamBridge 事件桥接到 SSE 响应
 * 返回 { loop, unsubscribe }，调用方负责在 finally 中调用 unsubscribe()
 */
function buildLoopWithSSE(res: ServerResponse, systemPrompt: string, activeModel: string): { loop: AgentLoop; adapter: ReturnType<typeof createMemoryAdapter>; context: ContextManager; unsubscribe: () => void } {
    const adapter = createMemoryAdapter([])
    const registry = createBanvasToolRegistry(adapter)
    registerKnowledgeSearchTool(registry, knowledgeStore)
    const context = new ContextManager()
    const lifecycle = new AgentLifecycle()

    const loop = new AgentLoop(
        {
            llm: {
                model: activeModel,
                maxTokens: 8192,
                temperature: 0.3,
            },
            systemPrompt,
            maxIterations: 30,
        },
        registry,
        context,
        lifecycle
    )

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
            case 'tool_result': {
                sseWrite(res, 'tool_result', {
                    id: event.data.tool_use_id,
                    name: event.data.name,
                    result: event.data.result,
                    isError: event.data.is_error ?? false,
                })
                // 写操作工具执行完毕后，立即推送 pages_snapshot
                if (WRITE_TOOLS.has(event.data.name)) {
                    adapter.getPages().then((currentPages) => {
                        sseWrite(res, 'pages_snapshot', { pages: currentPages })
                    }).catch(() => { /* 静默失败 */ })
                }
                break
            }
            case 'disambiguation':
                sseWrite(res, 'disambiguation', event.data.options)
                break
            case 'disambiguation_pending':
                disambiguationPendingResolve = event.data.pending.resolve
                break
            case 'error':
                sseWrite(res, 'error', { message: event.data.error.message })
                break
        }
    })

    return { loop, adapter, context, unsubscribe }
}

// ─── POST /ai/run ─────────────────────────────────────────────────────────────

router.post('/run', async (ctx) => {
    const { appId, prompt, pages, runId: clientRunId, previousMessages, memoryHint, appSchema } = ctx.request.body as {
        appId?: string
        prompt?: string
        pages?: string[]
        runId?: string
        previousMessages?: Array<{ role: 'user' | 'assistant'; content: unknown }>
        memoryHint?: string
        appSchema?: SchemaCollectionDef[]
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

    // 使用客户端提供的 runId（便于前端关联），或自动生成
    const runId = clientRunId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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
        registerKnowledgeSearchTool(registry, knowledgeStore)

        // 1b. 注册 Schema 工具（schemaWriter 通过 SSE 推送 schema_update 事件给 banyan 后端）
        const currentSchema: AppSchemaSnapshot = { collections: appSchema ?? [] }
        registerSchemaTools(registry, {
            schemaReader: () => currentSchema,
            schemaWriter: (collections: SchemaCollectionDef[]) => {
                // 同步更新内存快照，避免同一 session 中后续 schema_get 读到旧数据
                currentSchema.collections = collections
                sseWrite(res, 'schema_update', { collections })
            },
        })

        // 2. 初始化 LLM 客户端
        const client = await createLLMClient()
        const llmRouter = client as LLMRouter
        const activeModel = getActiveModel(llmRouter)

        // 3. 构建 ContextManager，注入历史消息
        const context = new ContextManager()
        if (Array.isArray(previousMessages) && previousMessages.length > 0) {
            // 将 banyan 后端传来的历史消息注入 ContextManager
            // 类型与 XiangDi Message 兼容，直接 pushMany
            context.pushMany(
                previousMessages
                    .filter((m) => m.role === 'user' || m.role === 'assistant')
                    .map((m) => ({ role: m.role, content: m.content as import('@banyuan/xiangdi-agent').MessageContent }))
            )
        }

        const lifecycle = new AgentLifecycle()
        // 若有跨会话记忆提示，追加到 system prompt 末尾
        const systemPrompt = memoryHint
            ? `${buildSystemPrompt({ aiSchemaDoc })}\n\n---\n${memoryHint}`
            : buildSystemPrompt({ aiSchemaDoc })

        const loop = new AgentLoop(
            {
                llm: {
                    model: activeModel,
                    maxTokens: 8192,
                    temperature: 0.3,
                },
                systemPrompt,
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
                case 'tool_result': {
                    sseWrite(res, 'tool_result', {
                        id: event.data.tool_use_id,
                        name: event.data.name,
                        result: event.data.result,
                        isError: event.data.is_error ?? false,
                    })
                    // 写操作工具执行完毕后，立即推送 pages_snapshot
                    if (WRITE_TOOLS.has(event.data.name)) {
                        adapter.getPages().then((currentPages) => {
                            sseWrite(res, 'pages_snapshot', { pages: currentPages })
                        }).catch(() => { /* 静默失败 */ })
                    }
                    break
                }
                case 'disambiguation':
                    sseWrite(res, 'disambiguation', event.data.options)
                    break
                case 'disambiguation_pending':
                    // 存储 pending resolve，等待前端通过 POST /ai/disambiguation-response 调用
                    disambiguationPendingResolve = event.data.pending.resolve
                    break
                case 'error':
                    sseWrite(res, 'error', { message: event.data.error.message })
                    break
            }
        })

        try {
            // 5. SpecPlanner：将自然语言 prompt 规划为 ChangeSpec
            const planner = new SpecPlanner({
                client,
                model: activeModel,
                maxTokens: 2048,
            })
            const { spec } = await planner.plan(prompt)

            // 6. Memory：按 appId 隔离存储
            const storagePath = getMemoryStoragePath(appId ?? 'default')
            const memory = new DefaultMemoryManager({ storagePath })

            // 7. SSEHarnessRunner：支持 HumanGate 断点持久化
            //    autoRun: true → 跳过 before_run HumanGate，直接执行
            //    若需要 Human-in-the-Loop，设置 autoRun: false 并配置 humanGates
            const harness = new SSEHarnessRunner(
                loop,
                client,
                { autoRun: true },
                undefined,  // 暂不加载 ProjectSpec
                memory,
                checkpointStore,
                (event, data) => sseWrite(res, event, data),
                undefined,  // gateTimeoutMs，使用默认 30 分钟
                context     // ContextManager，用于 after_run 时读取消息历史
            )

            // 8. 执行（传入 runId，用于 checkpoint 关联）
            const result = await harness.run(spec, runId)

            if (!result.success) {
                sseWrite(res, 'error', {
                    message: result.failureReason ?? 'Agent execution failed',
                })
            }

            // 9. 完成后读取最终 pages，随 done 事件一起发送
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

// ─── POST /ai/summarize ───────────────────────────────────────────────────────

/**
 * 生成会话摘要
 *
 * 由 banyan 后端在 done 事件后异步调用（fire-and-forget）。
 * 输入：包含对话内容的 prompt（由 SummaryService 构造）
 * 输出：{ summary: string }（≤ 100 字的中文一句话摘要）
 */
router.post('/summarize', async (ctx) => {
    const { prompt } = ctx.request.body as { prompt?: string }

    if (!prompt || typeof prompt !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'prompt is required' }
        return
    }

    try {
        const client = await createLLMClient()
        const activeModel = getActiveModel(client as LLMRouter)
        const response = await client.createMessage({
            model: activeModel,
            max_tokens: 256,
            temperature: 0.3,
            system: '你是一个对话摘要助手，请用简洁的中文一句话概括用户提供的对话内容。',
            messages: [{ role: 'user', content: prompt }],
        })

        // 提取文本内容
        const summary = (response.content as Array<{ type: string; text?: string }>)
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim()
            .slice(0, 100)

        ctx.body = { summary }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.status = 500
        ctx.body = { success: false, error: message }
    }
})

// ─── POST /ai/resume/:runId ───────────────────────────────────────────────────
//
// 支持两种场景：
//   情况 A：进程未重启，HumanGate Promise 仍挂起
//     → injectHumanDecision() 直接 resolve，返回 JSON { success: true, resumed: 'in_process' }
//   情况 B：进程已重启，从 CheckpointStore 恢复
//     → 切换为 SSE 模式，重建完整执行上下文，实时推送后续事件给前端
//       前端在收到 human_gate 事件后应立即重新建立 SSE 连接，
//       然后调用 POST /ai/resume/:runId，此时响应即为新的 SSE 流

router.post('/resume/:runId', async (ctx) => {
    const { runId } = ctx.params
    const body = ctx.request.body as {
        approved?: boolean
        comment?: string
        specPatch?: Record<string, unknown>
        appId?: string
    }

    if (typeof body.approved !== 'boolean') {
        ctx.status = 400
        ctx.body = { success: false, error: 'approved (boolean) is required' }
        return
    }

    const decision: HumanDecision = {
        approved: body.approved,
        comment: body.comment,
        specPatch: body.specPatch as HumanDecision['specPatch'],
    }

    // ── 情况 A：进程未重启，Promise 仍挂起 ──────────────────────────────────
    const injected = injectHumanDecision(runId, decision)
    if (injected) {
        ctx.body = { success: true, resumed: 'in_process' }
        return
    }

    // ── 情况 B：进程已重启，从 CheckpointStore 恢复，切换为 SSE 模式 ─────────
    const checkpoint = await checkpointStore.load(runId)
    if (!checkpoint) {
        ctx.status = 404
        ctx.body = {
            success: false,
            error: `Checkpoint "${runId}" not found, expired, or already resumed`,
        }
        return
    }

    // 切换为 SSE 模式，重建完整执行上下文后实时推送事件
    const res = ctx.res as ServerResponse
    ctx.respond = false
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    })

    try {
        const client = await createLLMClient()
        const activeModel = getActiveModel(client as LLMRouter)
        const { loop, adapter, context, unsubscribe } = buildLoopWithSSE(res, buildSystemPrompt({ aiSchemaDoc }), activeModel)

        const storagePath = getMemoryStoragePath(body.appId ?? 'default')
        const memory = new DefaultMemoryManager({ storagePath })

        const harness = new SSEHarnessRunner(
            loop,
            client,
            { autoRun: true },
            undefined,
            memory,
            checkpointStore,
            (event, data) => sseWrite(res, event, data),
            undefined,
            context
        )

        try {
            const result = await harness.resume(runId, decision)

            if (!result.success) {
                sseWrite(res, 'error', {
                    message: result.failureReason ?? 'Resume execution failed',
                })
            }

            // 读取最终 pages 随 done 事件发送
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

// ─── POST /ai/disambiguation-response ─────────────────────────────────────────
//
// 前端用户选择消歧方案后调用，resolve 挂起的 AgentLoop
//
// 请求体：{ choiceId: string }
// 响应：{ success: boolean, error?: string }

router.post('/disambiguation-response', async (ctx) => {
    const { choiceId } = ctx.request.body as { choiceId?: string }

    if (!choiceId || typeof choiceId !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'choiceId (string) is required' }
        return
    }

    if (!disambiguationPendingResolve) {
        ctx.status = 404
        ctx.body = { success: false, error: 'No pending disambiguation to resolve' }
        return
    }

    // resolve 挂起的 Promise，恢复 AgentLoop 执行
    disambiguationPendingResolve(choiceId)
    disambiguationPendingResolve = null
    ctx.body = { success: true }
})

// ─── GET /ai/models ───────────────────────────────────────────────────────────
//
// 返回所有已注册 provider 的模型信息及当前激活状态
//
// 响应示例：
// {
//   "providers": [
//     { "provider": "deepseek", "model": "deepseek-chat", "availableModels": [...], "active": true },
//     { "provider": "kimi",     "model": "moonshot-v1-32k", "availableModels": [...], "active": false }
//   ],
//   "activeProvider": "deepseek"
// }

router.get('/models', async (ctx) => {
    try {
        const providers = await getModelsInfo()
        const activeProvider = providers.find((p) => p.active)?.provider ?? 'deepseek'
        ctx.body = { providers, activeProvider }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.status = 500
        ctx.body = { success: false, error: message }
    }
})

// ─── POST /ai/models/switch ───────────────────────────────────────────────────
//
// 运行时切换激活的 LLM provider
//
// 请求体：{ provider: string }
//   provider — 目标 provider ID，可选值见 GET /ai/models 返回的 providers[].provider
//
// 响应：
//   成功：{ success: true, activeProvider: string }
//   失败：{ success: false, error: string }

router.post('/models/switch', async (ctx) => {
    const { provider } = ctx.request.body as { provider?: string }

    if (!provider || typeof provider !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'provider is required' }
        return
    }

    if (!PROVIDER_CATALOG[provider]) {
        ctx.status = 400
        ctx.body = {
            success: false,
            error: `Unknown provider "${provider}". Available: ${Object.keys(PROVIDER_CATALOG).join(', ')}`,
        }
        return
    }

    const switched = await switchProvider(provider)
    if (!switched) {
        ctx.status = 500
        ctx.body = { success: false, error: `Failed to switch to provider "${provider}"` }
        return
    }

    ctx.body = { success: true, activeProvider: provider }
})

export default router
