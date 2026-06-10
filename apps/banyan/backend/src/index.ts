import 'dotenv/config'
import http from 'http'
import app from './app'
import { connectDatabase } from './config/database'
import { agentGateway } from './services/AgentGateway.js'
import { seedBuiltinMaterials } from './seeds/builtinMaterials.js'

const PORT = process.env.PORT || 3001

async function startServer() {
  try {
    await connectDatabase()
    console.log('✅ MongoDB connected')

    // Seed 内置物料（重建内置物料集合，不做向后兼容）
    const seeded = await seedBuiltinMaterials()
    console.log(`✅ Builtin materials seeded (${seeded} items)`)

    // 创建 HTTP server 并附加 WebSocket 网关（ADR-028）
    const server = http.createServer(app.callback())
    agentGateway.attach(server)
    console.log('✅ AgentGateway WebSocket attached at /ws/agent')

    server.listen(PORT, () => {
      console.log(`🌳 Banyan server is running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
