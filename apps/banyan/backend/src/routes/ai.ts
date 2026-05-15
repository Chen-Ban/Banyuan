import Router from '@koa/router'
import aiController from '../controllers/AiController'

const router = new Router({ prefix: '/api/ai' })

// POST /api/ai/:appId/chat — SSE 流式对话
router.post('/:appId/chat', aiController.chat.bind(aiController))

export default router
