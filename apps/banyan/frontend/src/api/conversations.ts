/**
 * 对话会话 API
 *
 * 基于"1 App = 1 Conversation"模型，以 appId 为唯一标识。
 * 前端无需管理 conversationId。
 */

const BASE_URL = '/api'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | unknown[]
}

export interface GetMessagesResponse {
  success: boolean
  data: {
    messages: ConversationMessage[]
  }
}

// ─── API 方法 ─────────────────────────────────────────────────────────────────

/**
 * 获取应用的对话历史消息
 */
export async function getMessages(appId: string, limit = 50): Promise<ConversationMessage[]> {
  const response = await fetch(`${BASE_URL}/applications/${appId}/conversation/messages?limit=${limit}`)
  if (!response.ok) {
    throw new Error(`获取对话历史失败 (${response.status})`)
  }
  const json: GetMessagesResponse = await response.json()
  return json.data?.messages ?? []
}

