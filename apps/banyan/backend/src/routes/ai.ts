import Router from '@koa/router'
import aiController from '../controllers/AiController'

const router = new Router({ prefix: '/api/ai' })

// POST /api/ai/disambiguation-response — 转发消歧选择到 XiangDi 服务
router.post('/disambiguation-response', aiController.disambiguationResponse.bind(aiController))

// GET  /api/ai/models         — 查询可用 LLM provider 及当前激活状态
router.get('/models', aiController.getModels.bind(aiController))

// POST /api/ai/models/switch  — 切换激活的 LLM provider
router.post('/models/switch', aiController.switchModel.bind(aiController))

// POST /api/ai/:appId/chat — SSE 流式对话（放在最后，避免通配符误匹配）
router.post('/:appId/chat', aiController.chat.bind(aiController))

export default router
