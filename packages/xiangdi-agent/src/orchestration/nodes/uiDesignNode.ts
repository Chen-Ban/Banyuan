/**
 * UI Design SubAgent 节点
 *
 * ADR-041: 视觉设计师角色，根据需求规划页面结构、组件组合、导航关系。
 *
 * 模式：规划型（单次 LLM 调用 → 结构化输出）
 * 输入：userMessage + artifacts.requirements
 * 输出：UIDesignSpec（pages + navigation + designTokens）
 * 上游依赖：requirements
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'
import { UIDesignSpecSchema } from '../schemas.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'
import { ContextProvider, UI_DESIGN_DECLARATION } from '../context/index.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UIDesignNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createUIDesignNode(config: UIDesignNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'uiDesign', 'planning', '正在规划 UI 结构...')

    // ─── 使用 ContextProvider 按需拉取上下文 ────────────────────────────────
    const ctx = ContextProvider.resolve(UI_DESIGN_DECLARATION, state)

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户原始需求:\n${ctx.userMessage}`)

    // inherit 模式：注入旧 uiDesign
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.uiDesign) {
      parts.push(
        `\n已有 UI 设计（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.uiDesign, null, 2)}`,
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

      const result = await parseWithRetry({
        rawText,
        schema: UIDesignSpecSchema,
        llm,
        systemPrompt: ctx.systemPrompt,
        userPrompt,
      })

      if (!result.success) {
        emitProgress(sseCallback, 'uiDesign', 'failed', `UI 设计失败: ${result.error}`)
        return {
          phase: 'ui_design' as DialoguePhase,
          executions: [buildExecution('uiDesign', startedAt, 'failed', result.error)],
        }
      }

      emitProgress(sseCallback, 'uiDesign', 'completed', 'UI 结构设计完成')

      return {
        phase: 'contract' as DialoguePhase,
        artifacts: { ...state.artifacts, uiDesign: result.data },
        executions: [buildExecution('uiDesign', startedAt, 'completed')],
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      emitProgress(sseCallback, 'uiDesign', 'failed', `LLM 调用失败: ${error}`)
      return {
        phase: 'ui_design' as DialoguePhase,
        executions: [buildExecution('uiDesign', startedAt, 'failed', error)],
      }
    }
  }
}
