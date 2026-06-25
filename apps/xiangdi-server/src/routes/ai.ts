/**
 * AI Agent 路由（ADR-041 Orchestrator 架构）
 *
 * POST /ai/run
 *   Body: { appId, prompt, mode?, threadId?, previousMessages?, agentMemory?, memoryHint?, images? }
 *   Response: text/event-stream（SSE）
 *
 *   Orchestrator Graph 单次执行完整管线：
 *     intent → requirements → ui_design → contract → parallel_build(frontend+backend) → audit → commit → summarize
 *   内部 rollback 对用户透明，不暴露 interrupt/resume。
 *
 * SSE 事件类型（ADR-041 discriminated union）：
 *   phase_change    — Phase 转移 { from, to, timestamp }
 *   agent_progress  — SubAgent 运行进度 { agent, status, message, timestamp }
 *   tool_activity   — 工具调用通知 { agent, tool, status, inputSummary?, outputSummary?, error?, timestamp }
 *   audit_progress  — 审计进度（building 内部）{ status, message?, timestamp }
 *   text_delta      — 文本流式输出 { delta, timestamp }
 *   done            — 完成 { finalPhase, summary, artifacts?, timestamp }
 *
 * GET /ai/models
 *   Response: { providers, activeProvider }
 *
 * POST /ai/models/switch
 *   Body: { provider }
 *   Response: { success, activeProvider? }
 */

import type { ServerResponse } from 'http'
import crypto from 'node:crypto'
import Router from '@koa/router'
import { createOrchestratorGraph, buildSystemPrompt } from '@banyuan/xiangdi-agent'
import type { OrchestratorSSEEvent, OrchestratorMode } from '@banyuan/xiangdi-agent'
import { RemoteKnowledgeStore } from '../knowledge/RemoteKnowledgeStore.js'
import { BanyanClient, RemoteMaterialStore } from '../banyan/index.js'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { createLLMClient, getModelsInfo, switchProvider, PROVIDER_CATALOG } from '../llm/createLLMClient.js'
import { ServiceUnavailableError } from '../errors.js'
import { createRequestLogger } from '../logger.js'
import { buildFrontendToolHandlers, buildBackendToolHandlers } from './orchestrateHandlers.js'
import type { AppRuntimeState } from './orchestrateHandlers.js'
import { getStore } from '../checkpoint/index.js'

const router = new Router({ prefix: '/ai' })

// ─── SSE 工具函数 ─────────────────────────────────────────────────────────────

const SSE_HEARTBEAT_INTERVAL = 15_000 // 15 秒心跳间隔

function sseWrite(res: ServerResponse, event: string, data: unknown): void {
  if (res.writableEnded) return
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${event}\ndata: ${payload}\n\n`)
  // 强制立即冲刷 TCP 缓冲区
  const socket = (res as unknown as { socket?: { cork?: () => void; uncork?: () => void } }).socket
  if (socket?.cork && socket?.uncork) {
    socket.cork()
    process.nextTick(() => socket.uncork!())
  }
}

function sseDone(res: ServerResponse): void {
  if (!res.writableEnded) res.end()
}

function startSSEHeartbeat(res: ServerResponse): () => void {
  const timer = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(timer)
      return
    }
    res.write(':ping\n\n')
  }, SSE_HEARTBEAT_INTERVAL)
  timer.unref()

  const cleanup = () => {
    clearInterval(timer)
  }
  res.on('close', cleanup)
  return cleanup
}

// ─── 共享实例 ─────────────────────────────────────────────────────────────────

const knowledgeStore = new RemoteKnowledgeStore()
const banyanClient = new BanyanClient()

// ─── SSE Bridge: OrchestratorSSECallback → HTTP SSE ──────────────────────────

function createOrchestratorSSEBridge(res: ServerResponse): (event: OrchestratorSSEEvent) => void {
  return (event: OrchestratorSSEEvent) => {
    sseWrite(res, event.type, event)
  }
}

// ─── POST /ai/run ─────────────────────────────────────────────────────────────

router.post('/run', async (ctx) => {
  const {
    appId,
    prompt,
    mode,
    threadId: clientThreadId,
    previousMessages,
    agentMemory,
    memoryHint,
    images,
  } = ctx.request.body as {
    appId?: string
    prompt?: string
    mode?: OrchestratorMode
    threadId?: string
    previousMessages?: Array<{ role: 'user' | 'assistant'; content: unknown }>
    agentMemory?: string
    memoryHint?: string
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

  const threadId = clientThreadId ?? crypto.randomUUID()
  const reqLogger = createRequestLogger(threadId)
  reqLogger.info('Orchestrator run started', { appId, threadId, mode: mode ?? 'task' })

  // 切换为 SSE 模式
  const res = ctx.res as ServerResponse
  ctx.respond = false
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.socket?.setNoDelay(true)

  const stopHeartbeat = startSSEHeartbeat(res)

  // AbortController 用于监听客户端断开
  const abortController = new AbortController()
  const onClientAbort = () => abortController.abort()
  res.on('close', onClientAbort)

  // 发送 started 事件
  sseWrite(res, 'started', { threadId })

  try {
    // 1. 初始化 LLM
    const llm = await createLLMClient()

    // 2. 拉取应用数据
    const [uiJSON, schema, cloudFunctions] = await Promise.all([
      banyanClient.getUIDefinition(appId),
      banyanClient.getSchema(appId),
      banyanClient.getCloudFunctions(appId),
    ])

    // 获取 BanvasGL 版本
    let version = '1.0.0'
    if (uiJSON) {
      try {
        const parsed = JSON.parse(uiJSON)
        if (parsed.version) version = parsed.version
      } catch {
        /* 使用默认版本 */
      }
    }

    // 3. 构建运行时状态（整个请求生命周期内可变）
    const runtimeState: AppRuntimeState = { uiJSON, schema, cloudFunctions, version }

    // 4. 构建工具处理器
    const materialStore = new RemoteMaterialStore(banyanClient)
    const frontendToolHandlers = buildFrontendToolHandlers({
      state: runtimeState,
      knowledgeStore,
      materialStore,
    })
    const backendToolHandlers = buildBackendToolHandlers({
      state: runtimeState,
      knowledgeStore,
      sseWriter: (event, data) => sseWrite(res, event, data),
    })

    // 5. 构建 messages
    const initialMessages: BaseMessage[] = []
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

    // 当前用户 prompt（支持多模态）
    if (Array.isArray(images) && images.length > 0) {
      const multimodalContent: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [
        { type: 'text', text: prompt },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ]
      initialMessages.push(new HumanMessage({ content: multimodalContent }))
    } else {
      initialMessages.push(new HumanMessage(prompt))
    }

    // 6. 创建 Orchestrator Graph。
    //    注入 checkpointer 启用断点持久化：同一 threadId 的多次请求会恢复
    //    上次 state.artifacts，intent 节点据此判断从哪个阶段续跑/回退。
    const checkpointStore = getStore()
    const sseCallback = createOrchestratorSSEBridge(res)
    const graph = createOrchestratorGraph({
      llm,
      sseCallback,
      banvasVersion: version,
      frontendToolHandlers,
      backendToolHandlers,
      checkpointer: checkpointStore.getCheckpointer(),
    })

    // 7. 执行 Orchestrator Graph
    //    configurable.thread_id 是 Checkpoint 的恢复键，LangGraph 据此加载/保存 state。
    checkpointStore.recordActivity(threadId, 'running')
    const systemPrompt = buildSystemPrompt()
    await graph.invoke(
      {
        mode: (mode ?? 'task') as OrchestratorMode,
        userMessage: prompt,
        messages: initialMessages,
        systemPrompt,
        agentMemory: agentMemory ?? '',
        contextSummary: memoryHint ?? '',
      },
      {
        recursionLimit: 100,
        signal: abortController.signal,
        configurable: { thread_id: threadId },
      },
    )
    checkpointStore.recordActivity(threadId, 'completed')

    // 8. done 事件已由 summarizeNode 通过 sseCallback 推送
    //    额外推送最终 UI 定义 JSON（banyan 后端需要写回 MongoDB）
    sseWrite(res, 'app_state', {
      uiJSON: runtimeState.uiJSON,
      schema: runtimeState.schema,
      cloudFunctions: runtimeState.cloudFunctions,
    })
  } catch (err) {
    // 异常/中断：标记 thread 为 interrupted，交由 TTL 清理策略按 interruptedTTL 处理。
    try {
      getStore().recordActivity(threadId, 'interrupted')
    } catch {
      /* 不阻塞错误处理 */
    }
    if (abortController.signal.aborted) {
      // 客户端主动断开，静默处理
      reqLogger.info('Client disconnected, aborting')
    } else if (err instanceof ServiceUnavailableError) {
      reqLogger.error('Service unavailable during orchestrator run', err, { service: err.service, appId })
      sseWrite(res, 'error', {
        message: `Service unavailable: ${err.message}`,
        code: 'SERVICE_UNAVAILABLE',
        service: err.service,
      })
    } else {
      const message = err instanceof Error ? err.message : String(err)
      reqLogger.error('Orchestrator run failed', err)
      sseWrite(res, 'error', { message })
    }
  } finally {
    res.removeListener('close', onClientAbort)
    stopHeartbeat()
    sseDone(res)
  }
})

// ─── GET /ai/models ───────────────────────────────────────────────────────────

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
