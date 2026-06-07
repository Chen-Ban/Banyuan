/**
 * SubAgent 节点共享基础设施
 *
 * ADR-041: 规划型 SubAgent 的通用 LLM 调用、Zod 校验、执行记录工具。
 */
import type { z } from 'zod'
import type { LLMClient } from '../../core/index.js'
import type { SubAgentName } from '../protocol.js'
import type { NodeExecution } from '../artifacts.js'
import type { OrchestratorSSECallback } from '../events.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SubAgentLLMCallConfig {
  llm: LLMClient
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTokens?: number
  temperature?: number
}

/**
 * 调用 LLM 并提取文本响应
 */
export async function callSubAgentLLM(config: SubAgentLLMCallConfig): Promise<string> {
  const response = await config.llm.createMessage({
    model: config.model ?? 'deepseek-chat',
    max_tokens: config.maxTokens ?? 4096,
    system: config.systemPrompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: config.userPrompt }] }],
    temperature: config.temperature ?? 0,
  })

  const textBlock = response.content.find(c => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('LLM 未返回文本内容')
  }
  return textBlock.text
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Zod 校验 + 自动重试
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParseWithRetryConfig<T> {
  rawText: string
  schema: z.ZodType<T>
  llm: LLMClient
  systemPrompt: string
  userPrompt: string
  model?: string
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * 从 LLM 原始文本中提取 JSON 并通过 Zod 校验。
 * 校验失败时自动 retry 一次（注入错误信息让 LLM 修正）。
 */
export async function parseWithRetry<T>(config: ParseWithRetryConfig<T>): Promise<ParseResult<T>> {
  // 第一次尝试解析
  const firstAttempt = tryParseJson(config.rawText, config.schema)
  if (firstAttempt.success) return firstAttempt

  // 校验失败 → retry：用错误信息提示 LLM 修正
  const retryPrompt = `${config.userPrompt}

---
你上一次的输出校验失败，请修正后重新输出完整 JSON。

错误信息：
${firstAttempt.error}

注意：只返回合法 JSON，不要 markdown 代码块之外的内容。`

  try {
    const retryText = await callSubAgentLLM({
      llm: config.llm,
      systemPrompt: config.systemPrompt,
      userPrompt: retryPrompt,
      model: config.model,
    })
    return tryParseJson(retryText, config.schema)
  } catch {
    return { success: false, error: `Retry LLM 调用失败: ${firstAttempt.error}` }
  }
}

/**
 * 从文本中提取 JSON 并做 Zod 校验
 */
function tryParseJson<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  let jsonStr = text.trim()

  // 尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // 尝试从文本中找到第一个 { 或 [ 开头的 JSON 结构
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const jsonStart = jsonStr.search(/[\[{]/)
    if (jsonStart >= 0) {
      jsonStr = jsonStr.slice(jsonStart)
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  const result = schema.safeParse(parsed)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const formattedErrors = result.error.issues
    .map(issue => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  return { success: false, error: `Zod 校验失败:\n${formattedErrors}` }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NodeExecution 记录
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildExecution(
  node: SubAgentName,
  startedAt: number,
  status: 'completed' | 'failed',
  error?: string,
): NodeExecution {
  return {
    node,
    startedAt,
    completedAt: Date.now(),
    status,
    error,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSE 事件辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function emitProgress(
  sseCallback: OrchestratorSSECallback | undefined,
  agent: SubAgentName,
  status: 'planning' | 'executing' | 'completed' | 'failed',
  message: string,
): void {
  sseCallback?.({
    type: 'agent_progress',
    agent,
    status,
    message,
    timestamp: Date.now(),
  })
}
