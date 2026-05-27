import Router from '@koa/router'
import aiController from '../controllers/AiController.js'

const router = new Router({ prefix: '/api/ai' })

// POST /api/ai/disambiguation-response — 转发消歧选择到 XiangDi 服务
router.post('/disambiguation-response', aiController.disambiguationResponse.bind(aiController))

// GET  /api/ai/models         — 查询可用 LLM provider 及当前激活状态
router.get('/models', aiController.getModels.bind(aiController))

// POST /api/ai/models/switch  — 切换激活的 LLM provider
router.post('/models/switch', aiController.switchModel.bind(aiController))

// GET  /api/ai/:appId/status  — 查询应用当前 AI 执行状态（是否有可恢复的 thread）
router.get('/:appId/status', aiController.getStatus.bind(aiController))

// POST /api/ai/:appId/resume  — 从 checkpoint 恢复 AI 执行（SSE 流式）
router.post('/:appId/resume', aiController.resume.bind(aiController))

// POST /api/ai/:appId/chat — SSE 流式对话（放在最后，避免通配符误匹配）
router.post('/:appId/chat', aiController.chat.bind(aiController))

export default router
