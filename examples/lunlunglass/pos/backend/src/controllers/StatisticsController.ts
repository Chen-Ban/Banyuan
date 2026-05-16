import { Context } from 'koa'
import statisticsService from '../services/StatisticsService.js'

/**
 * 统计控制器
 */
class StatisticsController {
  /**
   * 获取统计数据
   * GET /api/statistics
   */
  async getStatistics(ctx: Context) {
    try {
      const statistics = await statisticsService.getStatistics()

      ctx.status = 200
      ctx.body = {
        success: true,
        data: statistics,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get statistics',
      }
    }
  }
}

export default new StatisticsController()

