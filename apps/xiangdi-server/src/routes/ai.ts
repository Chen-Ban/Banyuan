/**
 * AI Agent 路由（LangGraph 架构）
 *
 * POST /ai/run
 *   Body: { appId: string, prompt: string, threadId?: string,
 *           previousMessages?: Message[], memoryHint?: string, agentMemory?: string,
 *           requireApproval?: boolean }
 *   Response: text/event-stream（SSE）
 *
 *   架构变更：不再接收 pages/appSchema，通过 BanyanClient 从 banyan 后端按需拉取
 *
 *   previousMessages: 最近的对话消息（由 banyan 后端 ContextBuilder 裁剪后传入）
 *     格式与 XiangDi Message 类型兼容：{ role: 'user'|'assistant', content: string|ContentBlock[] }[]
 *     转换为 LangChain BaseMessage 后注入 LangGraph Agent 图的初始 messages
 *     注意：这里只包含经过 token 预算裁剪后的最近 N 轮，不是全部历史
 *
 *   memoryHint: 历史上下文摘要（Context Summary）—— 由 banyan 后端 ContextBuilder 动态生成
 *     结构化的项目记忆（用户意图、已完成操作、关键决策、待处理任务）
 *     注入到 state.contextSummary，让 Plan 节点感知未选中 round 的历史信息
 *     与 previousMessages 形成互补：contextSummary 覆盖远期历史摘要，messages 覆盖近期完整对话
 *
 * POST /ai/resume
 *   Body: { threadId: string, resumeValue?: unknown, pages?: string[] }
 *   Response: text/event-stream（SSE）
 *
 * GET /ai/thread/:threadId/status
 *   Response: { threadId, status, currentNode?, interrupt?, lastCheckpointAt? }
 *
 * DELETE /ai/thread/:threadId
 *   Response: 204 No Content
 *
 * GET /ai/models
 *   Response: { providers: ModelInfo[], activeProvider: string }
 *
 * POST /ai/models/switch
 *   Body: { provider: string }
 *   Response: { success: boolean, activeProvider?: string, error?: string }
 *
 * SSE 事件类型：
 *   text_delta         — LLM 输出的文字片段 { text: string }
 *   tool_call          — 工具调用开始 { id, name, input }
 *   tool_result        — 工具调用结果 { id, name, result, isError }
 *   pages_snapshot     — 写操作后实时推送当前 pages { pages: string[] }
 *   schema_update      — AI 调用 schema_set_collections 后推送新 Schema
 *   disambiguation     — 检测到意图冲突，推送消歧选项
 *   round_summary      — 本轮对话总结 { summary: string }
 *   memory_update      — Agent 记忆更新 { episode, facts }
 *   checkpoint         — 执行状态已持久化 { threadId, node, step }
 *   interrupt          — 图执行被中断，等待人工介入 { threadId, node, value }
 *   resumed            — 从 checkpoint 恢复执行 { fromNode, step }
 *   done               — 完成，携带最终 pages { pages: string[] }
 *   error              — 发生错误 { message: string }
 *
 * POST /ai/disambiguation-response
 *   Body: { threadId: string, choiceId: string }
 *   Response: { success: boolean }
 *
 * 架构说明（LangGraph）：
 *   prompt → createAgentGraph() → StateGraph (think↔tools 循环)
 *   StreamCallback 将 Agent 事件桥接到 SSE 响应
 */

import type { ServerResponse } from 'http'
import crypto from 'node:crypto'
import Router from '@koa/router'
import { Command } from '@langchain/langgraph'
import {
    createBanvasToolRegistry,
    buildSystemPrompt,
    generateAISchemaDoc,
    createMasterGraph,
    createChatGraph,
    LLMRouter,
    registerKnowledgeSearchTool,
    registerSchemaTools,
} from '@banyuan/xiangdi-agent'
import { RemoteKnowledgeStore } from '../knowledge/RemoteKnowledgeStore.js'
import { BanyanClient, registerDataFetchTools } from '../banyan/index.js'
import { getCheckpointer } from '../checkpoint/index.js'
import { recordThreadActivity } from '../checkpoint/cleanup.js'
import { HumanMessage } from '@langchain/core/messages'
import { createLLMClient, getModelsInfo, switchProvider, PROVIDER_CATALOG } from '../llm/createLLMClient.js'
import { ServiceUnavailableError } from '../errors.js'
import { createRequestLogger } from '../logger.js'
import type { BanvasHostAdapter, SchemaCollectionDef, AppSchemaSnapshot, StreamCallback, TypedStreamEvent } from '@banyuan/xiangdi-agent'

const router = new Router({ prefix: '/ai' })

// ─── SSE 工具函数 ─────────────────────────────────────────────────────────────

const SSE_HEARTBEAT_INTERVAL = 15_000 // 15 秒心跳间隔

function sseWrite(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded) return
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    res.write(`event: ${event}\ndata: ${payload}\n\n`)
}

function sseDone(res: ServerResponse): void {
    if (!res.writableEnded) res.end()
}

/**
 * 启动 SSE 心跳，每 15 秒发送 `:ping` 注释帧保持连接活跃。
 * 返回清理函数，在响应结束时调用。
 */
function startSSEHeartbeat(res: ServerResponse): () => void {
    const timer = setInterval(() => {
        if (res.writableEnded) {
            clearInterval(timer)
            return
        }
        res.write(':ping\n\n')
    }, SSE_HEARTBEAT_INTERVAL)
    timer.unref()

    // 连接关闭时自动清理
    const cleanup = () => { clearInterval(timer) }
    res.on('close', cleanup)

    return cleanup
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

// ─── 内存 BanvasHostAdapter（pages 由 BanyanClient 拉取后传入，不直接访问 MongoDB）──

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

// ─── Disambiguation Pending 存储（按 threadId 隔离，支持并发 SSE 连接）────────

/**
 * 存储挂起的消歧 pending resolve 函数，按 threadId 隔离。
 * 每个 SSE 连接对应一个 threadId，避免并发请求之间覆盖 resolve 导致 Promise 永久挂起。
 */
const disambiguationPendingMap = new Map<string, (choiceId: string) => void>()

// ─── 工具函数：根据当前激活 provider 获取模型名 ───────────────────────────────

function getActiveModel(llmRouter: LLMRouter): string {
    return llmRouter.getActiveProviderId() === 'kimi'
        ? (process.env.KIMI_MODEL ?? 'kimi-k2.6')
        : (process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro')
}

// ─── AISchema 文档（启动时生成一次，注入所有 system prompt）─────────────────

const aiSchemaDoc = generateAISchemaDoc();

// ─── 远程 KnowledgeStore ─────────────────────────────────────────────────────

const knowledgeStore = new RemoteKnowledgeStore();

// ─── Banyan 后端客户端（Pull-based 数据获取）──────────────────────────────────

const banyanClient = new BanyanClient();

// ─── 共享：构建 StreamCallback → SSE 桥接 ─────────────────────────────────────

/**
 * 创建一个 StreamCallback，将 Agent 事件桥接到 SSE 响应
 */
function createSSEStreamCallback(
    res: ServerResponse,
    adapter: ReturnType<typeof createMemoryAdapter>,
    threadId: string
): StreamCallback {
    return (event: TypedStreamEvent) => {
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
                disambiguationPendingMap.set(threadId, event.data.pending.resolve)
                break
            case 'round_summary':
                sseWrite(res, 'round_summary', { summary: event.data.summary })
                break
            case 'memory_update':
                sseWrite(res, 'memory_update', { episode: event.data.episode, facts: event.data.facts })
                break
            case 'error':
                sseWrite(res, 'error', { message: event.data.error.message })
                break
        }
    }
}

// ─── POST /ai/run ─────────────────────────────────────────────────────────────

router.post('/run', async (ctx) => {
    const { appId, prompt, threadId: clientThreadId, previousMessages, memoryHint, agentMemory, requireApproval, mode, images } = ctx.request.body as {
        appId?: string
        prompt?: string
        threadId?: string
        previousMessages?: Array<{ role: 'user' | 'assistant'; content: unknown }>
        memoryHint?: string
        /** L2: Agent 记忆文本（由 banyan 后端 MemoryService.recall() 生成，含用户偏好） */
        agentMemory?: string
        /** 是否需要人工审批（默认 false 即 autoRun 模式） */
        requireApproval?: boolean
        /** 对话模式：chat（轻量聊天）| task（完整任务管线），默认 task */
        mode?: 'chat' | 'task'
        /** 用户上传的图片 URL 列表（已上传至 OSS） */
        images?: string[]
    }

    if (!appId || typeof appId !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'appId is required' }
        return
    }
    if (!prompt || typeof prompt !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'prompt is required' }
        return
    }

    // 使用客户端提供的 threadId，或自动生成
    const threadId = clientThreadId ?? crypto.randomUUID()

    // 409 冲突检测：若客户端提供了 threadId 且该 thread 已有 checkpoint，拒绝重复执行
    if (clientThreadId) {
        try {
            const checkpointer = getCheckpointer()
            const existing = await checkpointer.getTuple({ configurable: { thread_id: clientThreadId } })
            if (existing) {
                ctx.status = 409
                ctx.body = { success: false, error: `Thread "${clientThreadId}" already exists. Use POST /ai/resume to continue.` }
                return
            }
        } catch {
            // getTuple 异常时不阻塞新请求（降级为跳过冲突检测）
        }
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
    // 禁用 Nagle 算法，让每次 write() 立即发送独立 TCP 包，实现逐字流式输出
    res.socket?.setNoDelay(true)

    // 启动 SSE 心跳
    const stopHeartbeat = startSSEHeartbeat(res)

    // 创建请求级 logger
    const reqLogger = createRequestLogger(threadId)
    reqLogger.info('Agent run started', { appId, threadId, hasMemoryHint: !!memoryHint, hasAgentMemory: !!agentMemory })

    try {
        // 初始化 LLM 客户端（chat 和 task 共用）
        const client = await createLLMClient()
        const llmRouter = client as LLMRouter

        // 构建初始 messages（历史对话 + 当前 prompt）
        const initialMessages: import('@langchain/core/messages').BaseMessage[] = []

        // 注入历史消息
        if (Array.isArray(previousMessages) && previousMessages.length > 0) {
            for (const m of previousMessages) {
                if (m.role === 'user') {
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                    initialMessages.push(new HumanMessage(content))
                } else if (m.role === 'assistant') {
                    const { AIMessage } = await import('@langchain/core/messages')
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                    initialMessages.push(new AIMessage(content))
                }
            }
        }

        // 添加当前用户 prompt（如果有图片，构建多模态消息）
        if (Array.isArray(images) && images.length > 0) {
            // 多模态消息：文本 + 图片 URL
            const multimodalContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
                { type: 'text', text: prompt },
                ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
            ]
            initialMessages.push(new HumanMessage({ content: multimodalContent }))
        } else {
            initialMessages.push(new HumanMessage(prompt))
        }

        // ─── 根据 mode 路由到不同的 Graph ─────────────────────────────────────
        if (mode === 'chat') {
            // ═══ Chat 模式：轻量聊天管线（无工具、无知识检索）═══
            const adapter = createMemoryAdapter([])
            const streamCallback = createSSEStreamCallback(res, adapter, threadId)

            const chatGraph = createChatGraph({
                llmClient: client,
                streamCallback,
                chatModel: getActiveModel(llmRouter),
            })

            recordThreadActivity(threadId, 'running')
            const result = await chatGraph.invoke({
                messages: initialMessages,
                agentMemory: agentMemory ?? '',
                contextSummary: memoryHint ?? '',
                finalText: '',
                roundSummary: '',
            })

            // Chat 模式不支持 interrupt，直接发送 done
            sseWrite(res, 'done', { pages: [], threadId, roundSummary: result.roundSummary ?? '' })
            recordThreadActivity(threadId, 'completed')
        } else {
            // ═══ Task 模式：完整 MasterGraph V2 管线 ═══

            // 1. 通过 BanyanClient 按需拉取 pages（Pull-based 架构）
            const pages = await banyanClient.getPages(appId)
            const adapter = createMemoryAdapter(pages)
            const registry = createBanvasToolRegistry(adapter)
            registerKnowledgeSearchTool(registry, knowledgeStore)

            // 1b. 注册数据拉取工具（AI 可按需获取 pages/schema/cloudFunctions）
            registerDataFetchTools(registry, banyanClient, appId)

            // 1c. 注册 Schema 工具（读取通过 BanyanClient 拉取，写入通过 SSE 推送）
            const initialSchema = await banyanClient.getSchema(appId)
            const currentSchema: AppSchemaSnapshot = {
                collections: initialSchema as unknown as SchemaCollectionDef[],
            }
            registerSchemaTools(registry, {
                schemaReader: () => currentSchema,
                schemaWriter: (collections: SchemaCollectionDef[]) => {
                    currentSchema.collections = collections
                    sseWrite(res, 'schema_update', { collections })
                },
            })

            // 2. 构建 StreamCallback，桥接 Agent 事件 → SSE
            const streamCallback = createSSEStreamCallback(res, adapter, threadId)

            // 3. 构建上下文分层
            const systemPrompt = buildSystemPrompt({ aiSchemaDoc })

            // 4. 创建 MasterGraph V2 统一管线（带 checkpointer 持久化）
            const checkpointer = getCheckpointer()
            const masterGraph = createMasterGraph({
                llmClient: client,
                toolRegistry: registry,
                streamCallback,
                autoRun: !requireApproval,
                checkpointer,
            })

            // 5. 执行 MasterGraph V2（带 thread_id 用于 checkpoint 持久化）
            recordThreadActivity(threadId, 'running')
            const result = await masterGraph.invoke({
                messages: initialMessages,
                systemPrompt,
                agentMemory: agentMemory ?? '',
                contextSummary: memoryHint ?? '',
                maxIterations: 30,
                finalText: '',
                projectSpec: null,
                conflictPending: null,
                planOutput: null,
                planIterations: 0,
                humanApproved: true,
                subResults: [],
                assemblyPlan: null,
                auditResult: null,
                auditRetries: 0,
                auditErrorSummary: '',
                planPhaseSummary: '',
                executePhaseSummary: '',
                roundSummary: '',
            }, {
                recursionLimit: 100,
                configurable: { thread_id: threadId },
            })

            // 6. 检查执行是否因 interrupt() 暂停（humanGate 等节点）
            const graphState = await masterGraph.getState({ configurable: { thread_id: threadId } })
            const next = graphState?.next ?? []
            const tasks = (graphState as { tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }> })?.tasks ?? []
            const interruptedTask = tasks.find((t) =>
                Array.isArray(t.interrupts) && t.interrupts.length > 0
            )

            if (interruptedTask && next.length > 0) {
                // 图被中断：发送 interrupt 事件，通知客户端需要人工介入
                const interruptValue = interruptedTask.interrupts![0]?.value ?? null
                sseWrite(res, 'checkpoint', { threadId, node: next[0], step: 'interrupted' })
                sseWrite(res, 'interrupt', {
                    threadId,
                    node: next[0],
                    value: interruptValue,
                })
                recordThreadActivity(threadId, 'interrupted')
            } else {
                // 图正常完成：发送 done 事件
                sseWrite(res, 'checkpoint', { threadId, node: 'END', step: 'completed' })
                const finalPages = await adapter.getPages()
                sseWrite(res, 'done', { pages: finalPages, threadId })
                recordThreadActivity(threadId, 'completed')
            }
        }
    } catch (err) {
        if (err instanceof ServiceUnavailableError) {
            reqLogger.error('Service unavailable during agent run', err, { service: err.service, appId })
            sseWrite(res, 'error', { message: `Service unavailable: ${err.message}`, code: 'SERVICE_UNAVAILABLE', service: err.service })
        } else {
            const message = err instanceof Error ? err.message : String(err)
            reqLogger.error('Agent run failed', err)
            sseWrite(res, 'error', { message })
        }
    } finally {
        stopHeartbeat()
        // 清理该 thread 的 disambiguation pending（防止内存泄漏）
        disambiguationPendingMap.delete(threadId)
        sseDone(res)
    }
})

// ─── POST /ai/resume ──────────────────────────────────────────────────────────
//
// 从 LangGraph Checkpointer 恢复执行（支持 interrupt/resume 模式）

router.post('/resume', async (ctx) => {
    const { threadId, resumeValue, pages } = ctx.request.body as {
        threadId?: string
        resumeValue?: unknown
        pages?: string[]
    }

    if (!threadId || typeof threadId !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'threadId (string) is required' }
        return
    }

    // 获取 checkpointer 并验证 thread 存在
    const checkpointer = getCheckpointer()

    // 构建 graph 来获取状态和恢复执行
    // pages 由 banyan 后端从 MongoDB 读取后传入，确保 adapter 以最新状态恢复
    const client = await createLLMClient()
    const adapter = createMemoryAdapter(pages ?? [])
    const registry = createBanvasToolRegistry(adapter)
    registerKnowledgeSearchTool(registry, knowledgeStore)

    const res = ctx.res as ServerResponse
    const streamCallback = createSSEStreamCallback(res, adapter, threadId)
    const masterGraph = createMasterGraph({
        llmClient: client,
        toolRegistry: registry,
        streamCallback,
        checkpointer,
    })

    // 检查 thread 是否有 checkpoint
    const state = await masterGraph.getState({ configurable: { thread_id: threadId } })
    if (!state || !state.values) {
        ctx.status = 404
        ctx.body = { success: false, error: `Thread "${threadId}" not found or has no checkpoint` }
        return
    }

    // 切换为 SSE 模式
    ctx.respond = false
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    })
    // 禁用 Nagle 算法，让每次 write() 立即发送独立 TCP 包，实现逐字流式输出
    res.socket?.setNoDelay(true)

    // 启动 SSE 心跳
    const stopHeartbeat = startSSEHeartbeat(res)

    try {
        // 发送 resumed 事件
        const fromNode = Array.isArray(state.next) && state.next.length > 0 ? state.next[0] : 'unknown'
        const step = (state.metadata as Record<string, unknown> | undefined)?.step ?? 0
        sseWrite(res, 'resumed', { fromNode, step })
        recordThreadActivity(threadId, 'running')

        // 恢复执行：如果有 resumeValue 则使用 Command({ resume })，否则传 null
        const resumeInput = resumeValue !== undefined
            ? new Command({ resume: resumeValue })
            : null

        // 使用 stream 模式恢复执行以获取中间事件
        const stream = await masterGraph.stream(resumeInput, {
            configurable: { thread_id: threadId },
            streamMode: 'values',
        })

        for await (const _chunk of stream) {
            // StreamCallback 已通过 createSSEStreamCallback 处理事件推送
            // 这里只需消费 stream 驱动执行
        }

        // 检查恢复执行后是否再次被 interrupt（例如多步 humanGate）
        const postState = await masterGraph.getState({ configurable: { thread_id: threadId } })
        const postNext = postState?.next ?? []
        const postTasks = (postState as { tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }> })?.tasks ?? []
        const reInterrupted = postTasks.find((t) =>
            Array.isArray(t.interrupts) && t.interrupts.length > 0
        )

        if (reInterrupted && postNext.length > 0) {
            // 再次中断：发送 interrupt 事件
            const interruptValue = reInterrupted.interrupts![0]?.value ?? null
            sseWrite(res, 'checkpoint', { threadId, node: postNext[0], step: 'interrupted' })
            sseWrite(res, 'interrupt', {
                threadId,
                node: postNext[0],
                value: interruptValue,
            })
            recordThreadActivity(threadId, 'interrupted')
        } else {
            // 正常完成
            sseWrite(res, 'checkpoint', { threadId, node: 'END', step: 'completed' })
            const finalPages = await adapter.getPages()
            sseWrite(res, 'done', { pages: finalPages, threadId })
            recordThreadActivity(threadId, 'completed')
        }
    } catch (err) {
        const resumeLogger = createRequestLogger(threadId)
        if (err instanceof ServiceUnavailableError) {
            resumeLogger.error('Service unavailable during resume', err, { service: err.service })
            sseWrite(res, 'error', { message: `Service unavailable: ${err.message}`, code: 'SERVICE_UNAVAILABLE', service: err.service })
        } else {
            const message = err instanceof Error ? err.message : String(err)
            resumeLogger.error('Resume failed', err)
            sseWrite(res, 'error', { message })
        }
    } finally {
        stopHeartbeat()
        // 清理该 thread 的 disambiguation pending（防止内存泄漏）
        disambiguationPendingMap.delete(threadId)
        sseDone(res)
    }
})

// ─── GET /ai/thread/:threadId/status ──────────────────────────────────────────
//
// 查询 thread 的当前执行状态

router.get('/thread/:threadId/status', async (ctx) => {
    const { threadId } = ctx.params

    try {
        const checkpointer = getCheckpointer()
        const client = await createLLMClient()
        const adapter = createMemoryAdapter([])
        const registry = createBanvasToolRegistry(adapter)

        const masterGraph = createMasterGraph({
            llmClient: client,
            toolRegistry: registry,
            checkpointer,
        })

        const state = await masterGraph.getState({ configurable: { thread_id: threadId } })

        if (!state || !state.values) {
            ctx.body = { threadId, status: 'not_found' }
            return
        }

        const next = state.next ?? []

        if (next.length === 0) {
            // 图已执行完毕
            ctx.body = {
                threadId,
                status: 'completed',
                lastCheckpointAt: (state.metadata as Record<string, unknown> | undefined)?.created_at ?? null,
            }
            return
        }

        // 检查是否有 pending interrupts
        const tasks = (state as { tasks?: Array<{ interrupts?: Array<{ value?: unknown }> }> }).tasks ?? []
        const interruptedTask = tasks.find((t) =>
            Array.isArray(t.interrupts) && t.interrupts.length > 0
        )

        if (interruptedTask) {
            ctx.body = {
                threadId,
                status: 'interrupted',
                currentNode: next[0],
                interrupt: {
                    node: next[0],
                    value: interruptedTask.interrupts![0]?.value ?? null,
                },
                lastCheckpointAt: (state.metadata as Record<string, unknown> | undefined)?.created_at ?? null,
            }
            return
        }

        // 仍在运行中（有 next 节点但无 interrupt）
        ctx.body = {
            threadId,
            status: 'running',
            currentNode: next[0],
            lastCheckpointAt: (state.metadata as Record<string, unknown> | undefined)?.created_at ?? null,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.status = 500
        ctx.body = { success: false, error: message }
    }
})

// ─── DELETE /ai/thread/:threadId ──────────────────────────────────────────────
//
// 删除 thread 的 checkpoint 数据

router.delete('/thread/:threadId', async (ctx) => {
    const { threadId: _threadId } = ctx.params

    try {
        // SqliteSaver 当前不提供 delete thread API。
        // 过期 thread 由 startCheckpointCleanup() 定时清理。
        // 未来 LangGraph SDK 提供 delete API 后替换。
        // 目前返回 204 表示接受请求（幂等操作）
        ctx.status = 204
        ctx.body = null
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        ctx.status = 500
        ctx.body = { success: false, error: message }
    }
})

// ─── POST /ai/disambiguation-response ─────────────────────────────────────────
//
// 前端用户选择消歧方案后调用，resolve 挂起的 Agent 消歧 Promise
//
// 请求体：{ threadId: string, choiceId: string }
// 响应：{ success: boolean, error?: string }

router.post('/disambiguation-response', async (ctx) => {
    const { threadId, choiceId } = ctx.request.body as { threadId?: string; choiceId?: string }

    if (!threadId || typeof threadId !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'threadId (string) is required' }
        return
    }

    if (!choiceId || typeof choiceId !== 'string') {
        ctx.status = 400
        ctx.body = { success: false, error: 'choiceId (string) is required' }
        return
    }

    const resolve = disambiguationPendingMap.get(threadId)
    if (!resolve) {
        ctx.status = 404
        ctx.body = { success: false, error: `No pending disambiguation for thread "${threadId}"` }
        return
    }

    // resolve 挂起的 Promise，恢复 Agent 执行，并从 map 中移除
    resolve(choiceId)
    disambiguationPendingMap.delete(threadId)
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
//     { "provider": "kimi",     "model": "kimi-k2.6", "availableModels": [...], "active": false }
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
