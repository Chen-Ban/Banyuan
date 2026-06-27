import Router from '@koa/router'
import teamController from '../controllers/TeamController.js'
import { authMiddleware } from '../middleware/auth.js'
import { clearPermissionCache } from '../middleware/requirePermission.js'
import { Plan } from '../models/billing/Plan.js'
import { Team } from '../models/auth/Team.js'
import { creditService } from '../services/CreditService.js'
import { logger } from '../utils/logger.js'

const teamRouter = new Router({ prefix: '/api/teams' })

// 所有团队接口都需要认证
teamRouter.use(authMiddleware)

// 团队 CRUD
teamRouter.post('/', teamController.create.bind(teamController))
teamRouter.get('/:teamId', teamController.getById.bind(teamController))
teamRouter.put('/:teamId', teamController.update.bind(teamController))
teamRouter.delete('/:teamId', teamController.remove.bind(teamController))

// 成员管理
teamRouter.get('/:teamId/members', teamController.listMembers.bind(teamController))
teamRouter.post('/:teamId/invite', teamController.inviteMember.bind(teamController))
teamRouter.post('/:teamId/accept-invite', teamController.acceptInvite.bind(teamController))
teamRouter.put('/:teamId/members/:targetUserId', teamController.updateMemberRole.bind(teamController))
teamRouter.delete('/:teamId/members/:targetUserId', teamController.removeMember.bind(teamController))

// ─── PUT /api/teams/:teamId/plan ──────────────────────────────────────────
// 套餐升级/降级
// 要求 JWT 认证，且调用者必须属于该团队（由 authMiddleware + teamId 匹配保证）

teamRouter.put('/:teamId/plan', async (ctx) => {
  const { teamId } = ctx.params
  const user = ctx.state.user

  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  // 仅允许操作自身所在团队
  if (user.teamId !== teamId) {
    ctx.status = 403
    ctx.body = { success: false, message: '无权操作此团队' }
    return
  }

  const { planId } = ctx.request.body as { planId?: string }

  if (!planId) {
    ctx.status = 400
    ctx.body = { success: false, message: '缺少必填参数：planId' }
    return
  }

  try {
    // 1. 校验目标套餐存在且激活
    const newPlan = await Plan.findOne({ planId, active: true }).lean()
    if (!newPlan) {
      ctx.status = 400
      ctx.body = { success: false, message: `套餐不存在或已停用: ${planId}` }
      return
    }

    // 2. 获取当前团队信息
    const team = await Team.findOne({ teamId }).lean()
    if (!team) {
      ctx.status = 404
      ctx.body = { success: false, message: '团队不存在' }
      return
    }

    // 3. 降级检查：如果新套餐月额度 < 当月已用 credit，拒绝降级
    if (team.planId && team.planId !== planId) {
      const currentPlan = await Plan.findOne({ planId: team.planId }).lean()
      const currentMonthlyCredits = currentPlan?.monthlyCredits ?? 0
      const newMonthlyCredits = newPlan.monthlyCredits ?? 0

      if (newMonthlyCredits < currentMonthlyCredits) {
        const usage = await creditService.getMonthlyUsage(teamId)

        if (usage.used > newMonthlyCredits) {
          ctx.status = 400
          ctx.body = {
            success: false,
            message: `当前已使用 ${usage.used} credits，超出目标套餐月额度 ${newMonthlyCredits} credits，无法降级`,
            code: 'DOWNGRADE_QUOTA_EXCEEDED',
          }
          return
        }
      }
    }

    // 4. 确定 plan 字段值
    const planField: 'free' | 'pro' = newPlan.priceInCents > 0 ? 'pro' : 'free'

    // 5. 更新团队（设置订阅到期时间）
    const subscriptionExpiresAt = new Date()
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1)

    await Team.updateOne(
      { teamId },
      {
        $set: {
          planId,
          plan: planField,
          subscriptionExpiresAt,
        },
      },
    )

    // 6. 清除权限缓存
    clearPermissionCache(teamId)

    logger.info(`[Team] Plan updated for team ${teamId}: planId=${planId}, plan=${planField}`)

    ctx.body = {
      success: true,
      data: {
        teamId,
        planId,
        plan: planField,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Team] Failed to update plan for ${teamId}: ${message}`)
    ctx.status = 500
    ctx.body = { success: false, message }
  }
})

export default teamRouter
