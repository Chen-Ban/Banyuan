/**
 * 对话会话路由
 *
 * 基于"1 App = 1 Conversation"模型，路由挂载在 /api/applications/:appId 下。
 * 会话只增不删，仅提供消息读取接口。
 *
 * GET /api/applications/:appId/conversation/messages — 获取对话历史消息
 */

import Router from '@koa/router'
import conversationController from '../controllers/ConversationController.js'

const router = new Router({ prefix: '/api/applications' })

// 获取对话历史消息
router.get(
  '/:appId/conversation/messages',
  conversationController.getMessages.bind(conversationController)
)

export default router
