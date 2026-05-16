import { User, IUser, IOptometryParams } from '../models/index.js'
import { Types } from 'mongoose'

/**
 * 用户查询条件
 */
export interface IUserQuery {
  username?: string
  userId?: string
  email?: string
  phone?: string
}

/**
 * 用户查询结果
 */
export interface IUserListResult {
  users: IUser[]
  total: number
  page: number
  pageSize: number
}

/**
 * 用户服务
 */
class UserService {
  /**
   * 查询用户列表
   * @param query 查询条件
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   */
  async getUserList(
    query: IUserQuery = {},
    page: number = 1,
    pageSize: number = 12
  ): Promise<IUserListResult> {
    try {
      // 构建查询条件
      const filter: any = {}

      if (query.username) {
        filter.username = { $regex: query.username, $options: 'i' }
      }

      if (query.userId) {
        filter.userId = { $regex: query.userId, $options: 'i' }
      }

      if (query.email) {
        filter.email = { $regex: query.email, $options: 'i' }
      }

      if (query.phone) {
        filter.phone = { $regex: query.phone, $options: 'i' }
      }

      // 计算跳过的数量
      const skip = (page - 1) * pageSize

      // 并行查询总数和列表
      const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
          .sort({ createdAt: -1 }) // 按创建时间倒序
          .skip(skip)
          .limit(pageSize)
          .lean(), // 返回纯 JavaScript 对象
      ])

      return {
        users: users as unknown as IUser[],
        total,
        page,
        pageSize,
      }
    } catch (error) {
      throw new Error(`Failed to get user list: ${error}`)
    }
  }

  /**
   * 根据ID获取用户
   * @param id 用户ID（MongoDB _id 或 userId）
   */
  async getUserById(id: string): Promise<IUser | null> {
    try {
      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        const user = await User.findById(id).lean()
        if (user) return user as unknown as IUser
      }

      // 如果不是 ObjectId 或查询失败，尝试作为 userId 查询
      const user = await User.findOne({ userId: id }).lean()
      return user as unknown as IUser | null
    } catch (error) {
      throw new Error(`Failed to get user: ${error}`)
    }
  }

  /**
   * 创建用户
   * @param userData 用户数据
   */
  async createUser(userData: {
    userId: string
    username: string
    email?: string
    phone?: string
    optometry?: IOptometryParams
  }): Promise<IUser> {
    try {
      // 检查 userId 是否已存在
      const existingUser = await User.findOne({ userId: userData.userId })
      if (existingUser) {
        throw new Error(`User with userId "${userData.userId}" already exists`)
      }

      const user = new User(userData)
      await user.save()
      return user.toObject() as unknown as IUser
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        throw error
      }
      throw new Error(`Failed to create user: ${error.message || error}`)
    }
  }

  /**
   * 更新用户
   * @param id 用户ID（MongoDB _id 或 userId）
   * @param updateData 更新数据（不能包含 userId）
   */
  async updateUser(
    id: string,
    updateData: {
      username?: string
      email?: string
      phone?: string
      optometry?: IOptometryParams
    }
  ): Promise<IUser | null> {
    try {
      let user

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        user = await User.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 userId 查询
        user = await User.findOne({ userId: id })
      }

      if (!user) {
        return null
      }

      // 更新字段
      if (updateData.username !== undefined) {
        user.username = updateData.username
      }
      if (updateData.email !== undefined) {
        user.email = updateData.email
      }
      if (updateData.phone !== undefined) {
        user.phone = updateData.phone
      }
      if (updateData.optometry !== undefined) {
        user.optometry = updateData.optometry
      }

      await user.save()
      return user.toObject() as unknown as IUser
    } catch (error: any) {
      throw new Error(`Failed to update user: ${error.message || error}`)
    }
  }

  /**
   * 删除用户
   * @param id 用户ID（MongoDB _id 或 userId）
   */
  async deleteUser(id: string): Promise<boolean> {
    try {
      let user

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        user = await User.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 userId 查询
        user = await User.findOne({ userId: id })
      }

      if (!user) {
        return false
      }

      await user.deleteOne()
      return true
    } catch (error: any) {
      throw new Error(`Failed to delete user: ${error.message || error}`)
    }
  }
}

export default new UserService()

