// ============================================================
// src/server.ts — Server entry point
// ============================================================

import 'dotenv/config'
import { createApp } from './app'

// ============================================================
// FIX: "TypeError: Do not know how to serialize a BigInt"
// Khi dùng prisma.$queryRawUnsafe với PostgreSQL, các cột kiểu
// BIGINT / kết quả COUNT(*) sẽ được Prisma trả về dưới dạng
// JS BigInt (chứ không phải Number). JSON.stringify() (dùng bởi
// Express trong res.json()) không tự serialize được BigInt và
// sẽ throw lỗi này, khiến API trả lỗi 500 hàng loạt — chính là
// nguyên nhân các lỗi "net::ERR_INSUFFICIENT_RESOURCES" phía
// client (do client retry liên tục mỗi khi request thất bại).
//
// Khắc phục triệt để: dạy cho BigInt cách tự serialize sang JSON
// bằng cách chuyển về Number (an toàn vì các giá trị BigInt thực
// tế trong app này chỉ là id / số lượng đếm, không vượt quá
// Number.MAX_SAFE_INTEGER).
;(BigInt.prototype as any).toJSON = function () {
  return Number(this)
}

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