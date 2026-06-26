/**
 * CreditService — credit 用量管理
 *
 * 职责：
 *   - 每次 AI 对话结束后异步记录 credit 消耗
 *   - 查询当月已用 credit
 *   - 检查当月剩余 credit
 *
 * TODO: 当 XiangDi SSE done 事件携带 token/model 信息后，
 *       在 AiService 中调用 recordUsage 记录实际消耗。
 *       当前框架已就绪，待协议对接。
 */

import crypto from 'crypto'
import { CreditUsage } from '../models/CreditUsage.js'
import { Plan } from '../models/Plan.js'
import { Tenant } from '../models/Tenant.js'
import type { CreditUsageDetail } from '../models/types/index.js'
import { logger } from '../utils/logger.js'
import type { NotificationService } from './NotificationService.js'

/** 旧版 pro 套餐（无 planId）的月 credit 额度 */
const LEGACY_PRO_MONTHLY_CREDITS = 50_000

/** 模型 → credit 单价映射（1 credit = 1K tokens，按输入输出分别计价） */
const CREDIT_PRICE_TABLE: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  'deepseek-v4-pro': { inputPer1K: 0.435, outputPer1K: 0.87 },
  'deepseek-v4-flash': { inputPer1K: 0.14, outputPer1K: 0.28 },
  'deepseek-chat': { inputPer1K: 0.14, outputPer1K: 0.28 }, // alias
  'deepseek-reasoner': { inputPer1K: 0.435, outputPer1K: 0.87 }, // alias
  'kimi-k2.6': { inputPer1K: 0.5, outputPer1K: 1.0 }, // approximate
  'kimi-k2.5': { inputPer1K: 0.4, outputPer1K: 0.8 },
  'moonshot-v1': { inputPer1K: 0.3, outputPer1K: 0.6 },
}

/** 平台加价倍率 */
const MARKUP_FACTOR = 2.0

/**
 * 超量 credit 单价（分/credit）。
 * 当租户月用量超出套餐额度时，按此单价计费。
 * BillingService 使用此常量计算超量费用。
 */
export const OVERAGE_UNIT_PRICE = 1 // 分/credit

/**
 * 延迟加载 NotificationService，避免循环依赖。
 * CreditService → NotificationService（单向），但为安全起见使用懒加载。
 */
let _notificationService: NotificationService | null = null

async function getNotificationService(): Promise<NotificationService> {
  if (!_notificationService) {
    const mod = await import('./NotificationService.js')
    _notificationService = mod.notificationService
  }
  return _notificationService
}

function getCurrentYearMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export class CreditService {
  /**
   * 计算一次 LLM 调用的 credit 消耗
   */
  calculateCredits(model: string, inputTokens: number, outputTokens: number): number {
    const price = CREDIT_PRICE_TABLE[model]
    if (!price) {
      // 未知模型，按默认价格计算
      return Math.ceil((inputTokens + outputTokens) / 1000) * MARKUP_FACTOR
    }
    const inputCredits = (inputTokens / 1000) * price.inputPer1K * MARKUP_FACTOR
    const outputCredits = (outputTokens / 1000) * price.outputPer1K * MARKUP_FACTOR
    return Math.ceil(inputCredits + outputCredits)
  }

  /**
   * 记录一次 credit 消耗
   *
   * @param applicationId 可选：应用 ID，传入时计入应用级用量
   */
  async recordUsage(
    tenantId: string,
    sessionId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    applicationId?: string,
  ): Promise<void> {
    const yearMonth = getCurrentYearMonth()
    const credits = this.calculateCredits(model, inputTokens, outputTokens)
    const detail: CreditUsageDetail = {
      sessionId,
      model,
      inputTokens,
      outputTokens,
      credits,
      timestamp: new Date(),
    }

    const query: Record<string, string> = { tenantId, yearMonth }
    if (applicationId) {
      query.applicationId = applicationId
    } else {
      query.applicationId = { $exists: false } as unknown as string
    }

    await CreditUsage.findOneAndUpdate(
      query,
      {
        $inc: { creditsUsed: credits },
        $push: { detail },
        $setOnInsert: {
          usageId: generateId('cu'),
          ...(applicationId ? { applicationId } : {}),
        },
      },
      { upsert: true },
    )

    // ─── 配额告警检查 ──────────────────────────────────────────────────────
    try {
      const usage = await CreditUsage.findOne(query).lean()
      const used = usage?.creditsUsed ?? credits

      let total = 0
      if (applicationId) {
        // 应用级：从 Application 模型获取 aiLimit
        const { default: Application } = await import('../models/Application.js')
        const app = await Application.findOne({ application_id: applicationId }).lean()
        total = app?.aiLimit ?? 0
      }

      if (total === 0) {
        // 回落租户级额度
        const tenant = await Tenant.findOne({ tenantId }).lean()
        if (tenant?.planId) {
          const plan = await Plan.findOne({ planId: tenant.planId }).lean()
          total = plan?.monthlyCredits ?? 0
        } else if (tenant?.plan === 'pro') {
          total = LEGACY_PRO_MONTHLY_CREDITS
        }
      }

      // 仅对付费套餐进行告警
      if (total > 0) {
        const remaining = Math.max(0, total - used)
        const ratio = remaining / total

        if (ratio <= 0.10) {
          const ns = await getNotificationService()
          await ns.sendQuotaAlert(tenantId, 'critical', remaining, total)
        } else if (ratio <= 0.20) {
          const ns = await getNotificationService()
          await ns.sendQuotaAlert(tenantId, 'warning', remaining, total)
        }
      }
    } catch (alertErr) {
      // 告警失败不影响主流程
      const errorMsg = alertErr instanceof Error ? alertErr.message : String(alertErr)
      logger.error({ tenantId, error: errorMsg }, 'Quota alert check failed')
    }
  }

  /**
   * 查询当月已用 credit
   */
  async getMonthlyUsage(tenantId: string): Promise<{ used: number; total: number; remaining: number }> {
    const yearMonth = getCurrentYearMonth()
    const usage = await CreditUsage.findOne({ tenantId, yearMonth, applicationId: { $exists: false } }).lean()
    const used = usage?.creditsUsed ?? 0

    // 查询套餐额度
    const tenant = await Tenant.findOne({ tenantId }).lean()
    let total = 0
    if (tenant?.planId) {
      const plan = await Plan.findOne({ planId: tenant.planId }).lean()
      total = plan?.monthlyCredits ?? 0
    } else if (tenant?.plan === 'pro') {
      total = LEGACY_PRO_MONTHLY_CREDITS
    }

    return { used, total, remaining: Math.max(0, total - used) }
  }

  /**
   * 检查是否超出月额度
   */
  async isQuotaExceeded(tenantId: string): Promise<boolean> {
    const { remaining, total } = await this.getMonthlyUsage(tenantId)
    // total === 0 表示无限制（免费版）
    if (total === 0) return false
    return remaining <= 0
  }

  /**
   * 查询应用级当月已用 credit
   */
  async getAppMonthlyUsage(
    tenantId: string,
    appId: string,
  ): Promise<{ used: number; total: number; remaining: number }> {
    const yearMonth = getCurrentYearMonth()
    const usage = await CreditUsage.findOne({ tenantId, applicationId: appId, yearMonth }).lean()
    const used = usage?.creditsUsed ?? 0

    // 查询应用级额度
    const { default: Application } = await import('../models/Application.js')
    const app = await Application.findOne({ application_id: appId }).lean()
    let total = app?.aiLimit ?? 0

    // 回落租户级额度
    if (total === 0) {
      const tenant = await Tenant.findOne({ tenantId }).lean()
      if (tenant?.planId) {
        const plan = await Plan.findOne({ planId: tenant.planId }).lean()
        total = plan?.monthlyCredits ?? 0
      } else if (tenant?.plan === 'pro') {
        total = LEGACY_PRO_MONTHLY_CREDITS
      }
    }

    return { used, total, remaining: Math.max(0, total - used) }
  }

  /**
   * 检查应用级配额是否超限
   */
  async isAppQuotaExceeded(tenantId: string, appId: string): Promise<boolean> {
    const { remaining, total } = await this.getAppMonthlyUsage(tenantId, appId)
    if (total === 0) return false
    return remaining <= 0
  }
}

export const creditService = new CreditService()
