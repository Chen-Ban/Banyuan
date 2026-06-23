/**
 * /api/apps/:appId/full-state — 应用全量状态聚合端点
 *
 * 提供 save-all（一次 edit 对话原子写入 uiJSON + collections + cloudFunctions）
 * 和 full-state 读取（复用 ApplicationService.getFullApplicationById 聚合口径）。
 *
 * 设计决策来源：docs/adr/app/mechanism.md M6 + docs/specs/app/metadata-dataflow.md
 */

import Router from '@koa/router'
import { FullStateController } from '../controllers/FullStateController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/apps/:appId' })

// 所有路由需要校验 appId 归属
router.use(appOwnership)

// PUT /api/apps/:appId/save-all — 原子保存全部内容（uiJSON + collections + cloudFunctions）
router.put('/save-all', FullStateController.saveAll)

// GET /api/apps/:appId/full-state — 读取应用完整业务数据
router.get('/full-state', FullStateController.getFullState)

export default router
