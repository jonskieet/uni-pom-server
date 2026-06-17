// ============================================================
// scripts/migrate-attendance-modules.ts
// Script chạy 1 lần để cập nhật roles/modules đã lưu trong DB
// (bảng system_settings, key='roles' và key='modules')
//
// Chạy: npx ts-node scripts/migrate-attendance-modules.ts
// hoặc: node -r ts-node/register scripts/migrate-attendance-modules.ts
// ============================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const NEW_MODULES = [
  { key: 'attendance',            label: 'Chấm công',                icon: 'ti-calendar-event',  group: 'Nhân sự', isSystem: true },
  { key: 'business-trip',         label: 'Chi phí công tác',         icon: 'ti-plane-departure', group: 'Nhân sự', isSystem: true },
  { key: 'accounting-attendance', label: 'Quản lý chấm công',        icon: 'ti-clipboard-list',  group: 'Kế toán',  isSystem: true },
  { key: 'accounting-trip',       label: 'Quản lý chi phí công tác', icon: 'ti-receipt',         group: 'Kế toán',  isSystem: true },
]

const NEW_ACCOUNTING_ROLE = {
  key: 'accounting', label: 'Kế toán', color: '#9D174D', bg: '#FCE7F3', icon: 'ti-calculator', isSystem: true,
  modules: ['dashboard', 'accounting-attendance', 'accounting-trip', 'attendance'],
}

async function main() {
  console.log('🔄 Đang đọc cấu hình roles/modules hiện tại từ DB...')

  const rows = await prisma.$queryRawUnsafe<{ key: string; value: any }[]>(
    `SELECT key, value FROM public.system_settings WHERE key = ANY($1::text[])`,
    ['roles', 'modules']
  )

  const current: Record<string, any> = {}
  for (const r of rows) current[r.key] = r.value

  // ── 1. Cập nhật MODULES ─────────────────────────────────
  let modules: any[] = Array.isArray(current.modules) ? current.modules : []
  if (modules.length === 0) {
    console.log('⚠️  Không tìm thấy "modules" trong DB — bỏ qua (FE sẽ dùng DEFAULT_MODULES code).')
  } else {
    const existingKeys = new Set(modules.map((m: any) => m.key))
    for (const nm of NEW_MODULES) {
      if (!existingKeys.has(nm.key)) {
        modules.push(nm)
        console.log(`  + Thêm module: ${nm.key}`)
      }
    }
  }

  // ── 2. Cập nhật ROLES ────────────────────────────────────
  let roles: any[] = Array.isArray(current.roles) ? current.roles : []
  if (roles.length === 0) {
    console.log('⚠️  Không tìm thấy "roles" trong DB — bỏ qua (FE sẽ dùng DEFAULT_ROLES code).')
  } else {
    for (const role of roles) {
      if (role.key === 'admin') {
        // Admin: thêm hết module mới (trừ những module chỉ-thao-tác mà admin không cần)
        for (const nm of NEW_MODULES) {
          if (!role.modules.includes(nm.key)) role.modules.push(nm.key)
        }
        console.log(`  ✓ admin: đã có đủ modules`)
        continue
      }
      if (role.key === 'accounting') {
        continue // sẽ xử lý riêng ở dưới
      }
      if (role.key === 'sales_admin' || role.key === 'sale_admin') {
        // Sale Admin: CÓ chấm công, KHÔNG có chi phí công tác
        if (!role.modules.includes('attendance')) role.modules.push('attendance')
        console.log(`  ✓ ${role.key}: + attendance (không thêm business-trip theo yêu cầu)`)
        continue
      }
      // Toàn bộ role còn lại (sales, technical, technical_lead, và mọi role custom khác)
      // trừ admin/accounting/sales_admin → có cả attendance + business-trip
      if (!role.modules.includes('attendance'))    role.modules.push('attendance')
      if (!role.modules.includes('business-trip')) role.modules.push('business-trip')
      console.log(`  ✓ ${role.key}: + attendance + business-trip`)
    }

    // Thêm role "accounting" nếu chưa có
    const hasAccounting = roles.some((r: any) => r.key === 'accounting')
    if (!hasAccounting) {
      roles.push(NEW_ACCOUNTING_ROLE)
      console.log('  + Thêm role mới: accounting (Kế toán)')
    } else {
      console.log('  i  Role "accounting" đã tồn tại — giữ nguyên modules hiện có')
    }
  }

  // ── 3. Ghi lại vào DB ────────────────────────────────────
  if (modules.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE public.system_settings SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = 'modules'`,
      JSON.stringify(modules)
    )
    console.log('✅ Đã cập nhật "modules" trong DB')
  }
  if (roles.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE public.system_settings SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE key = 'roles'`,
      JSON.stringify(roles)
    )
    console.log('✅ Đã cập nhật "roles" trong DB')
  }

  console.log('\n🎉 Hoàn tất migration roles/modules cho chấm công & công tác phí!')
  console.log('👉 Người dùng cần đăng xuất và đăng nhập lại để nhận quyền mới.')
}

main()
  .catch((e) => { console.error('❌ Lỗi migration:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
