import { get, post, put, del } from './client'
import type { ApiResponse } from './client'
import type { Order, OrderFormData, OrderFilters } from '@/types'

interface OrderListResponse {
  success: boolean
  data: {
    orders: Order[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 获取订单列表
 */
export function fetchOrders(
  page: number = 1,
  pageSize: number = 10,
  filters?: OrderFilters,
): Promise<OrderListResponse> {
  return get<OrderListResponse>('/orders', {
    page,
    pageSize,
    ...filters,
  })
}

/**
 * 获取订单详情
 */
export function fetchOrder(id: string): Promise<ApiResponse<Order>> {
  return get<ApiResponse<Order>>(`/orders/${id}`)
}

/**
 * 创建订单
 */
export function createOrder(data: OrderFormData): Promise<ApiResponse<Order>> {
  return post<ApiResponse<Order>>('/orders', data)
}

/**
 * 更新订单
 */
export function updateOrder(id: string, data: OrderFormData): Promise<ApiResponse<Order>> {
  return put<ApiResponse<Order>>(`/orders/${id}`, data)
}

/**
 * 删除订单
 */
export function deleteOrder(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/orders/${id}`)
}
