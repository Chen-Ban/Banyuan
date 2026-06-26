/**
 * LLM Call Record 类型定义
 *
 * 追踪每次 AI 调用的投入产出，区分「productive」（已确认）与「wasted」（已废弃）。
 */

export interface ILLMCallRecord {
  /** 记录唯一 ID */
  recordId: string
  /** 租户 ID */
  tenantId: string
  /** 应用 ID */
  appId: string
  /** 关联的对话 ID */
  dialogueId: string
  /** 调用 agent 名称 */
  agentName: string
  /** 使用的模型 */
  llmModel: string
  /** LLM provider */
  provider: string
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** 消耗 credits */
  credits: number
  /** 调用时对话所处的 phase */
  dialoguePhase: string
  /** 该对话是否最终被确认（true = productive，false = wasted） */
  isCommitted: boolean
  /** 调用时间 */
  timestamp: Date
}
