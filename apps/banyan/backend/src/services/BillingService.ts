/**
 * BillingService — 月度账单生成
 *
 * 职责：
 *   - 每月 1 日自动为所有付费租户生成上月账单
 *   - 计算超量 credit 费用
 *   - 创建 Bill 记录
 */

import crypto from 'crypto'
import { Bill } from '../models/Bill.js'
import { CreditUsage } from '../models/CreditUsage.js'
import { Plan } from '../models/Plan.js'
import { Tenant } from '../models/Tenant.js'
import { OVERAGE_UNIT_PRICE } from './CreditService.js'
import { logger } from '../utils/logger.js'

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

/**
 * 获取当前 yearMonth（如 '2026-07'）
 */
function getCurrentYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export class BillingService {
  /**
   * 为指定月份生成所有付费租户的账单
   * @param yearMonth 计费周期，格式 '2026-07'
   */
  async generateMonthlyBill(yearMonth: string): Promise<number> {
    logger.info({ yearMonth }, 'Starting monthly bill generation')

    // 查找所有付费租户（planId 不为空或 plan === 'pro'）
    const proTenants = await Tenant.find({
      $or: [
        { planId: { $exists: true, $nin: [null, ''] } },
        { plan: 'pro' },
      ],
    }).lean()

    logger.info({ yearMonth, tenantCount: proTenants.length }, 'Found pro tenants for billing')

    let billCount = 0

    for (const tenant of proTenants) {
      try {
        // 检查是否已存在该月账单（幂等）
        const existing = await Bill.findOne({
          tenantId: tenant.tenantId,
          yearMonth,
        })
        if (existing) {
          logger.info(
            { tenantId: tenant.tenantId, yearMonth },
            'Bill already exists, skipping',
          )
          continue
        }

        // 查询该月 credit 用量
        const usage = await CreditUsage.findOne({
          tenantId: tenant.tenantId,
          yearMonth,
        }).lean()

        const creditsUsed = usage?.creditsUsed ?? 0

        // 获取套餐信息
        let monthlyCredits = 0
        let basePrice = 0

        if (tenant.planId) {
          const plan = await Plan.findOne({ planId: tenant.planId }).lean()
          monthlyCredits = plan?.monthlyCredits ?? 0
          basePrice = plan?.priceInCents ?? 0
        } else if (tenant.plan === 'pro') {
          // 旧版 pro 套餐（无 planId）
          monthlyCredits = 50_000
          basePrice = 9_900 // ¥99
        }

        // 计算超量
        const overageCredits = Math.max(0, creditsUsed - monthlyCredits)
        const overagePrice = Math.ceil(overageCredits * OVERAGE_UNIT_PRICE)
        const totalPrice = basePrice + overagePrice

        // 创建账单
        const billId = generateId('bill')
        await Bill.create({
          billId,
          tenantId: tenant.tenantId,
          yearMonth,
          basePrice,
          overageCredits,
          overagePrice,
          totalPrice,
          status: 'pending',
        })

        logger.info(
          {
            billId,
            tenantId: tenant.tenantId,
            yearMonth,
            basePrice,
            overageCredits,
            overagePrice,
            totalPrice,
          },
          'Bill created',
        )
        billCount++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(
          { tenantId: tenant.tenantId, yearMonth, error: errorMsg },
          'Failed to generate bill for tenant',
        )
      }
    }

    logger.info({ yearMonth, billCount }, 'Monthly bill generation completed')
    return billCount
  }

  /**
   * 为当前月份生成账单（便捷方法）
   */
  async generateCurrentMonthBill(): Promise<number> {
    const yearMonth = getCurrentYearMonth()
    return this.generateMonthlyBill(yearMonth)
  }
}

export const billingService = new BillingService()
