/**
 * PaymentService — 聚合支付服务
 *
 * 职责：
 *   - 创建支付订单，返回聚合商支付链接（当前为占位 mock）
 *   - 验证支付回调通知
 *   - 处理支付成功：更新订单状态 + 激活团队套餐
 */

import crypto from 'crypto'
import { PaymentOrder } from '../models/billing/PaymentOrder.js'
import { Team } from '../models/auth/Team.js'
import { Plan } from '../models/billing/Plan.js'
import { logger } from '../utils/logger.js'
import { clearPermissionCache } from '../middleware/requirePermission.js'
import type { PaymentChannel } from '../models/types/index.js'

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export class PaymentService {
  /**
   * 按 orderId 查询订单
   */
  async getOrderById(orderId: string) {
    return PaymentOrder.findOne({ orderId }).lean()
  }

  /**
   * 创建支付订单
   *
   * @returns 订单基本信息 + 支付链接（聚合商占位 mock URL）
   */
  async createOrder(
    teamId: string,
    planId: string,
    channel: PaymentChannel,
  ): Promise<{ orderId: string; paymentUrl: string }> {
    // 查询套餐信息
    const plan = await Plan.findOne({ planId, active: true }).lean()
    if (!plan) {
      throw new Error(`Plan not found or inactive: ${planId}`)
    }

    const orderId = generateId('po')
    const outTradeNo = generateId('otn')

    await PaymentOrder.create({
      orderId,
      teamId,
      planId,
      amount: plan.priceInCents,
      channel,
      status: 'pending',
      outTradeNo,
    })

    logger.info(`[Payment] Order created: ${orderId} for team ${teamId}, plan ${planId}`)

    // 聚合商占位 mock URL
    const paymentUrl = `https://pay.example.com/checkout?outTradeNo=${outTradeNo}&amount=${plan.priceInCents}&channel=${channel}`

    return { orderId, paymentUrl }
  }

  /**
   * 验证支付回调签名
   *
   * 当前为占位实现：仅校验 outTradeNo 存在且订单未终结。
   * 接入真实聚合商后替换为 RSA/SM2 验签逻辑。
   */
  async verifyNotify(outTradeNo: string, sign: string): Promise<boolean> {
    // TODO: validate sign with RSA/SM2 when real aggregator is integrated
    void sign

    const order = await PaymentOrder.findOne({ outTradeNo }).lean()
    if (!order) {
      logger.warn(`[Payment] Notify for unknown outTradeNo: ${outTradeNo}`)
      return false
    }

    if (order.status !== 'pending') {
      logger.warn(`[Payment] Notify for non-pending order: ${outTradeNo}, status=${order.status}`)
      return false
    }

    return true
  }

  /**
   * 处理支付成功
   *
   * 1. 更新订单状态为 'paid'
   * 2. 更新团队 planId + plan + subscriptionExpiresAt（一个月后到期）
   * 3. 清除权限缓存
   */
  async processPayment(outTradeNo: string): Promise<void> {
    // 原子更新：只有 status 为 'pending' 时才能改为 'paid'（防止并发回调）
    const paidAt = new Date()
    const order = await PaymentOrder.findOneAndUpdate(
      { outTradeNo, status: 'pending' },
      { $set: { status: 'paid', paidAt } },
      { new: true },
    )

    if (!order) {
      // 可能已经被处理过，或订单不存在
      const existing = await PaymentOrder.findOne({ outTradeNo }).lean()
      if (existing) {
        logger.info(`[Payment] Order already processed: ${outTradeNo} (status=${existing.status})`)
        return
      }
      throw new Error(`Payment order not found: ${outTradeNo}`)
    }

    // 查询套餐，确定 plan 字段值
    const plan = await Plan.findOne({ planId: order.planId }).lean()
    if (!plan) {
      throw new Error(`Plan not found: ${order.planId}`)
    }

    // 计算订阅到期时间（从当前时间起一个月）
    const subscriptionExpiresAt = new Date()
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1)

    const planField: 'free' | 'pro' = plan.priceInCents > 0 ? 'pro' : 'free'

    // 更新团队套餐
    await Team.updateOne(
      { teamId: order.teamId },
      {
        $set: {
          planId: order.planId,
          plan: planField,
          subscriptionExpiresAt,
        },
      },
    )

    // 清除权限缓存
    clearPermissionCache(order.teamId)

    logger.info(`[Payment] Payment processed for team ${order.teamId}: plan=${plan.planId}, expires=${subscriptionExpiresAt.toISOString()}`)
  }
}

export const paymentService = new PaymentService()
