import Router from '@koa/router'
import uploadController from '../controllers/UploadController'

const router = new Router({
  prefix: '/api/upload',
})

/**
 * POST /api/upload
 * 上传单个文件
 */
router.post('/', uploadController.uploadFile.bind(uploadController))

/**
 * POST /api/upload/multiple
 * 上传多个文件
 */
router.post('/multiple', uploadController.uploadMultiple.bind(uploadController))

export default router
