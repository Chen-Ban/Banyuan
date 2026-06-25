import mongoose from 'mongoose'
import { User } from '../models/User.js'
import Conversation from '../models/Conversation.js'
import Material from '../models/Material.js'
import Application from '../models/Application.js'
import { logger } from '../utils/logger.js'

const MONGODB_HOST = process.env.MONGODB_HOST || 'localhost'
const MONGODB_PORT = process.env.MONGODB_PORT || '27017'
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'banyan'

const MONGODB_URI = process.env.MONGODB_URI || `mongodb://${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}`

/**
 * 连接 MongoDB 数据库
 */
export async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI)
    logger.info(`MongoDB connected: ${MONGODB_URI}`)

    // 同步索引：自动 drop 旧的非稀疏索引，重建为 Schema 中声明的索引
    await User.syncIndexes()
    // 清除 V1 遗留的 id_1 唯一索引（当前 schema 已无 id 字段）
    await Conversation.syncIndexes()
    // 清除旧版 material_id_1 唯一索引（当前 schema 改用 meta.id）
    await Material.syncIndexes()
    // 清除旧版 tenantId_appSlug sparse 索引，替换为 partialFilterExpression
    await Application.syncIndexes()
  } catch (error) {
    logger.error('MongoDB connection error', error)
    throw error
  }
}

/**
 * 断开 MongoDB 数据库连接
 */
export async function disconnectDatabase() {
  try {
    await mongoose.disconnect()
    logger.info('MongoDB connection closed')
  } catch (error) {
    logger.error('MongoDB disconnection error', error)
    throw error
  }
}
