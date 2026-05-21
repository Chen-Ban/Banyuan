import app from './app'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002

app.listen(PORT, () => {
    console.log(`[XiangDi Server] running at http://localhost:${PORT}`)
    console.log(`[XiangDi Server] POST /ai/run  — AI Agent SSE endpoint`)
})
