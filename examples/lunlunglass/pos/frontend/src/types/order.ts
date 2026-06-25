/**
 * 订单相关类型定义
 */

import type { UserInfo } from './user'
import type { Product } from './product'

/**
 * 订单项（订单中的单个商品项）
 */
export interface OrderItem {
  /** 商品信息 */
  product: Product
  /** 数量 */
  quantity: number
  /** 单价（订单中的价格，可能与商品当前单价不同） */
  price: number
  /** 小计金额 */
  subtotal: number
}

/**
 * 订单信息
 */
export interface Order {
  id: string
  orderId: string
  userId: string
  username: string
  /** 商品列表 */
  items: OrderItem[]
  /** 订单总金额 */
  totalAmount: number
  status: string
  createdAt: string
}

/**
 * 订单项信息（用于订单表单）
 */
export interface OrderItemInfo {
  /** 商品ID */
  productId: string
  /** 数量 */
  quantity: number
  /** 单价 */
  price: number
}

/**
 * 订单信息（用于订单表单）
 */
export interface OrderInfo {
  /** 订单项列表 */
  items: OrderItemInfo[]
  status: string
  remark?: string
}

/**
 * 订单表单数据
 */
export interface OrderFormData {
  userInfo: UserInfo
  orderInfo: OrderInfo
}

/**
 * 订单筛选条件
 */
export interface OrderFilters {
  username?: string
  userId?: string
  orderId?: string
  productId?: string
}
