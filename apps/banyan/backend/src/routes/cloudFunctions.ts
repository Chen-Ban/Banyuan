/**
 * /api/apps/:appId/cloud-functions — 云函数 CRUD 路由
 *
 * 云函数是应用级的 FlowSchema 定义，通过可视化流程编辑器创建，
 * 可被页面中的组件事件绑定调用。
 */

import Router from '@koa/router'
import cloudFunctionController from '../controllers/CloudFunctionController.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/apps/:appId/cloud-functions' })

// 所有云函数路由需要校验 appId 归属
router.use(appOwnership)

router.get('/', cloudFunctionController.list.bind(cloudFunctionController))
router.get('/:functionId', cloudFunctionController.getOne.bind(cloudFunctionController))
router.post('/', cloudFunctionController.create.bind(cloudFunctionController))
router.put('/:functionId', cloudFunctionController.update.bind(cloudFunctionController))
router.del('/:functionId', cloudFunctionController.remove.bind(cloudFunctionController))

export default router
