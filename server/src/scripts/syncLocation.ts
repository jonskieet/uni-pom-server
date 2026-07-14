// ============================================================
// server/src/scripts/syncLocation.ts
// Sync 63 tỉnh + toàn bộ quận/huyện từ DVCQG vào Supabase DB
//
// Chạy từ thư mục server/:
//   npx tsx src/scripts/syncLocation.ts
// ============================================================
import 'dotenv/config'          // ← load DATABASE_URL từ server/.env
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Kiểm tra kết nối
  console.log('🔌 DATABASE_URL:', process.env.DATABASE_URL?.slice(0, 40) + '...')

  console.log('⏳ Fetching provinces from DVCQG API...')
  const resp = await fetch('https://provinces.open-api.vn/api/?depth=2')
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const provinces = (await resp.json()) as any[]
  console.log(`✅ Got ${provinces.length} provinces from API`)

  let pCount = 0, dCount = 0

  for (const p of provinces) {
    const [province] = await prisma.$queryRaw<any[]>`
      INSERT INTO provinces (code, name, short_name, is_active)
      VALUES (${String(p.code)}, ${p.name}, ${p.codename ?? ''}, true)
      ON CONFLICT (code) DO UPDATE
        SET name       = EXCLUDED.name,
            short_name = EXCLUDED.short_name
      RETURNING id, code, name
    `
    pCount++

    for (const d of (p.districts ?? [])) {
      await prisma.$queryRaw`
        INSERT INTO districts (province_id, code, name, type, is_active)
        VALUES (
          ${province.id},
          ${String(d.code)},
          ${d.name},
          ${d.division_type ?? 'quan'},
          true
        )
        ON CONFLICT (code) DO UPDATE
          SET name        = EXCLUDED.name,
              type        = EXCLUDED.type,
              province_id = EXCLUDED.province_id
      `
      dCount++
    }

    process.stdout.write(`\r  ✔ ${pCount}/63 tỉnh — ${dCount} quận/huyện`)
  }

  console.log(`\n\n🎉 Xong: ${pCount} tỉnh/thành, ${dCount} quận/huyện đã sync vào DB`)
}

main()
  .catch(e => {
    console.error('\n❌ Lỗi:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())