import { Order, IOrder, IOrderItem, OrderStatus, User, Product } from '../models/index.js'
import { Types } from 'mongoose'

/**
 * 订单查询条件
 */
export interface IOrderQuery {
  username?: string
  userId?: string
  userUserId?: string
  orderId?: string
  productId?: string
}

/**
 * 订单查询结果
 */
export interface IOrderListResult {
  orders: IOrder[]
  total: number
  page: number
  pageSize: number
}

/**
 * 订单服务
 */
class OrderService {
  /**
   * 查询订单列表
   * @param query 查询条件
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   */
  async getOrderList(
    query: IOrderQuery = {},
    page: number = 1,
    pageSize: number = 10
  ): Promise<IOrderListResult> {
    try {
      // 构建查询条件
      const filter: any = {}

      if (query.username) {
        filter.username = { $regex: query.username, $options: 'i' }
      }

      if (query.userId) {
        // 如果是有效的 ObjectId，查询 userId 字段
        if (Types.ObjectId.isValid(query.userId)) {
          filter.userId = new Types.ObjectId(query.userId)
        } else {
          // 否则查询 userUserId 字段
          filter.userUserId = { $regex: query.userId, $options: 'i' }
        }
      }

      if (query.userUserId) {
        filter.userUserId = { $regex: query.userUserId, $options: 'i' }
      }

      if (query.orderId) {
        filter.orderId = { $regex: query.orderId, $options: 'i' }
      }

      if (query.productId) {
        // 查询订单项中包含该商品ID的订单
        filter['items.productId'] = Types.ObjectId.isValid(query.productId)
          ? new Types.ObjectId(query.productId)
          : query.productId
      }

      // 计算跳过的数量
      const skip = (page - 1) * pageSize

      // 并行查询总数和列表
      const [total, orders] = await Promise.all([
        Order.countDocuments(filter),
        Order.find(filter)
          .populate('userId', 'userId username email phone') // 填充用户信息
          .sort({ createdAt: -1 }) // 按创建时间倒序
          .skip(skip)
          .limit(pageSize)
          .lean(), // 返回纯 JavaScript 对象
      ])

      return {
        orders: orders as unknown as IOrder[],
        total,
        page,
        pageSize,
      }
    } catch (error) {
      throw new Error(`Failed to get order list: ${error}`)
    }
  }

  /**
   * 根据ID获取订单
   * @param id 订单ID（MongoDB _id 或 orderId）
   */
  async getOrderById(id: string): Promise<IOrder | null> {
    try {
      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        const order = await Order.findById(id)
          .populate('userId', 'userId username email phone')
          .lean()
        if (order) return order as unknown as IOrder
      }

      // 如果不是 ObjectId 或查询失败，尝试作为 orderId 查询
      const order = await Order.findOne({ orderId: id })
        .populate('userId', 'userId username email phone')
        .lean()
      return order as unknown as IOrder | null
    } catch (error) {
      throw new Error(`Failed to get order: ${error}`)
    }
  }

  /**
   * 生成订单号
   */
  private generateOrderId(): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `ORD${timestamp}${random}`
  }

  /**
   * 创建订单
   * @param orderData 订单数据
   */
  async createOrder(orderData: {
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
  }): Promise<IOrder> {
    try {
      // 查找或创建用户
      let user = await User.findOne({ userId: orderData.userInfo.userId })
      if (!user) {
        // 如果用户不存在，创建新用户
        user = new User({
          userId: orderData.userInfo.userId,
          username: orderData.userInfo.username,
          email: orderData.userInfo.email,
          phone: orderData.userInfo.phone,
        })
        await user.save()
      }

      // 构建订单项
      const orderItems: IOrderItem[] = []
      let totalAmount = 0

      for (const item of orderData.orderInfo.items) {
        // 查找商品
        let product
        if (Types.ObjectId.isValid(item.productId)) {
          product = await Product.findById(item.productId)
        } else {
          // 如果不是 ObjectId，可能需要根据其他字段查找
          throw new Error(`Invalid productId: ${item.productId}`)
        }

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`)
        }

        const subtotal = item.quantity * item.price
        totalAmount += subtotal

        orderItems.push({
          productId: product._id as Types.ObjectId,
          product: {
            id: product._id.toString(),
            name: product.name,
            sku: product.sku,
            unitPrice: product.unitPrice,
            spec: product.spec,
          },
          quantity: item.quantity,
          price: item.price,
          subtotal,
        })
      }

      // 生成订单号
      let orderId = this.generateOrderId()
      // 确保订单号唯一
      while (await Order.findOne({ orderId })) {
        orderId = this.generateOrderId()
      }

      // 创建订单
      const order = new Order({
        orderId,
        userId: user._id,
        userUserId: user.userId,
        username: user.username,
        items: orderItems,
        totalAmount,
        status: (orderData.orderInfo.status as OrderStatus) || OrderStatus.PENDING,
        remark: orderData.orderInfo.remark,
      })

      await order.save()
      return order.toObject() as unknown as IOrder
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message || error}`)
    }
  }

  /**
   * 更新订单
   * @param id 订单ID（MongoDB _id 或 orderId）
   * @param updateData 更新数据
   */
  async updateOrder(
    id: string,
    updateData: {
      items?: Array<{
        productId: string
        quantity: number
        price: number
      }>
      status?: string
      remark?: string
    }
  ): Promise<IOrder | null> {
    try {
      let order

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        order = await Order.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 orderId 查询
        order = await Order.findOne({ orderId: id })
      }

      if (!order) {
        return null
      }

      // 更新订单项
      if (updateData.items) {
        const orderItems: IOrderItem[] = []
        let totalAmount = 0

        for (const item of updateData.items) {
          // 查找商品
          let product
          if (Types.ObjectId.isValid(item.productId)) {
            product = await Product.findById(item.productId)
          } else {
            throw new Error(`Invalid productId: ${item.productId}`)
          }

          if (!product) {
            throw new Error(`Product not found: ${item.productId}`)
          }

          const subtotal = item.quantity * item.price
          totalAmount += subtotal

          orderItems.push({
            productId: product._id as Types.ObjectId,
            product: {
              id: product._id.toString(),
              name: product.name,
              sku: product.sku,
              unitPrice: product.unitPrice,
              spec: product.spec,
            },
            quantity: item.quantity,
            price: item.price,
            subtotal,
          })
        }

        order.items = orderItems
        order.totalAmount = totalAmount
      }

      // 更新状态
      if (updateData.status !== undefined) {
        order.status = updateData.status as OrderStatus
      }

      // 更新备注
      if (updateData.remark !== undefined) {
        order.remark = updateData.remark
      }

      await order.save()
      return order.toObject() as unknown as IOrder
    } catch (error: any) {
      throw new Error(`Failed to update order: ${error.message || error}`)
    }
  }

  /**
   * 删除订单
   * @param id 订单ID（MongoDB _id 或 orderId）
   */
  async deleteOrder(id: string): Promise<boolean> {
    try {
      let order

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        order = await Order.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 orderId 查询
        order = await Order.findOne({ orderId: id })
      }

      if (!order) {
        return false
      }

      await order.deleteOne()
      return true
    } catch (error: any) {
      throw new Error(`Failed to delete order: ${error.message || error}`)
    }
  }
}

export default new OrderService()

