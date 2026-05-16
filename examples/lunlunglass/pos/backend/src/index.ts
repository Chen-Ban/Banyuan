import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

async function main() {
  await connectDatabase()
  app.listen(PORT, () => {
    console.log(`[POS Backend] Server running on http://localhost:${PORT}`)
    console.log(`[POS Backend] STUDIO_URL: ${process.env.STUDIO_URL || '(not set)'}`)
  })
}

main().catch((err) => {
  console.error('[POS Backend] Failed to start:', err)
  process.exit(1)
})
