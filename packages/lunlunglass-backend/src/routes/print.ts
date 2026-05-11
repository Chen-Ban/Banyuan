import Router from '@koa/router'
import printController from '../controllers/PrintController'

const router = new Router({
  prefix: '/api/print',
})

/**
 * POST /api/print
 * 执行打印任务
 */
router.post('/', printController.print.bind(printController))

/**
 * POST /api/print/preview
 * 预览打印合成图片
 */
router.post('/preview', printController.preview.bind(printController))

// ── 字段映射 CRUD ──

/**
 * GET /api/print/mappings
 * 获取映射列表（需要 templateId 查询参数）
 */
router.get('/mappings', printController.getMappings.bind(printController))

/**
 * GET /api/print/mappings/:id
 * 获取单个映射详情
 */
router.get('/mappings/:id', printController.getMappingById.bind(printController))

/**
 * POST /api/print/mappings
 * 创建映射
 */
router.post('/mappings', printController.createMapping.bind(printController))

/**
 * PUT /api/print/mappings/:id
 * 更新映射
 */
router.put('/mappings/:id', printController.updateMapping.bind(printController))

/**
 * DELETE /api/print/mappings/:id
 * 删除映射
 */
router.delete('/mappings/:id', printController.deleteMapping.bind(printController))

export default router
