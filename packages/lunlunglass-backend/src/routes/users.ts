import Router from 'koa-router'
import userController from '../controllers/UserController'

const router = new Router({
  prefix: '/api/users',
})

/**
 * GET /api/users
 * 获取用户列表（支持查询条件：username, userId, email, phone）
 * Query参数: page, pageSize
 */
router.get('/', userController.getUserList.bind(userController))

/**
 * GET /api/users/:id
 * 根据ID获取用户详情
 */
router.get('/:id', userController.getUserById.bind(userController))

/**
 * POST /api/users
 * 创建用户
 */
router.post('/', userController.createUser.bind(userController))

/**
 * PUT /api/users/:id
 * 更新用户
 */
router.put('/:id', userController.updateUser.bind(userController))

/**
 * DELETE /api/users/:id
 * 删除用户
 */
router.delete('/:id', userController.deleteUser.bind(userController))

export default router

