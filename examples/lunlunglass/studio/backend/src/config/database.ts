import mongoose from 'mongoose'

/**
 * 连接 MongoDB 数据库（Studio 专用数据库）
 */
export async function connectDatabase(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'lunlunglass_studio'}`

  try {
    await mongoose.connect(uri)
    console.log(`[Studio] MongoDB connected: ${uri}`)
  } catch (error) {
    console.error('[Studio] MongoDB connection failed:', error)
    process.exit(1)
  }
}
