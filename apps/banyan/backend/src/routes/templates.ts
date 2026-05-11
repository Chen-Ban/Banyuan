import Router from '@koa/router'
import templateController from '../controllers/TemplateController'

const router = new Router({
  prefix: '/api/templates',
})

router.get('/', templateController.getTemplateList.bind(templateController))
router.get('/:id', templateController.getTemplateById.bind(templateController))
router.post('/', templateController.createTemplate.bind(templateController))
router.put('/:id', templateController.updateTemplate.bind(templateController))
router.delete('/:id', templateController.deleteTemplate.bind(templateController))

export default router
