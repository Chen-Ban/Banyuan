import 'dotenv/config'
import app from './app'
import { connectDatabase } from './config/database'

const PORT = process.env.PORT || 3000

async function startServer() {
  try {
    // 连接数据库
    await connectDatabase()
    console.log('✅ MongoDB connected')

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

