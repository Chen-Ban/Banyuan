import Router from '@koa/router'
import templateController from '../controllers/TemplateController'

const router = new Router({
  prefix: '/api/templates',
})

/**
 * GET /api/templates
 * 获取模板列表（支持查询条件：name, id）
 * Query参数: page, pageSize
 */
router.get('/', templateController.getTemplateList.bind(templateController))

/**
 * GET /api/templates/:id
 * 根据ID获取模板详情
 */
router.get('/:id', templateController.getTemplateById.bind(templateController))

/**
 * POST /api/templates
 * 创建模板
 */
router.post('/', templateController.createTemplate.bind(templateController))

/**
 * PUT /api/templates/:id
 * 更新模板
 */
router.put('/:id', templateController.updateTemplate.bind(templateController))

/**
 * DELETE /api/templates/:id
 * 删除模板
 */
router.delete('/:id', templateController.deleteTemplate.bind(templateController))

export default router

