/**
 * Intent 节点
 *
 * ADR-041: 判断任务管线的入口点。
 *
 * 前提：前端通过 type 字段已区分 chat/task，只有 task 类型才进入此节点。
 * 本节点只负责判断"从哪个 SubAgent 开始执行"。
 *
 * 逻辑：
 *   1. 零 token 规则：artifacts 全空 → fresh 新任务，从 requirements 开始
 *   2. 其他情况：LLM 判断 startFrom + contextStrategy
 */
import type { LLMClient } from '../../core/index.js'
import type { ArtifactStore, IntentResult } from '../artifacts.js'
import type { SubAgentName } from '../protocol.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface IntentNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 零 token 规则
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isArtifactsEmpty(artifacts: ArtifactStore): boolean {
  return (
    !artifacts.requirements &&
    !artifacts.uiDesign &&
    !artifacts.contract &&
    !artifacts.frontend &&
    !artifacts.backend
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 调用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INTENT_SYSTEM_PROMPT = `你是一个任务入口判断器。用户正在对一个低代码应用进行迭代修改。
根据用户消息和当前已有的工件状态，判断本次修改应该从管线的哪个节点重新开始。

管线节点（按顺序）：
1. requirements — 需求解析（用户改了需求描述、加了新功能、改了业务逻辑）
2. uiDesign — UI 设计（用户只调整布局/样式/交互，需求不变）
3. contract — 契约定义（用户只修改数据结构/接口定义，UI 不变）
4. frontend — 前端构建（用户只修改前端视图的实现细节，契约不变）
5. backend — 后端构建（用户只修改云函数逻辑，契约不变）

判断原则：
- 从变化的"最上游"节点开始，其下游会自动重新执行
- 如果不确定，偏向从更上游的节点开始（宁可多做不少做）

返回 JSON：
{
  "startFrom": "requirements" | "uiDesign" | "contract" | "frontend" | "backend",
  "contextStrategy": "fresh" | "inherit",
  "reasoning": "一句话理由",
  "correctionHint": "用户修正要点（可选）"
}

contextStrategy 说明：
- "fresh": 完全推翻重来（用户说"换个思路"/"重新来"等）
- "inherit": 在现有工件基础上修改（大多数情况）

只返回 JSON，不要其他内容。`

interface LLMIntentOutput {
  startFrom: SubAgentName
  contextStrategy: 'fresh' | 'inherit'
  reasoning: string
  correctionHint?: string
}

function buildContextDescription(artifacts: ArtifactStore, phase: DialoguePhase): string {
  const parts: string[] = []
  parts.push(`当前阶段: ${phase}`)
  if (artifacts.requirements) parts.push('已有需求解析结果')
  if (artifacts.uiDesign) parts.push('已有 UI 设计规格')
  if (artifacts.contract) parts.push('已有前后端契约')
  if (artifacts.frontend) parts.push('已有前端构建产出')
  if (artifacts.backend) parts.push('已有后端构建产出')
  return parts.join('\n')
}

async function classifyViaLLM(
  llm: LLMClient,
  userMessage: string,
  artifacts: ArtifactStore,
  phase: DialoguePhase,
): Promise<LLMIntentOutput> {
  const contextDesc = buildContextDescription(artifacts, phase)
  const userPrompt = `当前状态:\n${contextDesc}\n\n用户消息:\n${userMessage}`

  const response = await llm.createMessage({
    model: 'deepseek-chat',
    max_tokens: 512,
    system: INTENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
    temperature: 0,
    runName: `intent:evaluate`,
  })

  // 解析 LLM 返回的 JSON
  const textContent = response.content.find((c) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    return {
      startFrom: 'requirements',
      contextStrategy: 'fresh',
      reasoning: 'LLM 无文本输出，默认从 requirements 开始',
    }
  }

  try {
    let jsonStr = textContent.text.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }
    const parsed = JSON.parse(jsonStr) as LLMIntentOutput
    return {
      startFrom: parsed.startFrom ?? 'requirements',
      contextStrategy: parsed.contextStrategy ?? 'inherit',
      reasoning: parsed.reasoning ?? '',
      correctionHint: parsed.correctionHint,
    }
  } catch {
    return {
      startFrom: 'requirements',
      contextStrategy: 'fresh',
      reasoning: 'JSON 解析失败，默认从 requirements 开始',
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 intent 节点函数
 *
 * 返回一个与 LangGraph 节点签名兼容的 async 函数。
 */
export function createIntentNode(config: IntentNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const { userMessage, artifacts, phase } = state

    // ─── 零 token 规则：artifacts 全空 → fresh 新任务 ────────────────────────
    if (isArtifactsEmpty(artifacts)) {
      const intentResult: IntentResult = {
        startFrom: 'requirements',
        reasoning: '工件仓库为空，新对话直接从需求解析开始',
        contextStrategy: 'fresh',
      }

      sseCallback?.({
        type: 'phase_change',
        from: 'start',
        to: 'requirements',
        timestamp: Date.now(),
      })

      return {
        phase: 'requirements' as DialoguePhase,
        intentResult,
      }
    }

    // ─── LLM 判断入口点 ──────────────────────────────────────────────────────
    const llmResult = await classifyViaLLM(llm, userMessage, artifacts, phase)

    const intentResult: IntentResult = {
      startFrom: llmResult.startFrom,
      reasoning: llmResult.reasoning,
      correctionHint: llmResult.correctionHint,
      contextStrategy: llmResult.contextStrategy,
    }

    // phase 推进到 startFrom 对应的阶段
    const phaseMap: Record<SubAgentName, DialoguePhase> = {
      requirements: 'requirements',
      uiDesign: 'ui_design',
      contract: 'contract',
      frontend: 'building',
      backend: 'building',
    }
    const nextPhase = phaseMap[llmResult.startFrom]

    sseCallback?.({
      type: 'phase_change',
      from: phase,
      to: nextPhase,
      timestamp: Date.now(),
    })

    return {
      phase: nextPhase,
      intentResult,
    }
  }
}
