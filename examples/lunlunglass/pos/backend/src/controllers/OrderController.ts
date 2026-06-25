import { Context } from 'koa'
import orderService from '../services/OrderService.js'

/**
 * 创建订单请求体
 */
interface CreateOrderRequest {
  userInfo: {
    userId: string
    username: string
    email?: string
    phone?: string
  }
  orderInfo: {
    items: Array<{
      productId: string
      quantity: number
      price: number
    }>
    status?: string
    remark?: string
  }
}

/**
 * 更新订单请求体
 */
interface UpdateOrderRequest {
  items?: Array<{
    productId: string
    quantity: number
    price: number
  }>
  status?: string
  remark?: string
}

/**
 * 订单控制器
 */
class OrderController {
  /**
   * 获取订单列表
   * GET /api/orders
   * Query参数: username, userId, orderId, productId, page, pageSize
   */
  async getOrderList(ctx: Context) {
    try {
      const { username, userId, orderId, productId, page = '1', pageSize = '10' } = ctx.query

      const query = {
        username: username as string | undefined,
        userId: userId as string | undefined,
        orderId: orderId as string | undefined,
        productId: productId as string | undefined,
      }

      // 移除 undefined 值
      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query],
      )

      const result = await orderService.getOrderList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10),
      )

      ctx.status = 200
      ctx.body = {
        success: true,
        data: result,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get order list',
      }
    }
  }

  /**
   * 根据ID获取订单详情
   * GET /api/orders/:id
   */
  async getOrderById(ctx: Context) {
    try {
      const { id } = ctx.params
      const order = await orderService.getOrderById(id)

      if (!order) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Order not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: order,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get order',
      }
    }
  }

  /**
   * 创建订单
   * POST /api/orders
   */
  async createOrder(ctx: Context) {
    try {
      const orderData = ctx.request.body as CreateOrderRequest

      // 验证必填字段
      if (!orderData.userInfo || !orderData.orderInfo) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'userInfo and orderInfo are required',
        }
        return
      }

      if (!orderData.userInfo.userId || !orderData.userInfo.username) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'userInfo.userId and userInfo.username are required',
        }
        return
      }

      if (!orderData.orderInfo.items || orderData.orderInfo.items.length === 0) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'orderInfo.items is required and cannot be empty',
        }
        return
      }

      const order = await orderService.createOrder(orderData)

      ctx.status = 201
      ctx.body = {
        success: true,
        data: order,
        message: 'Order created successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to create order',
      }
    }
  }

  /**
   * 更新订单
   * PUT /api/orders/:id
   */
  async updateOrder(ctx: Context) {
    try {
      const { id } = ctx.params
      const updateData = ctx.request.body as UpdateOrderRequest

      const order = await orderService.updateOrder(id, updateData)

      if (!order) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Order not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: order,
        message: 'Order updated successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to update order',
      }
    }
  }

  /**
   * 删除订单
   * DELETE /api/orders/:id
   */
  async deleteOrder(ctx: Context) {
    try {
      const { id } = ctx.params
      const deleted = await orderService.deleteOrder(id)

      if (!deleted) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Order not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        message: 'Order deleted successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to delete order',
      }
    }
  }
}

export default new OrderController()
