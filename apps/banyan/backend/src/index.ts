import 'dotenv/config'
import app from './app'
import { connectDatabase } from './config/database'

const PORT = process.env.PORT || 3001

async function startServer() {
  try {
    await connectDatabase()
    console.log('✅ MongoDB connected')

    app.listen(PORT, () => {
      console.log(`🌳 Banyan server is running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
