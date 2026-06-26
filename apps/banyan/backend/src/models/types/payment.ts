/**
 * PaymentOrder 类型定义
 *
 * 聚合支付订单：通过聚合服务商统一对接支付宝/微信支付。
 * 订单创建后返回支付链接，支付完成后通过 notify 回调确认。
 */

export type PaymentChannel = 'alipay' | 'wechat' | 'aggregator'

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refunded'

export interface IPaymentOrder {
  orderId: string
  tenantId: string
  planId: string
  /** 支付金额（分） */
  amount: number
  /** 支付渠道 */
  channel: PaymentChannel
  /** 订单状态 */
  status: PaymentStatus
  /** 外部交易号（聚合商返回） */
  outTradeNo: string
  /** 支付成功时间 */
  paidAt?: Date | null
  createdAt: Date
  updatedAt: Date
}
