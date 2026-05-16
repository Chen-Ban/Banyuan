/**
 * 对话会话路由
 *
 * GET    /api/conversations/:appId                        — 列出应用的所有会话
 * GET    /api/conversations/:appId/:conversationId        — 获取会话详情（含消息历史）
 * PATCH  /api/conversations/:appId/:conversationId        — 更新会话标题
 * DELETE /api/conversations/:appId/:conversationId        — 删除单个会话
 * DELETE /api/conversations/:appId                        — 删除应用的所有会话
 */

import Router from '@koa/router'
import conversationController from '../controllers/ConversationController.js'

const router = new Router({ prefix: '/api/conversations' })

// 列出应用的所有会话
router.get('/:appId', conversationController.list.bind(conversationController))

// 获取会话详情
router.get('/:appId/:conversationId', conversationController.detail.bind(conversationController))

// 更新会话标题
router.patch('/:appId/:conversationId', conversationController.updateTitle.bind(conversationController))

// 删除单个会话
router.delete('/:appId/:conversationId', conversationController.delete.bind(conversationController))

// 删除应用的所有会话
router.delete('/:appId', conversationController.deleteByApp.bind(conversationController))

export default router
