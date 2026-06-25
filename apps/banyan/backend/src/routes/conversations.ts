/**
 * 对话会话路由（V2）
 *
 * 基于"1 App = 1 Conversation"模型，路由挂载在 /api/applications/:appId 下。
 * V2 变更：返回 Dialogue[] 而非扁平 messages[]。
 *
 * GET /api/applications/:appId/conversation/dialogues — 获取对话列表（分页）
 */

import Router from '@koa/router'
import conversationController from '../controllers/ConversationController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/applications' })

// 获取对话列表（Dialogue[]，含 messages）
router.get(
  '/:appId/conversation/dialogues',
  appOwnership,
  conversationController.getDialogues.bind(conversationController),
)

export default router
