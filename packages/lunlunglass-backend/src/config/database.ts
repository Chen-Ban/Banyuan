import mongoose from 'mongoose'

/**
 * MongoDB 连接配置
 * 使用默认配置：
 * - 主机: localhost
 * - 端口: 27017 (MongoDB 默认端口)
 * - 用户名: 无（默认不需要认证）
 * - 密码: 无（默认不需要认证）
 * - 数据库名: lunlunglass
 */
const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost'
const MONGODB_PORT = process.env.MONGODB_PORT || '27017'
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'lunlunglass'

// 构建 MongoDB 连接字符串
const MONGODB_URI = process.env.MONGODB_URI || `mongodb://${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}`

/**
 * 连接 MongoDB 数据库
 */
export async function connectDatabase() {
  try {
    const options: mongoose.ConnectOptions = {
      // 使用默认配置，不需要用户名和密码
    }

    await mongoose.connect(MONGODB_URI, options)
    console.log(`📦 MongoDB connected: ${MONGODB_URI}`)
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    throw error
  }
}

/**
 * 断开 MongoDB 数据库连接
 */
export async function disconnectDatabase() {
  try {
    await mongoose.disconnect()
    console.log('📦 MongoDB connection closed')
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error)
    throw error
  }
}

