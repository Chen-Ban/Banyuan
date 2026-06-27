/**
 * Bill 类型定义 — 月度账单
 */

export type BillStatus = 'pending' | 'paid' | 'overdue'

export interface IBill {
  billId: string
  teamId: string
  /** 计费周期标识：'2026-07' 格式 */
  yearMonth: string
  /** 套餐基础价格（分） */
  basePrice: number
  /** 超量 credits 数量 */
  overageCredits: number
  /** 超量费用（分） */
  overagePrice: number
  /** 总费用（分）= basePrice + overagePrice */
  totalPrice: number
  /** 账单状态 */
  status: BillStatus
  createdAt: Date
  updatedAt: Date
}
