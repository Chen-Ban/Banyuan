/**
 * Requirements SubAgent 节点
 *
 * ADR-041: 产品经理角色，从用户诉求中提取结构化需求。
 *
 * 模式：规划型（单次 LLM 调用 → 结构化输出）
 * 输入：userMessage + agentMemory + auditFeedback（如有）
 * 输出：StructuredRequirements（features + constraints + outOfScope）
 * 上游依赖：无
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'
import { StructuredRequirementsSchema } from '../schemas.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'
import { ContextProvider, REQUIREMENTS_DECLARATION } from '../context/index.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RequirementsNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createRequirementsNode(config: RequirementsNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'requirements', 'planning', '正在解析需求...')

    // ─── 使用 ContextProvider 按需拉取上下文 ────────────────────────────────
    const ctx = ContextProvider.resolve(REQUIREMENTS_DECLARATION, state)

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户需求:\n${ctx.userMessage}`)

    // inherit 模式：注入旧 requirements 让 LLM 做增量修改
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.requirements) {
      parts.push(
        `\n已有需求（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.requirements, null, 2)}`,
      )
    }

    if (intent?.correctionHint) {
      parts.push(`\n修正要求:\n${intent.correctionHint}`)
    }

    const userPrompt = parts.join('\n')

    // ─── LLM 调用 ─────────────────────────────────────────────────────────
    try {
      const { text: rawText } = await callSubAgentLLM({
        llm,
        systemPrompt: ctx.systemPrompt,
        userPrompt,
      })

      // ─── Zod 校验 + retry ────────────────────────────────────────────────
      const result = await parseWithRetry({
        rawText,
        schema: StructuredRequirementsSchema,
        llm,
        systemPrompt: ctx.systemPrompt,
        userPrompt,
      })

      if (!result.success) {
        emitProgress(sseCallback, 'requirements', 'failed', `需求解析失败: ${result.error}`)
        return {
          phase: 'requirements' as DialoguePhase,
          executions: [buildExecution('requirements', startedAt, 'failed', result.error)],
        }
      }

      emitProgress(sseCallback, 'requirements', 'completed', '需求解析完成')

      return {
        phase: 'ui_design' as DialoguePhase,
        artifacts: { ...state.artifacts, requirements: result.data },
        executions: [buildExecution('requirements', startedAt, 'completed')],
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      emitProgress(sseCallback, 'requirements', 'failed', `LLM 调用失败: ${error}`)
      return {
        phase: 'requirements' as DialoguePhase,
        executions: [buildExecution('requirements', startedAt, 'failed', error)],
      }
    }
  }
}
