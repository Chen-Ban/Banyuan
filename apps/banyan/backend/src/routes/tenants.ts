import Router from '@koa/router'
import tenantController from '../controllers/TenantController.js'
import { authMiddleware } from '../middleware/auth.js'
import { clearPermissionCache } from '../middleware/requirePermission.js'
import { Plan } from '../models/Plan.js'
import { Tenant } from '../models/Tenant.js'
import { creditService } from '../services/CreditService.js'
import { logger } from '../utils/logger.js'

const tenantRouter = new Router({ prefix: '/api/tenants' })

// 所有租户接口都需要认证
tenantRouter.use(authMiddleware)

// 租户 CRUD
tenantRouter.post('/', tenantController.create.bind(tenantController))
tenantRouter.get('/:tenantId', tenantController.getById.bind(tenantController))
tenantRouter.put('/:tenantId', tenantController.update.bind(tenantController))
tenantRouter.delete('/:tenantId', tenantController.remove.bind(tenantController))

// 成员管理
tenantRouter.get('/:tenantId/members', tenantController.listMembers.bind(tenantController))
tenantRouter.post('/:tenantId/invite', tenantController.inviteMember.bind(tenantController))
tenantRouter.post('/:tenantId/accept-invite', tenantController.acceptInvite.bind(tenantController))
tenantRouter.put('/:tenantId/members/:targetUserId', tenantController.updateMemberRole.bind(tenantController))
tenantRouter.delete('/:tenantId/members/:targetUserId', tenantController.removeMember.bind(tenantController))

// ─── PUT /api/tenants/:tenantId/plan ──────────────────────────────────────────
// 套餐升级/降级
// 要求 JWT 认证，且调用者必须属于该租户（由 authMiddleware + tenantId 匹配保证）

tenantRouter.put('/:tenantId/plan', async (ctx) => {
  const { tenantId } = ctx.params
  const user = ctx.state.user

  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  // 仅允许操作自身所在租户
  if (user.tenantId !== tenantId) {
    ctx.status = 403
    ctx.body = { success: false, message: '无权操作此租户' }
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

    // 2. 获取当前租户信息
    const tenant = await Tenant.findOne({ tenantId }).lean()
    if (!tenant) {
      ctx.status = 404
      ctx.body = { success: false, message: '租户不存在' }
      return
    }

    // 3. 降级检查：如果新套餐月额度 < 当月已用 credit，拒绝降级
    if (tenant.planId && tenant.planId !== planId) {
      const currentPlan = await Plan.findOne({ planId: tenant.planId }).lean()
      const currentMonthlyCredits = currentPlan?.monthlyCredits ?? 0
      const newMonthlyCredits = newPlan.monthlyCredits ?? 0

      if (newMonthlyCredits < currentMonthlyCredits) {
        const usage = await creditService.getMonthlyUsage(tenantId)

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

    // 5. 更新租户（设置订阅到期时间）
    const subscriptionExpiresAt = new Date()
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1)

    await Tenant.updateOne(
      { tenantId },
      {
        $set: {
          planId,
          plan: planField,
          subscriptionExpiresAt,
        },
      },
    )

    // 6. 清除权限缓存
    clearPermissionCache(tenantId)

    logger.info(`[Tenant] Plan updated for tenant ${tenantId}: planId=${planId}, plan=${planField}`)

    ctx.body = {
      success: true,
      data: {
        tenantId,
        planId,
        plan: planField,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Tenant] Failed to update plan for ${tenantId}: ${message}`)
    ctx.status = 500
    ctx.body = { success: false, message }
  }
})

export default tenantRouter
