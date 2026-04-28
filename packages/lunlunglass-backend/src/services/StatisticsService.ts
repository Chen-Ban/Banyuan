import { User, Order } from '../models'

/**
 * 统计数据接口
 */
export interface IStatistics {
  /** 用户总数 */
  userCount: number
  /** 订单总数 */
  orderCount: number
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
      // 并行查询用户数和订单数
      const [userCount, orderCount] = await Promise.all([
        User.countDocuments(),
        Order.countDocuments(),
      ])

      return {
        userCount,
        orderCount,
      }
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error}`)
    }
  }
}

export default new StatisticsService()

