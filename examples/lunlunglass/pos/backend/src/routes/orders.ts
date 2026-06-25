import Router from '@koa/router'
import orderController from '../controllers/OrderController.js'

const router = new Router({
  prefix: '/api/orders',
})

/**
 * GET /api/orders
 * 获取订单列表（支持查询条件：username, userId, orderId, productId）
 * Query参数: page, pageSize
 */
router.get('/', orderController.getOrderList.bind(orderController))

/**
 * GET /api/orders/:id
 * 根据ID获取订单详情
 */
router.get('/:id', orderController.getOrderById.bind(orderController))

/**
 * POST /api/orders
 * 创建订单
 */
router.post('/', orderController.createOrder.bind(orderController))

/**
 * PUT /api/orders/:id
 * 更新订单
 */
router.put('/:id', orderController.updateOrder.bind(orderController))

/**
 * DELETE /api/orders/:id
 * 删除订单
 */
router.delete('/:id', orderController.deleteOrder.bind(orderController))

export default router
