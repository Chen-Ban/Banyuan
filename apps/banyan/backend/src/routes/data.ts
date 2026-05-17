import Router from '@koa/router'
import { DataController } from '../controllers/DataController.js'

const router = new Router({ prefix: '/api/apps/:appId/data' })

// GET    /api/apps/:appId/data/:collectionName          列表查询
router.get('/:collectionName', DataController.list)

// GET    /api/apps/:appId/data/:collectionName/:id      单条查询
router.get('/:collectionName/:id', DataController.getById)

// POST   /api/apps/:appId/data/:collectionName          创建
router.post('/:collectionName', DataController.create)

// PUT    /api/apps/:appId/data/:collectionName/:id      更新
router.put('/:collectionName/:id', DataController.updateById)

// DELETE /api/apps/:appId/data/:collectionName/:id      删除
router.delete('/:collectionName/:id', DataController.deleteById)

export default router
