import mongoose from 'mongoose'

/**
 * 连接 MongoDB 数据库（POS 专用数据库）
 */
export async function connectDatabase(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'lunlunglass_pos'}`

  try {
    await mongoose.connect(uri)
    console.log(`[POS] MongoDB connected: ${uri}`)
  } catch (error) {
    console.error('[POS] MongoDB connection failed:', error)
    process.exit(1)
  }
}
