import app from './app'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001

app.listen(PORT, () => {
    console.log(`[Banyuan Server] running at http://localhost:${PORT}`)
    console.log(`[Banyuan Server] health check: http://localhost:${PORT}/api/v1/health`)
})
