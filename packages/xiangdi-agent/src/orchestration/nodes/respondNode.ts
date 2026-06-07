/**
 * Respond 节点
 *
 * ADR-041: 纯对话回复节点，仅在 chat 模式下激活。
 *
 * 职责：
 *   - 接收 OrchestratorState 中的对话上下文
 *   - 通过 LLM streaming 生成自然语言回复
 *   - 每个 token 通过 sseCallback 发送 text_delta 事件
 *   - 最后发送 done 事件，phase 设为 done
 *
 * 设计：
 *   - 使用 createMessageStream + onToken 回调实现逐字推送
 *   - system prompt = L1(systemPrompt) + L2(agentMemory) + L3(contextSummary)
 *   - 不接触 artifacts/intentResult 等管线状态
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RespondNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt 组装
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_RESPOND_SYSTEM = `你是班园低代码平台的 AI 助手。用户正在与你进行普通对话（非应用构建任务）。
请自然、友好地回答用户的问题。你可以回答关于平台使用、功能解释、技术概念等问题。
如果用户的问题涉及应用构建或修改，建议他们切换到任务模式。`

function buildSystemPrompt(state: OrchestratorState): string {
  const parts: string[] = []

  // L1: 系统提示词
  parts.push(state.systemPrompt || DEFAULT_RESPOND_SYSTEM)

  // L2: Agent 记忆
  if (state.agentMemory) {
    parts.push(`\n---\n用户偏好记忆:\n${state.agentMemory}`)
  }

  // L3: 历史对话摘要
  if (state.contextSummary) {
    parts.push(`\n---\n历史对话摘要:\n${state.contextSummary}`)
  }

  return parts.join('\n')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 respond 节点函数
 *
 * 返回一个与 LangGraph 节点签名兼容的 async 函数。
 * 通过 streaming LLM 调用，逐 token 发送 text_delta SSE 事件。
 */
export function createRespondNode(config: RespondNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const { userMessage } = state

    const systemPrompt = buildSystemPrompt(state)

    // ─── 流式 LLM 调用 ──────────────────────────────────────────────────────
    const response = await llm.createMessageStream(
      {
        model: 'deepseek-chat',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
        temperature: 0.7,
      },
      (token) => {
        // 每个 token 通过 SSE 推送给前端
        sseCallback?.({
          type: 'text_delta',
          delta: token,
          timestamp: Date.now(),
        })
      }
    )

    // ─── 提取完整回复文本 ──────────────────────────────────────────────────────
    const fullText = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')

    // ─── 发送 done 事件 ─────────────────────────────────────────────────────
    sseCallback?.({
      type: 'done',
      finalPhase: 'done',
      summary: fullText,
      timestamp: Date.now(),
    })

    // 返回状态更新：phase → done，不修改 artifacts 等管线字段
    return {
      phase: 'done' as DialoguePhase,
    }
  }
}
