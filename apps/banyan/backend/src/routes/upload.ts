import Router from '@koa/router'
import uploadController from '../controllers/UploadController'

const router = new Router({
  prefix: '/api/upload',
})

router.post('/', uploadController.uploadFile.bind(uploadController))
router.post('/multiple', uploadController.uploadMultiple.bind(uploadController))

export default router
