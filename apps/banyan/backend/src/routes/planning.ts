/**
 * Multi-Agent Planning 路由
 *
 * 提供规划产物查询和 Agent Prompt 配置 CRUD 端点。
 * 所有路由挂载在 /api/applications/:appId 下，需经过 JWT + appOwnership 中间件。
 */

import Router from '@koa/router'
import planningController from '../controllers/PlanningController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/applications' })

// ─── 规划产物查询 ───────────────────────────────────────────────────────────────

// 获取某对话关联的规划产物
router.get(
  '/:appId/planning/artifact/:dialogueId',
  appOwnership,
  planningController.getArtifactByDialogue.bind(planningController)
)

// 获取应用最近完成的规划产物
router.get(
  '/:appId/planning/artifact-latest',
  appOwnership,
  planningController.getLatestArtifact.bind(planningController)
)

// ─── Agent Prompt 配置 CRUD ─────────────────────────────────────────────────────

// 批量更新角色配置（放在 /:agent 之前，避免 pattern 被通配符匹配）
router.put(
  '/:appId/prompts',
  appOwnership,
  planningController.batchUpsertPrompts.bind(planningController)
)

// 获取应用全部角色配置
router.get(
  '/:appId/prompts',
  appOwnership,
  planningController.listPrompts.bind(planningController)
)

// 获取某角色配置
router.get(
  '/:appId/prompts/:agent',
  appOwnership,
  planningController.getPrompt.bind(planningController)
)

// 更新某角色配置
router.put(
  '/:appId/prompts/:agent',
  appOwnership,
  planningController.upsertPrompt.bind(planningController)
)

// 重置某角色配置
router.delete(
  '/:appId/prompts/:agent',
  appOwnership,
  planningController.resetPrompt.bind(planningController)
)

export default router
