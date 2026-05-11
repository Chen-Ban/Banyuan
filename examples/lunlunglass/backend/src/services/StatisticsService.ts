import { User, Order, Template, Product } from '../models'

/**
 * 订单按状态分组统计
 */
export interface IOrdersByStatus {
  pending: number
  processing: number
  completed: number
  cancelled: number
}

/**
 * 统计数据接口
 */
export interface IStatistics {
  /** 用户总数 */
  userCount: number
  /** 订单总数 */
  orderCount: number
  /** 模板总数 */
  templateCount: number
  /** 商品总数 */
  productCount: number
  /** 订单按状态分组 */
  ordersByStatus: IOrdersByStatus
  /** 最近5条订单 */
  recentOrders: any[]
}

/**
 * 统计服务
 */
class StatisticsService {
  /**
   * 获取统计数据
   */
  async getStatistics(): Promise<IStatistics> {
    try {
      const [userCount, orderCount, templateCount, productCount, ordersByStatusResult, recentOrders] =
        await Promise.all([
          User.countDocuments(),
          Order.countDocuments(),
          Template.countDocuments(),
          Product.countDocuments(),
          Order.aggregate([
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
              },
            },
          ]),
          Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        ])

      // 格式化状态统计
      const ordersByStatus: IOrdersByStatus = {
        pending: 0,
        processing: 0,
        completed: 0,
        cancelled: 0,
      }
      for (const item of ordersByStatusResult) {
        if (item._id in ordersByStatus) {
          ordersByStatus[item._id as keyof IOrdersByStatus] = item.count
        }
      }

      return {
        userCount,
        orderCount,
        templateCount,
        productCount,
        ordersByStatus,
        recentOrders,
      }
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error}`)
    }
  }
}

export default new StatisticsService()
