import Router from '@koa/router'
import aiController from '../controllers/AiController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/ai' })

// POST /api/ai/disambiguation-response — 转发消歧选择到 XiangDi 服务
router.post('/disambiguation-response', aiController.disambiguationResponse.bind(aiController))

// GET  /api/ai/models         — 查询可用 LLM provider 及当前激活状态
router.get('/models', aiController.getModels.bind(aiController))

// POST /api/ai/models/switch  — 切换激活的 LLM provider
router.post('/models/switch', aiController.switchModel.bind(aiController))

// GET  /api/ai/:appId/status  — 查询应用当前 AI 执行状态（是否有可恢复的 thread）
router.get('/:appId/status', appOwnership, aiController.getStatus.bind(aiController))

// GET  /api/ai/:appId/pending — 获取 pending 对话数据（用于页面恢复确认/撤销状态）
router.get('/:appId/pending', appOwnership, aiController.getPending.bind(aiController))

// POST /api/ai/:appId/confirm — 确认对话：将 pending 暂存数据持久化到 MongoDB
router.post('/:appId/confirm', appOwnership, aiController.confirm.bind(aiController))

// POST /api/ai/:appId/discard — 撤销对话：丢弃 pending 暂存数据
router.post('/:appId/discard', appOwnership, aiController.discard.bind(aiController))

// POST /api/ai/:appId/resume  — 从 checkpoint 恢复 AI 执行（SSE 流式）
router.post('/:appId/resume', appOwnership, aiController.resume.bind(aiController))

// POST /api/ai/:appId/chat — SSE 流式对话（放在最后，避免通配符误匹配）
router.post('/:appId/chat', appOwnership, aiController.chat.bind(aiController))

export default router
