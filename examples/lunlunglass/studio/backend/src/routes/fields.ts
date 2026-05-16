import Router from '@koa/router'
import fieldsController from '../controllers/FieldsController.js'

const router = new Router({ prefix: '/api' })

/**
 * GET /api/fields
 * 代理转发到 POS 后端的字段注册表接口
 * Studio 前端不感知这是一个代理
 */
router.get('/fields', fieldsController.getFields.bind(fieldsController))

export default router
