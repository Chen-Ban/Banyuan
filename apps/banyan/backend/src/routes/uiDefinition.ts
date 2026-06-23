import Router from '@koa/router'
import { UIDefinitionController } from '../controllers/UIDefinitionController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/apps/:appId/app-content' })

// 所有 UI 定义 JSON 内容路由需要校验 appId 归属
router.use(appOwnership)

// GET /api/apps/:appId/app-content — 读取最新已接受版本的 UI 定义 JSON
router.get('/', UIDefinitionController.getUIDefinition)

// PUT /api/apps/:appId/app-content — 画布手动保存 UI 定义 JSON（自动验收的 edit 对话）
router.put('/', UIDefinitionController.saveUIDefinition)

export default router
