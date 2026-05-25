import app from './app.js'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003

app.listen(PORT, () => {
  console.log(`[Knowledge Server] running at http://localhost:${PORT}`)
  console.log(`[Knowledge Server] BanvasGL 知识服务 — 语义检索 + 向量化 + 知识持久化`)
  console.log(`[Knowledge Server] Endpoints:`)
  console.log(`  POST /knowledge/search  — 语义检索`)
  console.log(`  POST /knowledge/upsert  — 写入/更新知识`)
  console.log(`  POST /knowledge/embed   — 文本向量化`)
  console.log(`  GET  /knowledge/stats   — 知识库统计`)
  console.log(`  DELETE /knowledge/entries — 删除知识条目`)
})
