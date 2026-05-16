import Router from '@koa/router'
import fieldsController from '../controllers/FieldsController.js'

const router = new Router({ prefix: '/api' })

/**
 * GET /api/fields
 * 返回字段注册表（分组结构）
 * Studio 后端通过代理调用此接口
 */
router.get('/fields', fieldsController.getFields.bind(fieldsController))

export default router
