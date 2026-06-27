/**
 * 支付路由 — 聚合支付订单创建 & 回调通知
 *
 * 导出两个 router：
 *   - paymentNotifyRouter：支付回调（X-Internal-Token，无需 JWT）
 *   - paymentRouter：前端创建订单（需要 JWT）
 */

import Router from '@koa/router'
import { paymentService } from '../services/PaymentService.js'
import { logger } from '../utils/logger.js'

// ─── 鉴权：内部回调使用 X-Internal-Token ──────────────────────────────────────

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || '__dev_internal_token__'

// ─── 支付回调 Router（无需 JWT，在 authMiddleware 之前挂载）───────────────────

export const paymentNotifyRouter = new Router()

/**
 * POST /api/payments/notify
 * 聚合商支付结果回调（内部接口，使用 X-Internal-Token 鉴权）
 */
paymentNotifyRouter.post('/api/payments/notify', async (ctx) => {
  const token = ctx.get('X-Internal-Token')
  if (token !== INTERNAL_TOKEN) {
    ctx.status = 401
    ctx.body = { success: false, message: 'Unauthorized: invalid internal token' }
    return
  }

  const { outTradeNo, sign, status } = ctx.request.body as {
    outTradeNo?: string
    sign?: string
    status?: string
  }

  if (!outTradeNo || !sign || !status) {
    ctx.status = 400
    ctx.body = { success: false, message: '缺少必填参数：outTradeNo, sign, status' }
    return
  }

  if (status !== 'paid') {
    ctx.body = { success: true, message: 'Ignored: status is not paid' }
    return
  }

  try {
    const valid = await paymentService.verifyNotify(outTradeNo, sign)
    if (!valid) {
      ctx.status = 400
      ctx.body = { success: false, message: '验签失败或订单状态异常' }
      return
    }

    await paymentService.processPayment(outTradeNo)
    ctx.body = { success: true, message: 'Payment processed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Payment] Notify processing failed: ${message}`)
    ctx.status = 500
    ctx.body = { success: false, message }
  }
})

/**
 * POST /api/payments/:orderId/confirm
 * Admin 手动确认收款（MVP 阶段：不走支付回调，内部 token 鉴权）
 */
paymentNotifyRouter.post('/api/payments/:orderId/confirm', async (ctx) => {
  const token = ctx.get('X-Internal-Token')
  if (token !== INTERNAL_TOKEN) {
    ctx.status = 401
    ctx.body = { success: false, message: 'Unauthorized: invalid internal token' }
    return
  }

  const { orderId } = ctx.params

  try {
    const order = await paymentService.getOrderById(orderId)
    if (!order) {
      ctx.status = 404
      ctx.body = { success: false, message: `订单不存在: ${orderId}` }
      return
    }

    if (order.status === 'paid') {
      ctx.body = { success: true, message: '订单已支付，无需重复确认' }
      return
    }

    if (order.status !== 'pending') {
      ctx.status = 400
      ctx.body = { success: false, message: `订单状态异常: ${order.status}，仅 pending 状态可确认` }
      return
    }

    await paymentService.processPayment(order.outTradeNo)
    logger.info(`[Payment] Admin confirmed payment for order ${orderId}, team ${order.teamId}`)
    ctx.body = { success: true, message: 'Payment confirmed — team plan activated' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Payment] Admin confirm failed for ${orderId}: ${message}`)
    ctx.status = 500
    ctx.body = { success: false, message }
  }
})

// ─── 前端支付 Router（需要 JWT，在 authMiddleware 之后挂载）────────────────────

const paymentRouter = new Router({ prefix: '/api/payments' })

/**
 * POST /api/payments/create-order
 * 前端发起支付：创建订单并返回支付链接
 * 需要 JWT 认证（由 routes/index.ts 的 authMiddleware 保证）
 */
paymentRouter.post('/create-order', async (ctx) => {
  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  if (!user.teamId) {
    ctx.status = 403
    ctx.body = { success: false, message: '请先创建或加入一个团队' }
    return
  }

  const { planId, channel } = ctx.request.body as { planId?: string; channel?: string }

  if (!planId || !channel) {
    ctx.status = 400
    ctx.body = { success: false, message: '缺少必填参数：planId, channel' }
    return
  }

  if (!['alipay', 'wechat', 'aggregator'].includes(channel)) {
    ctx.status = 400
    ctx.body = { success: false, message: '无效的支付渠道，可选值：alipay, wechat, aggregator' }
    return
  }

  try {
    const result = await paymentService.createOrder(user.teamId, planId, channel as 'alipay' | 'wechat' | 'aggregator')
    ctx.body = { success: true, data: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Payment] Failed to create order: ${message}`)
    // 区分业务错误和系统错误
    ctx.status = message.includes('套餐') || message.includes('无效') ? 400 : 500
    ctx.body = { success: false, message }
  }
})

export default paymentRouter
