import Router from '@koa/router'
import { FunctionController } from '../controllers/FunctionController.js'

const router = new Router({ prefix: '/api/apps/:appId/functions' })

// GET    /api/apps/:appId/functions           → 列表
router.get('/', FunctionController.listFunctions)

// GET    /api/apps/:appId/functions/:name      → 详情
router.get('/:name', FunctionController.getFunction)

// PUT    /api/apps/:appId/functions/:name      → 新增/更新
router.put('/:name', FunctionController.upsertFunction)

// DELETE /api/apps/:appId/functions/:name      → 删除
router.delete('/:name', FunctionController.deleteFunction)

// POST   /api/apps/:appId/functions/:name/validate → 代码校验
router.post('/:name/validate', FunctionController.validateFunction)

// POST   /api/apps/:appId/functions/:name/run  → 执行云函数
router.post('/:name/run', FunctionController.runFunction)

export default router
