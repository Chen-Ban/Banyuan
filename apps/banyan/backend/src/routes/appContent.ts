import Router from '@koa/router'
import { AppContentController } from '../controllers/AppContentController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/apps/:appId/app-content' })

// 所有 appJSON 内容路由需要校验 appId 归属
router.use(appOwnership)

// GET /api/apps/:appId/app-content — 读取最新已接受版本的 appJSON
router.get('/', AppContentController.getAppContent)

// PUT /api/apps/:appId/app-content — 画布手动保存 appJSON（自动验收的 edit 对话）
router.put('/', AppContentController.saveAppContent)

export default router
