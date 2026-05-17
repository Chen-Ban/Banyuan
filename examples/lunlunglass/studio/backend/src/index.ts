import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function main() {
  await connectDatabase()
  app.listen(PORT, () => {
    console.log(`[Studio Backend] Server running on http://localhost:${PORT}`)
    console.log(`[Studio Backend] POS_API_URL: ${process.env.POS_API_URL || '(not set)'}`)
  })
}

main().catch((err) => {
  console.error('[Studio Backend] Failed to start:', err)
  process.exit(1)
})
