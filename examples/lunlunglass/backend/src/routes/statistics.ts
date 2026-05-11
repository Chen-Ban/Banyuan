import Router from '@koa/router'
import statisticsController from '../controllers/StatisticsController'

const router = new Router({
  prefix: '/api/statistics',
})

/**
 * GET /api/statistics
 * 获取统计数据（用户数、订单数）
 */
router.get('/', statisticsController.getStatistics.bind(statisticsController))

export default router

