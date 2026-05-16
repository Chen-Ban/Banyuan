import Router from '@koa/router'
import templateController from '../controllers/TemplateController.js'

const router = new Router({ prefix: '/api/templates' })

/** GET /api/templates/published — 已发布模板列表（供 POS 拉取，不含背景图） */
router.get('/published', templateController.getPublishedTemplates.bind(templateController))

/** GET /api/templates/snapshots/:snapshotId — 快照详情（含背景图） */
router.get('/snapshots/:snapshotId', templateController.getSnapshotById.bind(templateController))

/** GET /api/templates — 模板列表 */
router.get('/', templateController.getTemplateList.bind(templateController))

/** GET /api/templates/:id — 模板详情 */
router.get('/:id', templateController.getTemplateById.bind(templateController))

/** POST /api/templates — 创建模板 */
router.post('/', templateController.createTemplate.bind(templateController))

/** PUT /api/templates/:id — 更新模板 */
router.put('/:id', templateController.updateTemplate.bind(templateController))

/** DELETE /api/templates/:id — 删除模板 */
router.delete('/:id', templateController.deleteTemplate.bind(templateController))

/** POST /api/templates/:id/publish — 发布模板（生成快照） */
router.post('/:id/publish', templateController.publishTemplate.bind(templateController))

export default router
