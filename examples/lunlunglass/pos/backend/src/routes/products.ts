import Router from '@koa/router'
import productController from '../controllers/ProductController.js'

const router = new Router({
  prefix: '/api/products',
})

/**
 * GET /api/products
 * 获取商品列表（支持查询条件：name, sku）
 * Query参数: page, pageSize
 */
router.get('/', productController.getProductList.bind(productController))

/**
 * GET /api/products/:id
 * 根据ID获取商品详情
 */
router.get('/:id', productController.getProductById.bind(productController))

/**
 * POST /api/products
 * 创建商品
 */
router.post('/', productController.createProduct.bind(productController))

/**
 * PUT /api/products/:id
 * 更新商品
 */
router.put('/:id', productController.updateProduct.bind(productController))

/**
 * DELETE /api/products/:id
 * 删除商品
 */
router.delete('/:id', productController.deleteProduct.bind(productController))

export default router
