import Router from '@koa/router'
import applicationController from '../controllers/ApplicationController'

const router = new Router({
  prefix: '/api/applications',
})

router.get('/', applicationController.getApplicationList.bind(applicationController))
router.get('/:id', applicationController.getApplicationById.bind(applicationController))
router.post('/', applicationController.createApplication.bind(applicationController))
router.put('/:id', applicationController.updateApplication.bind(applicationController))
router.delete('/:id', applicationController.deleteApplication.bind(applicationController))

export default router
