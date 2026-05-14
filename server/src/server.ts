// ============================================================
// src/server.ts — Server entry point
// ============================================================

import 'dotenv/config'
import { createApp } from './app'

const PORT = parseInt(process.env.PORT || '5000', 10)
const HOST = process.env.HOST || '0.0.0.0'

const app = createApp()

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running at http://${HOST}:${PORT}`)
  console.log(`📝 API Documentation at http://${HOST}:${PORT}/api`)
  console.log(`🏥 Health check at http://${HOST}:${PORT}/health`)
})

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})
