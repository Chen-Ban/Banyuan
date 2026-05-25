import app from './app'
import { startCheckpointCleanup } from './checkpoint/cleanup.js'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002

app.listen(PORT, () => {
    console.log(`[XiangDi Server] running at http://localhost:${PORT}`)
    console.log(`[XiangDi Server] POST /ai/run  — AI Agent SSE endpoint`)
    console.log(`[XiangDi Server] POST /ai/resume — Checkpoint resume endpoint`)
    console.log(`[XiangDi Server] GET  /ai/thread/:threadId/status — Thread status`)

    // 启动 checkpoint 过期清理定时任务
    startCheckpointCleanup()
})
