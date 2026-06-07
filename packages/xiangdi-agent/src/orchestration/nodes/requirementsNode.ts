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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RequirementsNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REQUIREMENTS_SYSTEM_PROMPT = `你是一位资深产品经理，正在帮助用户分析低代码应用的需求。

你的任务是从用户的自然语言描述中提取结构化的需求规格。

输出 JSON 格式：
{
  "features": [
    {
      "id": "feat-xxx",
      "title": "功能标题",
      "description": "详细描述",
      "userStory": "As a ... I want ... So that ...",
      "priority": "must" | "should" | "could"
    }
  ],
  "constraints": ["约束1", "约束2"],
  "outOfScope": ["不做的事1"]
}

规则：
1. features 至少 1 个，id 格式为 "feat-" + 短标识
2. priority 判断依据：must=核心功能/用户明确要求；should=隐含需要但非强调；could=锦上添花
3. constraints 包含用户提到的限制（如"不要后端"/"移动端优先"等）
4. outOfScope 记录可以明确排除的功能（用户说"不需要xxx"或明显超出范围的）
5. 如果用户描述模糊，用合理推断补充，但在 description 中标注"[推断]"

只返回 JSON，不要其他内容。`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createRequirementsNode(config: RequirementsNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'requirements', 'planning', '正在解析需求...')

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户需求:\n${state.userMessage}`)

    if (state.agentMemory) {
      parts.push(`\n用户偏好:\n${state.agentMemory}`)
    }

    // inherit 模式：注入旧 requirements 让 LLM 做增量修改
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.requirements) {
      parts.push(`\n已有需求（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.requirements, null, 2)}`)
    }

    if (intent?.correctionHint) {
      parts.push(`\n修正要求:\n${intent.correctionHint}`)
    }

    const userPrompt = parts.join('\n')

    // ─── LLM 调用 ─────────────────────────────────────────────────────────
    try {
      const rawText = await callSubAgentLLM({
        llm,
        systemPrompt: REQUIREMENTS_SYSTEM_PROMPT,
        userPrompt,
      })

      // ─── Zod 校验 + retry ────────────────────────────────────────────────
      const result = await parseWithRetry({
        rawText,
        schema: StructuredRequirementsSchema,
        llm,
        systemPrompt: REQUIREMENTS_SYSTEM_PROMPT,
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
