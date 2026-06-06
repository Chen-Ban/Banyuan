/**
 * AI Agent Prompt 配置类型定义
 *
 * 存储应用级别的 AI Agent 角色提示词自定义配置。
 * 每个应用可以为五个角色各自定义 system prompt。
 */

/** Agent 角色（含 master） */
export type FullAgentRole = 'master' | 'pm' | 'arch' | 'visual' | 'task'

export interface IAgentPrompt {
  /** 关联的应用 ID */
  appId: string
  /** 所属 Agent 角色 */
  agent: FullAgentRole
  /** 用户自定义的 prompt 内容 */
  promptText: string
  /** 是否被用户修改过 */
  isCustomized: boolean
  /** 对应的系统默认 prompt 版本号（便于检测系统升级） */
  systemVersion: number
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
