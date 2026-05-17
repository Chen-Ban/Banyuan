import { Context } from 'koa'
import userService from '../services/UserService.js'
import { IOptometryParams } from '../models/index.js'

/**
 * 创建用户请求体
 */
interface CreateUserRequest {
  userId: string
  username: string
  email?: string
  phone?: string
  optometry?: IOptometryParams
}

/**
 * 更新用户请求体
 */
interface UpdateUserRequest {
  username?: string
  email?: string
  phone?: string
  optometry?: IOptometryParams
}

/**
 * 用户控制器
 */
class UserController {
  /**
   * 获取用户列表
   * GET /api/users
   * Query参数: username, userId, email, phone, page, pageSize
   */
  async getUserList(ctx: Context) {
    try {
      const {
        username,
        userId,
        email,
        phone,
        page = '1',
        pageSize = '12',
      } = ctx.query

      const query = {
        username: username as string | undefined,
        userId: userId as string | undefined,
        email: email as string | undefined,
        phone: phone as string | undefined,
      }

      // 移除 undefined 值
      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query]
      )

      const result = await userService.getUserList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10)
      )

      ctx.status = 200
      ctx.body = {
        success: true,
        data: result,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get user list',
      }
    }
  }

  /**
   * 根据ID获取用户详情
   * GET /api/users/:id
   */
  async getUserById(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = await userService.getUserById(id)

      if (!user) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'User not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: user,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get user',
      }
    }
  }

  /**
   * 创建用户
   * POST /api/users
   */
  async createUser(ctx: Context) {
    try {
      const userData = ctx.request.body as CreateUserRequest

      // 验证必填字段
      if (!userData.userId || !userData.username) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'userId and username are required',
        }
        return
      }

      const user = await userService.createUser(userData)

      ctx.status = 201
      ctx.body = {
        success: true,
        data: user,
        message: 'User created successfully',
      }
    } catch (error: any) {
      ctx.status = error.message.includes('already exists') ? 409 : 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to create user',
      }
    }
  }

  /**
   * 更新用户
   * PUT /api/users/:id
   */
  async updateUser(ctx: Context) {
    try {
      const { id } = ctx.params
      const updateData = ctx.request.body as UpdateUserRequest

      // 不允许更新 userId
      if ((updateData as any).userId) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'userId cannot be updated',
        }
        return
      }

      const user = await userService.updateUser(id, updateData)

      if (!user) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'User not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: user,
        message: 'User updated successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to update user',
      }
    }
  }

  /**
   * 删除用户
   * DELETE /api/users/:id
   */
  async deleteUser(ctx: Context) {
    try {
      const { id } = ctx.params
      const deleted = await userService.deleteUser(id)

      if (!deleted) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'User not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        message: 'User deleted successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to delete user',
      }
    }
  }
}

export default new UserController()

