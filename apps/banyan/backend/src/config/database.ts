import mongoose from 'mongoose'

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
