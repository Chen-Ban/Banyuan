/** 上下文维度枚举 —— SubAgent 声明需要哪些维度的上下文 */
export enum ContextDimension {
  /** L1: 全局系统提示词（应用级别不变部分） */
  SYSTEM_PROMPT = 'systemPrompt',
  /** L2: 持久化的用户记忆/偏好 */
  AGENT_MEMORY = 'agentMemory',
  /** L3: 先前轮次对话摘要 */
  CONTEXT_SUMMARY = 'contextSummary',
  /** 上游需求规约产物（requirements 节点产出） */
  REQUIREMENTS = 'requirements',
  /** 上游 UI 设计规约产物 */
  UI_DESIGN = 'uiDesign',
  /** 上游前后端集成契约 */
  CONTRACT = 'contract',
  /** 用户当前轮次的输入消息 */
  USER_MESSAGE = 'userMessage',
}

/** SubAgent 上下文声明 —— 每个 SubAgent 的上下文需求清单 */
export interface ContextDeclaration {
  /** SubAgent 的角色标识 */
  role: string
  /** 该 SubAgent 需要的上下文维度列表 */
  dimensions: ContextDimension[]
  /** 该 SubAgent 的角色专属系统提示词 */
  rolePrompt: string
}

/** 按需拉取的上下文片段 */
export interface ContextSlice {
  dimension: ContextDimension
  content: string
  /** token 估算长度，用于窗口管理 */
  estimatedTokens?: number
}

/** ContextProvider 的统一输出 */
export interface ContextPackage {
  systemPrompt: string       // 组装后的完整系统提示词
  userMessage: string         // 用户消息（可能包含上下文引用）
  slices: ContextSlice[]      // 实际拉取的上下文片段明细
}
