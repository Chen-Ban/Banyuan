/**
 * Worker SubGraph 工厂
 *
 * ADR-041: 执行型 SubAgent 内部的 Agentic Loop 实现为 LangGraph SubGraph。
 *
 * 拓扑：think ←→ tools（条件循环）
 *   - think 节点：调用 LLM（带 tool definitions），判断是否需要工具调用
 *   - tools 节点：执行 LLM 返回的 tool_calls，结果回填到 messages
 *   - 条件边：stop_reason === 'tool_use' → tools → think；否则 → END
 *
 * SubGraph 是无状态的（每次调用创建新实例），由外部（frontendNode/backendNode）
 * 传入初始 messages、system prompt、ToolRegistry，收集最终产出。
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph'
import type { LLMClient, LLMResponse } from '../../core/llmTypes.js'
import type { Message, MessageContent } from '../../core/types.js'
import type { ToolRegistry } from '../../core/ToolRegistry.js'
import type { OrchestratorSSECallback } from '../events.js'
import type { SubAgentName } from '../protocol.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WorkerState Annotation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const WorkerStateAnnotation = Annotation.Root({
  /** XiangDi Message[]（think↔tools 循环中的完整对话） */
  messages: Annotation<Message[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  /** LLM 最后一次响应（用于条件路由判断） */
  lastResponse: Annotation<LLMResponse | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** 当前迭代次数 */
  iteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  /** 工具调用总计 */
  totalToolCalls: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),
})

export type WorkerState = typeof WorkerStateAnnotation.State

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WorkerGraph 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface WorkerGraphConfig {
  /** LLM 客户端 */
  llm: LLMClient
  /** 该 Worker 的 ToolRegistry */
  toolRegistry: ToolRegistry
  /** System prompt（含 L1 + 注入的上游产物） */
  systemPrompt: string
  /** Worker 名称（用于 SSE） */
  agentName: SubAgentName
  /** SSE 回调 */
  sseCallback?: OrchestratorSSECallback
  /** 最大循环次数（默认 15） */
  maxIterations?: number
  /** LLM 模型标识 */
  model?: string
  /** LLM 最大输出 tokens */
  maxTokens?: number
  /** LLM 温度 */
  temperature?: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Worker SubGraph 工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 Worker SubGraph 的编译产物
 *
 * 调用方式：
 *   const workerGraph = createWorkerGraph(config)
 *   const result = await workerGraph.invoke({ messages: [initialUserMessage] })
 *   // result.messages 包含完整的 think↔tools 对话历史
 */
export function createWorkerGraph(config: WorkerGraphConfig) {
  const {
    llm,
    toolRegistry,
    systemPrompt,
    agentName,
    sseCallback,
    maxIterations = 15,
    model = 'deepseek-chat',
    maxTokens = 8192,
    temperature = 0.3,
  } = config

  // ─── Think 节点 ──────────────────────────────────────────────────────────

  async function thinkNode(state: WorkerState): Promise<Partial<WorkerState>> {
    const newIteration = state.iteration + 1

    // 达到循环上限时强制结束（不带 tools 调用）
    if (newIteration > maxIterations) {
      return {
        lastResponse: { stop_reason: 'end_turn', content: [{ type: 'text', text: `[Worker ${agentName}] 达到最大迭代次数 ${maxIterations}，强制结束。` }] },
        iteration: newIteration,
      }
    }

    // 调用 LLM（流式，每个 token 通过 SSE 推送）
    const toolDefs = toolRegistry.getDefinitions()
    let streamedText = ''

    const response = await llm.createMessageStream(
      {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: state.messages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        temperature,
      },
      (token) => {
        streamedText += token
        sseCallback?.({
          type: 'text_delta',
          delta: token,
          timestamp: Date.now(),
        })
      },
    )

    // 构建 assistant message
    const assistantContent: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    > = []

    for (const block of response.content) {
      if (block.type === 'text') {
        // 如果流式已经推送了 text，用 streamedText（更完整）
        assistantContent.push({ type: 'text', text: streamedText || block.text })
      } else if (block.type === 'tool_use') {
        assistantContent.push(block)
      }
    }

    // 纯流式场景：response.content 可能只有空 text，补上
    if (assistantContent.length === 0 && streamedText) {
      assistantContent.push({ type: 'text', text: streamedText })
    }

    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantContent as unknown as MessageContent,
    }

    return {
      messages: [assistantMessage],
      lastResponse: response,
      iteration: newIteration,
    }
  }

  // ─── Tools 节点 ─────────────────────────────────────────────────────────

  async function toolsNode(state: WorkerState): Promise<Partial<WorkerState>> {
    const response = state.lastResponse
    if (!response) return {}

    // 提取 tool_use blocks
    const toolCalls = response.content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    )

    if (toolCalls.length === 0) return {}

    const toolResultMessages: Message[] = []

    for (const tc of toolCalls) {
      // SSE：工具调用开始
      sseCallback?.({
        type: 'agent_progress',
        agent: agentName,
        status: 'executing',
        message: `调用工具 ${tc.name}...`,
        timestamp: Date.now(),
      })

      const { result, is_error } = await toolRegistry.execute(tc.name, tc.input)
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result)

      // 构造 tool_result message（Anthropic 格式：role=user, content=[{type:tool_result}]）
      toolResultMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: tc.id,
          content: resultStr,
          is_error,
        }] as unknown as MessageContent,
      })
    }

    return {
      messages: toolResultMessages,
      totalToolCalls: toolCalls.length,
    }
  }

  // ─── 条件路由 ──────────────────────────────────────────────────────────────

  function shouldContinue(state: WorkerState): string {
    const response = state.lastResponse
    if (!response) return '__end__'
    if (response.stop_reason === 'tool_use') return 'tools'
    return '__end__'
  }

  // ─── 构建图 ────────────────────────────────────────────────────────────────

  const graph = new StateGraph(WorkerStateAnnotation)
    .addNode('think', thinkNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'think')
    .addConditionalEdges('think', shouldContinue, {
      tools: 'tools',
      __end__: END,
    })
    .addEdge('tools', 'think')

  return graph.compile()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WorkerGraph 执行结果提取辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 从 Worker 完成后的最终 assistant message 中提取文本内容
 */
export function extractFinalText(messages: Message[]): string {
  // 从后往前找最后一条 assistant 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    if (typeof msg.content === 'string') return msg.content

    if (Array.isArray(msg.content)) {
      const textBlocks = msg.content.filter(
        (b): b is { type: 'text'; text: string } =>
          typeof b === 'object' && b !== null && 'type' in b && b.type === 'text',
      )
      if (textBlocks.length > 0) {
        return textBlocks.map(b => b.text).join('\n')
      }
    }
  }
  return ''
}
