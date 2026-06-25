/**
 * Contract SubAgent 节点
 *
 * ADR-041: 全栈架构师角色，定义前后端契约（数据表 + 云函数签名 + 事件绑定映射）。
 *
 * 模式：规划型（单次 LLM 调用 → 结构化输出）
 * 输入：userMessage + artifacts.requirements + artifacts.uiDesign
 * 输出：IntegrationContract（collections + cloudFunctions + bindings）
 * 上游依赖：requirements, uiDesign
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'
import { IntegrationContractSchema } from '../schemas.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'
import { ContextProvider, CONTRACT_DECLARATION } from '../context/index.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ContractNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createContractNode(config: ContractNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'contract', 'planning', '正在定义前后端契约...')

    // ─── 使用 ContextProvider 按需拉取上下文 ────────────────────────────────
    const ctx = ContextProvider.resolve(CONTRACT_DECLARATION, state)

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户原始需求:\n${ctx.userMessage}`)

    // inherit 模式：注入旧 contract
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.contract) {
      parts.push(`\n已有契约（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.contract, null, 2)}`)
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
        maxTokens: 8192, // 契约内容可能较长
      })

      const result = await parseWithRetry({
        rawText,
        schema: IntegrationContractSchema,
        llm,
        systemPrompt: ctx.systemPrompt,
        userPrompt,
      })

      if (!result.success) {
        emitProgress(sseCallback, 'contract', 'failed', `契约定义失败: ${result.error}`)
        return {
          phase: 'contract' as DialoguePhase,
          executions: [buildExecution('contract', startedAt, 'failed', result.error)],
        }
      }

      emitProgress(sseCallback, 'contract', 'completed', '前后端契约定义完成')

      return {
        phase: 'building' as DialoguePhase,
        artifacts: { ...state.artifacts, contract: result.data },
        executions: [buildExecution('contract', startedAt, 'completed')],
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      emitProgress(sseCallback, 'contract', 'failed', `LLM 调用失败: ${error}`)
      return {
        phase: 'contract' as DialoguePhase,
        executions: [buildExecution('contract', startedAt, 'failed', error)],
      }
    }
  }
}
