import mongoose from 'mongoose'
import { User } from '../models/User.js'
import Conversation from '../models/Conversation.js'

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
    console.log(`📦 MongoDB connected: ${MONGODB_URI}`)

    // 同步索引：自动 drop 旧的非稀疏索引，重建为 Schema 中声明的索引
    await User.syncIndexes()
    // 清除 V1 遗留的 id_1 唯一索引（当前 schema 已无 id 字段）
    await Conversation.syncIndexes()
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
