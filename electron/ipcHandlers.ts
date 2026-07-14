// electron/ipcHandlers.ts
// Toàn bộ IPC handlers — thay getDb() SQLite bằng apiFetch() → Render server
// UI/pages/hooks KHÔNG thay đổi gì

import { ipcMain, app, dialog } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, setToken, apiUpload, apiUploadBuffer } from './api'
import {
  saveSession, loadSession, clearSession,
  saveRememberedUsername, loadRememberedUsername,
} from './tokenStore'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ── AUTH ──────────────────────────────────────────────────────

ipcMain.handle('users:login', async (_e, username: string, password_hash: string, remember: boolean = true) => {
  try {
    // apiFetch đã unwrap { success, data } → res = { token, user }
    const res = await api.post<{ token: string; user: any }>('/auth/login', {
      username,
      password: password_hash
    })
    setToken(res.token)

    // Lưu session xuống đĩa để lần mở app sau tự đăng nhập lại, trừ khi
    // người dùng bỏ tick "Ghi nhớ tài khoản" (dùng máy chung/máy lạ).
    if (remember) {
      saveSession(res.token)
      saveRememberedUsername(username)
    } else {
      clearSession()
      saveRememberedUsername(null)
    }

    // Fetch /auth/me ngay sau login để đảm bảo avatar_url luôn có
    // (phòng trường hợp login response thiếu field mới trong tương lai)
    try {
      const me = await api.get<any>('/auth/me')
      return { ...res.user, ...me, token: res.token }
    } catch {
      return { ...res.user, token: res.token }   // fallback về login response nếu /me lỗi
    }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ── Restore token sau khi renderer reload (sessionStorage → main process) ─
ipcMain.handle('auth:restoreToken', async (_e, token: string) => {
  if (token) setToken(token)
})

// ── Tự động đăng nhập lại khi mở app (đọc token đã lưu từ lần trước) ──────
// Gọi 1 lần lúc renderer khởi động. Nếu có token hợp lệ trên đĩa:
//   1. Set vào main process để các request kế tiếp có Authorization header
//   2. Gọi /auth/refresh để vừa xác thực vừa "trượt" hạn token thêm 30 ngày
//      (sliding session — người dùng càng mở app thường thì càng ít khi
//      bị bắt đăng nhập lại do token hết hạn)
//   3. Trả user về renderer để vào thẳng dashboard, không cần nhập gì
// Nếu không có token, hoặc token đã hết hạn/tài khoản bị khoá → trả null,
// renderer sẽ hiển thị LoginPage như bình thường.
ipcMain.handle('auth:tryAutoLogin', async () => {
  const token = loadSession()
  if (!token) return null

  setToken(token)
  try {
    const res = await api.post<{ token: string; user: any }>('/auth/refresh', {})
    setToken(res.token)
    saveSession(res.token)   // lưu token mới (hạn dài hơn) thay token cũ
    return { ...res.user, token: res.token }
  } catch {
    // Token hỏng/hết hạn/tài khoản bị khoá → dọn session, bắt đăng nhập lại
    clearSession()
    setToken(null)
    return null
  }
})

// ── Đăng xuất: xoá session đã lưu (giữ lại username nếu người dùng vẫn
// muốn nhớ tên đăng nhập cho lần đăng nhập kế tiếp) ───────────────────────
ipcMain.handle('auth:logout', async () => {
  clearSession()
  setToken(null)
})

// ── Ghi nhớ / lấy tên đăng nhập đã nhớ (không liên quan token) ───────────
ipcMain.handle('auth:getRememberedUsername', async () => {
  return loadRememberedUsername()
})

ipcMain.handle('users:getAll', async () => {
  try { return await api.get('/users') }
  catch { return [] }
})

ipcMain.handle('users:create', async (_e, data: any) => {
  try { return await api.post('/users', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:update', async (_e, id: number, data: any) => {
  try {
    // Normalise is_active: Prisma expects Boolean, frontend sends 0/1
    const payload = { ...data }
    if (payload.is_active !== undefined && payload.is_active !== null) {
      payload.is_active =
        payload.is_active === true || payload.is_active === 1 || payload.is_active === '1'
    }
    return await api.put(`/users/${id}`, payload)
  }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:updateAvatar', async (_e, id: number, avatar_url: string) => {
  try { return await api.put(`/users/${id}/avatar`, { avatar_url }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:updateEmail', async (_e, id: number, email: string | null) => {
  try { return await api.put(`/users/${id}/email`, { email }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:resetPassword', async (_e, id: number, password: string) => {
  try { return await api.put(`/users/${id}/reset-password`, { password }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:delete', async (_e, id: number) => {
  try { return await api.delete(`/users/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── USERS — Thông tin ngân hàng (QR chuyển khoản) ────────────────
ipcMain.handle('users:getBankInfo', async () => {
  try { return await api.get('/users/bank-info') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:saveBankInfo', async (_e, data: any) => {
  try { return await api.put('/users/bank-info', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:getBankInfoByUserId', async (_e, userId: number) => {
  try { return await api.get(`/users/${userId}/bank-info`) }
  catch (err: any) { return { error: err.message } }
})

// ── BRANDS ────────────────────────────────────────────────────

ipcMain.handle('brands:getAll', async () => {
  try { return await api.get('/brands') }
  catch { return [] }
})

ipcMain.handle('brands:create', async (_e, data: any) => {
  try { return await api.post('/brands', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('brands:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/brands/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('brands:delete', async (_e, id: number) => {
  try { return await api.delete(`/brands/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── CATEGORIES ───────────────────────────────────────────────

ipcMain.handle('categories:getAll', async (_e, params: any) => {
  try {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)]))
    ).toString() : ''
    return await api.get(`/categories${qs}`)
  } catch { return [] }
})

ipcMain.handle('categories:getById', async (_e, id: number) => {
  try { return await api.get(`/categories/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('categories:create', async (_e, data: any) => {
  try { return await api.post('/categories', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('categories:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/categories/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('categories:delete', async (_e, id: number) => {
  try { return await api.delete(`/categories/${id}`) }
  catch (err: any) { return { error: err.message } }
})
// ── SETTINGS (roles & modules stored in DB) ───────────────────

ipcMain.handle('settings:getAll', async () => {
  try { return await api.get('/settings') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('settings:get', async (_e, key: string) => {
  try { return await api.get(`/settings/${key}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('settings:set', async (_e, key: string, value: any) => {
  try { return await api.put(`/settings/${key}`, { value }) }
  catch (err: any) { return { error: err.message } }
})


// ── SOLUTIONS ────────────────────────────────────────────────

ipcMain.handle('solutions:getAll', async () => {
  try { return await api.get('/solutions') }
  catch { return [] }
})
ipcMain.handle('solutions:getById', async (_e, id: number) => {
  try { return await api.get(`/solutions/${id}`) }
  catch (err: any) { return { error: err.message } }
})
ipcMain.handle('solutions:create', async (_e, data: any) => {
  try { return await api.post('/solutions', data) }
  catch (err: any) { return { error: err.message } }
})
ipcMain.handle('solutions:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/solutions/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})
ipcMain.handle('solutions:delete', async (_e, id: number) => {
  try { return await api.delete(`/solutions/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── PRODUCTS ─────────────────────────────────────────────────

ipcMain.handle('products:getAll', async (_e, filters: any) => {
  try { return await api.get('/products', filters) }
  catch { return [] }
})

ipcMain.handle('products:getById', async (_e, id: number) => {
  try { return await api.get(`/products/${id}`) }
  catch { return null }
})

ipcMain.handle('products:create', async (_e, data: any) => {
  return await api.post('/products', data)  // để lỗi tự throw lên renderer
})

ipcMain.handle('products:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/products/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('products:delete', async (_e, id: number) => {
  try { return await api.delete(`/products/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('products:getPriceHistory', async (_e, id: number) => {
  try { return await api.get(`/products/${id}/price-history`) }
  catch { return [] }
})

// ── POMS ─────────────────────────────────────────────────────

ipcMain.handle('poms:getAll', async (_e, filters: any) => {
  try {
    const res = await api.get<any>('/poms', filters)
    const list = Array.isArray(res) ? res : (res?.data ?? [])
    const mapped = list.map((pom: any) => ({
      ...pom,
      item_count:   pom.item_count   ?? (Array.isArray(pom.items) ? pom.items.length : 0),
      total_amount: pom.total_amount ?? (Array.isArray(pom.items)
        ? pom.items.reduce((s: number, i: any) =>
            s + Number(i.unit_price) * Number(i.quantity) * (1 + Number(i.vat_rate)), 0)
        : 0),
    }))
    return Array.isArray(res) ? mapped : { ...res, data: mapped }
  }
  catch { return [] }
})

ipcMain.handle('poms:getById', async (_e, id: number) => {
  try {
    const pom = await api.get<any>(`/poms/${id}`)
    if (!pom) return null
    // Flatten nested product/brand/category fields for each item
    if (Array.isArray(pom.items)) {
      pom.items = pom.items.map((item: any) => {
        const p = item.product ?? {}
        const b = p.brand ?? {}
        const c = p.category ?? {}
        return {
          ...item,
          product_name:  item.product_name  ?? p.name ?? '',
          part_number:   item.part_number   ?? p.part_number ?? null,
          unit:          item.unit          ?? p.unit ?? 'Cái',
          brand_name:    item.brand_name    ?? b.name ?? '',
          brand_short:   item.brand_short   ?? b.short_name ?? b.name ?? '',
          category_name: item.category_name ?? c.name ?? '',
          total_price:   item.total_price   ?? (Number(item.unit_price) * Number(item.quantity) * (1 + Number(item.vat_rate))),
          spec:          item.spec          ?? p.spec          ?? '',
          warranty:      item.warranty      ?? p.warranty      ?? '',
          origin:        item.origin        ?? b.country       ?? '',   // xuất xứ lấy từ hãng
        }
      })
    }
    return pom
  } catch { return null }
})

ipcMain.handle('poms:create', async (_e, data: any) => {
  // Để lỗi tự throw lên renderer, giống products:create
  return await api.post('/poms', data)
})

ipcMain.handle('poms:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/poms/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:approve', async (_e, id: number) => {
  return await api.put(`/poms/${id}/approve`, {})
})

ipcMain.handle('poms:updateStatus', async (_e, id: number, status: string, reviewer?: number) => {
  try { return await api.put(`/poms/${id}/status`, { status, reviewer }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:return', async (_e, id: number, reason: string) => {
  try { return await api.put(`/poms/${id}/return`, { reason }) }
  catch (err: any) { return { error: err.message } }
})

// ── State machine v2 ──────────────────────────────────────────

ipcMain.handle('poms:submit', async (_e, id: number) => {
  try { return await api.put(`/poms/${id}/submit`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:reapprove', async (_e, id: number) => {
  try { return await api.put(`/poms/${id}/reapprove`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:price', async (_e, id: number, data: { assigned_sale_id: number; items?: any[] }) => {
  try { return await api.put(`/poms/${id}/price`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:sendToClient', async (_e, id: number) => {
  try { return await api.put(`/poms/${id}/send`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:feedback', async (_e, id: number, note?: string) => {
  try { return await api.put(`/poms/${id}/feedback`, { note }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:returnToPrice', async (_e, id: number, reason: string) => {
  try { return await api.put(`/poms/${id}/return-price`, { reason }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:returnToTech', async (_e, id: number, reason: string) => {
  try { return await api.put(`/poms/${id}/return-tech`, { reason }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('poms:close', async (_e, id: number, result: 'won' | 'lost', note?: string) => {
  try { return await api.put(`/poms/${id}/close`, { result, note }) }
  catch (err: any) { return { error: err.message } }
})

// Kỹ thuật gửi lại cho Sale sau khi sửa theo yêu cầu (revision_tech → pricing_done)
ipcMain.handle('poms:resubmitToSale', async (_e, id: number) => {
  try { return await api.put(`/poms/${id}/status`, { status: 'pricing_done' }) }
  catch (err: any) { return { error: err.message } }
})

// ── Admin dashboard ───────────────────────────────────────────

ipcMain.handle('admin:getDashboard', async () => {
  try { return await api.get('/admin/dashboard') }
  catch { return null }
})

ipcMain.handle('admin:getAllPoms', async (_e, filters?: any) => {
  try {
    const res = await api.get<any>('/admin/poms', filters)
    return Array.isArray(res) ? res : (res?.data ?? [])
  }
  catch { return [] }
})

ipcMain.handle('admin:getPomTimeline', async (_e, pomId: number) => {
  try { return await api.get(`/admin/poms/${pomId}/timeline`) }
  catch { return null }
})

ipcMain.handle('admin:getKpi', async (_e, days?: number) => {
  try { return await api.get('/admin/kpi', days ? { days } : undefined) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('admin:getPriceHistory', async (_e, params?: any) => {
  try { return await api.get('/admin/price-history', params) }
  catch { return [] }
})

ipcMain.handle('poms:delete', async (_e, id: number) => {
  try { return await api.delete(`/poms/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('pomItems:upsert', async (_e, pom_id: number, items: any[]) => {
  try { return await api.put(`/poms/${pom_id}/items`, { items }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('pomItems:updateItem', async (_e, itemId: number, data: any) => {
  try { return await api.put(`/poms/items/${itemId}`, data) }
  catch (err: any) { return { error: err.message } }
})

// ── EXPORT EXCEL (chạy local trong Electron, không qua server) ──

ipcMain.handle('poms:exportExcel', async (_e, id: number, isPreview: boolean) => {
  try {
    const ExcelJS = require('exceljs')

    const pom   = await api.get<any>(`/poms/${id}`)
    const items = pom.items ?? []

    const { filePath } = await dialog.showSaveDialog({
      title: 'Xuất POM ra Excel',
      defaultPath: path.join(
        app.getPath('downloads'),
        `${pom.pom_code}${isPreview ? '_preview' : ''}.xlsx`
      ),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (!filePath) return { success: false, error: 'Hủy' }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'UNI POM System'
    const ws = wb.addWorksheet('POM')

    ws.mergeCells('A1:I1')
    const titleCell = ws.getCell('A1')
    titleCell.value = isPreview
      ? '⚠  PHIẾU ĐỀ XUẤT VẬT TƯ — BẢN PREVIEW (CHƯA DUYỆT)'
      : 'PHIẾU ĐỀ XUẤT VẬT TƯ — ĐÃ DUYỆT'
    titleCell.font  = { bold: true, size: 14, color: { argb: isPreview ? 'FF854F0B' : 'FF0C447C' } }
    titleCell.alignment = { horizontal: 'center' }
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPreview ? 'FFFAEEDA' : 'FFE6F1FB' } }
    ws.getRow(1).height = 30

    const info = [
      ['Mã POM:',     pom.pom_code,          'Giải pháp:',  pom.solution_name ?? '—'],
      ['Dự án:',      pom.project_name,       'Khách hàng:', pom.customer_name ?? '—'],
      ['Người tạo:',  pom.created_by_name,    'Ngày tạo:',   new Date(pom.created_at).toLocaleDateString('vi-VN')],
      ['Trạng thái:', isPreview ? 'Preview — chưa duyệt' : 'Đã duyệt',
       'Người duyệt:', pom.reviewed_by_name ?? '—'],
    ]

    info.forEach((row, i) => {
      const r = ws.getRow(i + 2)
      r.values = ['', row[0], row[1], '', row[2], row[3]]
      r.getCell(2).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } }
      r.getCell(4).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } }
      r.getCell(3).font = { size: 10 }
      r.getCell(6).font = { size: 10 }
      r.height = 18
    })

    if (pom.note) {
      ws.getRow(6).values = ['', 'Ghi chú:', pom.note]
      ws.getRow(6).getCell(2).font = { bold: true, size: 10, color: { argb: 'FF6B7280' } }
      ws.getRow(6).height = 18
    }

    const headerRow = ws.getRow(8)
    const headers   = ['#', 'Tên thiết bị', 'Mã Part', 'Hãng', 'Danh mục', 'ĐVT', 'Số lượng', 'Đơn giá', 'VAT', 'Thành tiền']
    headerRow.values = ['', ...headers]
    headerRow.height = 22
    headerRow.eachCell((cell: any, col: number) => {
      if (col < 2) return
      cell.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3C3489' } }
      cell.alignment = { horizontal: col >= 8 ? 'right' : col === 7 ? 'center' : 'left', vertical: 'middle' }
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF185FA5' } } }
    })

    items.forEach((item: any, i: number) => {
      const r = ws.getRow(9 + i)
      r.values = [
        '', i + 1, item.product_name, item.part_number ?? '—',
        item.brand_short ?? item.brand_name, item.category_name,
        item.unit, item.quantity, item.unit_price,
        (item.vat_rate * 100).toFixed(0) + '%', item.total_price,
      ]
      r.height = 18
      r.eachCell((cell: any, col: number) => {
        if (col < 2) return
        cell.font = { size: 10 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB' } }
        if (col === 8 || col === 9 || col === 11) cell.alignment = { horizontal: 'right' }
        if (col === 9 || col === 11) cell.numFmt = '#,##0'
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
      })
    })

    const totalRow    = items.length + 9
    const totalAmount = items.reduce((s: number, i: any) => s + (i.total_price ?? 0), 0)
    const sumRow      = ws.getRow(totalRow)
    sumRow.values     = ['', '', '', '', '', '', '', '', 'Tổng cộng (đã VAT):', '', totalAmount]
    sumRow.height     = 22
    sumRow.getCell(10).font      = { bold: true, size: 11 }
    sumRow.getCell(11).font      = { bold: true, size: 11, color: { argb: 'FF3C3489' } }
    sumRow.getCell(11).numFmt    = '#,##0'
    sumRow.getCell(11).alignment = { horizontal: 'right' }
    ws.mergeCells(`B${totalRow}:I${totalRow}`)
    sumRow.getCell(2).alignment = { horizontal: 'right' }
    sumRow.getCell(2).font      = { bold: true, size: 11 }

    if (isPreview) {
      const wRow = ws.getRow(totalRow + 2)
      wRow.values = ['', '⚠  Bản này chưa được duyệt chính thức — chỉ dùng để tham khảo trước khi xác nhận']
      wRow.getCell(2).font = { italic: true, size: 10, color: { argb: 'FF854F0B' } }
      wRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAEEDA' } }
      ws.mergeCells(`B${totalRow + 2}:K${totalRow + 2}`)
    }

    ws.columns = [
      { width: 2 }, { width: 5 }, { width: 38 }, { width: 16 },
      { width: 16 }, { width: 16 }, { width: 7 }, { width: 8 },
      { width: 14 }, { width: 7 }, { width: 16 },
    ]

    await wb.xlsx.writeFile(filePath)

    if (!isPreview) {
      await api.put(`/poms/${id}/status`, { status: 'exported' })
    }

    return { success: true, filePath }
  } catch (err: any) {
    console.error('[exportExcel]', err)
    return { success: false, error: err.message }
  }
})

// ── XUẤT BÁO GIÁ CHÍNH THỨC — fill vào mẫu Excel ──────────────

// ── Helper functions cho exportBaoGia (đặt ngoài handler để tránh lỗi TS) ──

function _xmlEsc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function _numCell(ref: string, s: number, val: number): string {
  return `<c r="${ref}" s="${s}"><v>${val}</v></c>`
}

function _strCell(ref: string, s: number, val: string): string {
  if (!val) return `<c r="${ref}" s="${s}"/>`
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${_xmlEsc(val)}</t></is></c>`
}

// Style indices từ template row 9
const _BG_STYLES = { A:51, B:52, C:53, D:53, E:53, F:54, G:54, H:55, I:56, J:57, K:56, L:56 }

// Độ rộng cột B/C tính theo "số ký tự" (đúng bằng `width` khai báo trong
// <cols> của sheet1.xml — đơn vị width của Excel xấp xỉ số ký tự vừa 1 dòng
// ở font mặc định). Dùng để ước lượng số dòng sau khi wrapText, vì XML ghi
// tay không tự auto-fit chiều cao dòng như Excel làm khi gõ tay.
const _BG_COL_CHARS = { B: 34, C: 75 }
const _BG_LINE_HEIGHT = 15   // pt/dòng xấp xỉ ở font Calibri 11
const _BG_ROW_MIN_HEIGHT = 18

// Ước lượng số dòng hiển thị của 1 đoạn text sau khi wrap theo độ rộng cột
// (tính cả xuống dòng thủ công \n lẫn wrap tự động do quá dài).
function _estimateWrappedLines(text: string, colChars: number): number {
  if (!text) return 1
  const rawLines = String(text).split(/\r?\n/)
  let lines = 0
  for (const line of rawLines) {
    lines += Math.max(1, Math.ceil(line.length / colChars))
  }
  return Math.max(1, lines)
}

// Tính chiều cao dòng (pt) đủ để hiển thị hết nội dung dài nhất trong các cột
// có wrapText (B: Danh mục hàng hóa, C: Mô tả chi tiết) — KHÔNG được ép cứng
// ht=18 cho mọi dòng như trước, vì mô tả dài sẽ bị dòng kế tiếp che mất.
function _estimateRowHeight(item: any): number {
  const linesB = _estimateWrappedLines(item.product_name, _BG_COL_CHARS.B)
  const linesC = _estimateWrappedLines(item.spec,          _BG_COL_CHARS.C)
  const maxLines = Math.max(linesB, linesC)
  return Math.max(_BG_ROW_MIN_HEIGHT, maxLines * _BG_LINE_HEIGHT + 3)
}

function _buildDataRow(rowNum: number, item: any, idx: number): string {
  const qty      = Number(item.quantity)   || 0
  const price    = Number(item.unit_price) || 0
  const vat      = Number(item.vat_rate)   || 0.10
  const subtotal = qty * price
  const vatAmt   = Math.round(subtotal * vat)
  const total    = subtotal + vatAmt
  const S        = _BG_STYLES
  const rowH     = _estimateRowHeight(item)
  const attr     = `r="${rowNum}" spans="1:13" s="47" customFormat="1" ht="${rowH}" customHeight="1"`
  return (
    `<row ${attr}>` +
    _numCell(`A${rowNum}`, S.A, idx + 1) +
    _strCell(`B${rowNum}`, S.B, item.product_name) +
    _strCell(`C${rowNum}`, S.C, item.spec) +
    _strCell(`D${rowNum}`, S.D, item.origin) +
    _strCell(`E${rowNum}`, S.E, item.warranty) +
    _strCell(`F${rowNum}`, S.F, item.unit || 'Cái') +
    _numCell(`G${rowNum}`, S.G, qty) +
    _numCell(`H${rowNum}`, S.H, price) +
    _numCell(`I${rowNum}`, S.I, subtotal) +
    _numCell(`J${rowNum}`, S.J, vat) +
    _numCell(`K${rowNum}`, S.K, vatAmt) +
    _numCell(`L${rowNum}`, S.L, total) +
    `</row>`
  )
}

function _buildEmptyRow(rowNum: number): string {
  const S    = _BG_STYLES
  const attr = `r="${rowNum}" spans="1:13" s="47" customFormat="1" ht="18" customHeight="1"`
  return (
    `<row ${attr}>` +
    `<c r="A${rowNum}" s="${S.A}"/><c r="B${rowNum}" s="${S.B}"/>` +
    `<c r="C${rowNum}" s="${S.C}"/><c r="D${rowNum}" s="${S.D}"/>` +
    `<c r="E${rowNum}" s="${S.E}"/><c r="F${rowNum}" s="${S.F}"/>` +
    `<c r="G${rowNum}" s="${S.G}"/><c r="H${rowNum}" s="${S.H}"/>` +
    `<c r="I${rowNum}" s="${S.I}"/><c r="J${rowNum}" s="${S.J}"/>` +
    `<c r="K${rowNum}" s="${S.K}"/><c r="L${rowNum}" s="${S.L}"/>` +
    `</row>`
  )
}

ipcMain.handle('poms:exportBaoGia', async (_e, id: number) => {
  try {
    const fsSync = require('fs')
    const AdmZip = require('adm-zip')

    const pom   = await api.get<any>(`/poms/${id}`)
    const items = (pom.items ?? []).map((item: any) => {
      const p = item.product ?? {}
      const b = p.brand    ?? {}
      return {
        product_name: item.product_name ?? p.name        ?? '',
        spec:         item.spec         ?? p.spec         ?? item.part_number ?? p.part_number ?? '',
        unit:         item.unit         ?? p.unit         ?? 'Cái',
        origin:       item.origin       ?? b.country      ?? '',
        warranty:     item.warranty     ?? p.warranty     ?? '',
        unit_price:   Number(item.unit_price ?? 0),
        quantity:     Number(item.quantity   ?? 0),
        vat_rate:     Number(item.vat_rate   ?? 0.10),
      }
    })

    const { filePath } = await dialog.showSaveDialog({
      title: 'Xuất báo giá Excel chính thức',
      defaultPath: path.join(
        app.getPath('downloads'),
        `BaoGia_${pom.pom_code}_${new Date().toISOString().slice(0,10)}.xlsx`
      ),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (!filePath) return { success: false, error: 'Hủy' }

    const projectRoot = app.getAppPath()
    const candidates  = [
      path.join(process.resourcesPath ?? '', 'templates', 'mau_bao_gia_tinh.xlsx'),
      path.join(projectRoot, 'resources', 'templates', 'mau_bao_gia_tinh.xlsx'),
      path.join(projectRoot, '..', 'resources', 'templates', 'mau_bao_gia_tinh.xlsx'),
      path.join(__dirname, '..', 'resources', 'templates', 'mau_bao_gia_tinh.xlsx'),
    ]
    const templatePath = candidates.find((c: string) => fsSync.existsSync(c))
    if (!templatePath) {
      return { success: false, error: `Không tìm thấy file template.\nĐã tìm:\n${candidates.join('\n')}` }
    }

    // Dùng adm-zip để patch XML trực tiếp — KHÔNG dùng ExcelJS
    // Giữ nguyên drawing1.xml (logo + thông tin công ty) 100%
    const zip = new AdmZip(templatePath)

    // ── Patch sharedStrings.xml: cập nhật Kính gửi, Địa chỉ, Ngày ──
    const ssXml    = (zip.getEntry('xl/sharedStrings.xml') as any).getData().toString('utf8')
    const today    = new Date()
    const dateStr  = `TP. Hồ Chí Minh, ngày ${String(today.getDate()).padStart(2,'0')} tháng ${String(today.getMonth()+1).padStart(2,'0')} năm ${today.getFullYear()}`
    const kinhGui  = `Kính gửi:  ${pom.customer_name || pom.project_name || ''}`
    const diaChi   = `Địa chỉ: ${(pom as any).site_address || ''}`

    let newSsXml = ssXml
    // Thay ngày (match giá trị cố định trong template gốc)
    newSsXml = newSsXml.replace(
      /(<t[^>]*>)TP\. Hồ Chí Minh, ngày [^<]*(<\/t>)/,
      `$1${_xmlEsc(dateStr)}$2`
    )
    newSsXml = newSsXml.replace(
      /(<t[^>]*>)Kính gửi:[^<]*(<\/t>)/,
      `$1${_xmlEsc(kinhGui)}$2`
    )
    newSsXml = newSsXml.replace(
      /(<t[^>]*>)Địa chỉ: [^<]*(<\/t>)/,
      `$1${_xmlEsc(diaChi)}$2`
    )
    zip.updateFile('xl/sharedStrings.xml', Buffer.from(newSsXml, 'utf8'))

    // ── Patch sheet1.xml: điền data rows 9-25 ──
    let sheetXml = (zip.getEntry('xl/worksheets/sheet1.xml') as any).getData().toString('utf8')

    const FIRST_ROW    = 9
    const TMPL_ROWS    = 17   // template có sẵn 17 dòng (row 9-25)
    const TOTAL_ROW_27 = 27
    const S            = _BG_STYLES
    const actualRows   = Math.max(items.length, TMPL_ROWS)

    let dataRowsXml = ''
    for (let i = 0; i < actualRows; i++) {
      const rn = FIRST_ROW + i
      dataRowsXml += i < items.length
        ? _buildDataRow(rn, items[i], i)
        : _buildEmptyRow(rn)
    }

    // Thay thế toàn bộ block row 9 → row 26
    sheetXml = sheetXml.replace(
      new RegExp(`<row r="${FIRST_ROW}"[\\s\\S]*?(?=<row r="${TOTAL_ROW_27}")`),
      dataRowsXml
    )

    // Cập nhật công thức tổng (row 27 không đổi vì actualRows >= TMPL_ROWS)
    // QUAN TRỌNG: phải ghi ĐÚNG giá trị đã tính (không phải 0) vào <v> —
    // đây là giá trị cache mà Excel/LibreOffice hiển thị ngay khi mở file,
    // trước khi (hoặc nếu không) recalc công thức. Trước đây hardcode <v>0</v>
    // khiến cột tổng luôn hiện "0" (định dạng kế toán hiện thành "-") cho tới
    // khi người dùng tự bấm F9 để tính lại.
    const totalSubtotal = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
    const totalVatAmt   = items.reduce((sum: number, it: any) => {
      const st = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
      return sum + Math.round(st * (Number(it.vat_rate) || 0.10))
    }, 0)
    const totalAll = totalSubtotal + totalVatAmt

    sheetXml = sheetXml.replace(
      /<c r="I27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="I27" s="${S.I}"><f>SUM(I${FIRST_ROW}:I26)</f><v>${totalSubtotal}</v></c>`
    )
    sheetXml = sheetXml.replace(
      /<c r="K27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="K27" s="${S.K}"><f>SUM(K${FIRST_ROW}:K26)</f><v>${totalVatAmt}</v></c>`
    )
    sheetXml = sheetXml.replace(
      /<c r="L27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="L27" s="${S.L}"><f>SUM(L${FIRST_ROW}:L26)</f><v>${totalAll}</v></c>`
    )
    zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf8'))

    // Ép Excel tính lại toàn bộ công thức ngay khi mở file (phòng hờ thêm,
    // kể cả khi giá trị cache ở trên đúng — an toàn nếu người dùng sau này
    // sửa số liệu trực tiếp trong file rồi lưu lại).
    const wbXmlPath = 'xl/workbook.xml'
    let wbXml = (zip.getEntry(wbXmlPath) as any).getData().toString('utf8')
    wbXml = /<calcPr[^/]*\/>/.test(wbXml)
      ? wbXml.replace(/<calcPr([^/]*)\/>/, (_m: string, attrs: string) =>
          /fullCalcOnLoad=/.test(attrs)
            ? `<calcPr${attrs.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"')}/>`
            : `<calcPr${attrs} fullCalcOnLoad="1"/>`
        )
      : wbXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
    zip.updateFile(wbXmlPath, Buffer.from(wbXml, 'utf8'))

    zip.writeZip(filePath)

    await api.put(`/poms/${id}/status`, { status: 'exported' })
    return { success: true, filePath }
  } catch (err: any) {
    console.error('[exportBaoGia]', err)
    return { success: false, error: err.message }
  }
})

// ── SURVEY ───────────────────────────────────────────────────

ipcMain.handle('survey:getAll', async (_e, filters: any) => {
  try {
    const res = await api.get<any>('/surveys', filters)
    const list = Array.isArray(res) ? res : (res?.data ?? [])
    return list.map((r: any) => ({
      ...r,
      pom_code:     r.pom_code     ?? r.pom?.pom_code     ?? '',
      pom_project:  r.pom_project  ?? r.pom?.project_name ?? '',
      created_by_name: r.created_by_name ?? r.creator?.full_name ?? '',
      item_count:   r.item_count   ?? (Array.isArray(r.items) ? r.items.length : 0),
    }))
  }
  catch { return [] }
})

ipcMain.handle('survey:getById', async (_e, id: number) => {
  try {
    const r = await api.get<any>(`/surveys/${id}`)
    if (!r) return null
    return {
      ...r,
      pom_code:     r.pom_code     ?? r.pom?.pom_code     ?? '',
      pom_project:  r.pom_project  ?? r.pom?.project_name ?? '',
      created_by_name: r.created_by_name ?? r.creator?.full_name ?? '',
      item_count:   r.item_count   ?? (Array.isArray(r.items) ? r.items.length : 0),
    }
  }
  catch { return null }
})

ipcMain.handle('survey:create', async (_e, data: any) => {
  try { return await api.post('/surveys', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/surveys/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:updateItems', async (_e, id: number, items: any[]) => {
  try { return await api.put(`/surveys/${id}/items`, { items }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:delete', async (_e, id: number) => {
  try { return await api.delete(`/surveys/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// Đồng bộ danh sách thiết bị với POM ─────────────────────────
ipcMain.handle('survey:getSyncDiff', async (_e, id: number) => {
  try { return await api.get<any>(`/surveys/${id}/sync-diff`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:sync', async (_e, id: number, payload?: any) => {
  try { return await api.post(`/surveys/${id}/sync`, payload ?? { accept_all: true }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:addItem', async (_e, id: number, data: any) => {
  try { return await api.post(`/surveys/${id}/items`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:updateItem', async (_e, itemId: number, data: any) => {
  try { return await api.put(`/surveys/items/${itemId}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:deleteItem', async (_e, itemId: number) => {
  try { return await api.delete(`/surveys/items/${itemId}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('survey:exportWord', async (_e, id: number) => {
  try {
    // ✅ Dùng apiFetchRaw — URL lấy từ api.ts (đúng server)
    const { apiFetchRaw } = await import('./api')
    const { buffer, headers } = await apiFetchRaw(`/surveys/${id}/export-word`)

    // Lấy filename từ Content-Disposition
    const cd = headers['content-disposition'] ?? ''
    const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/)
    const filename = match ? decodeURIComponent(match[1]) : `PBCKS_${id}.docx`

    // Hỏi người dùng nơi lưu
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Lưu phiếu khảo sát Word',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return { success: false, error: 'Hủy' }

    require('fs').writeFileSync(filePath, buffer)
    return { success: true, filePath }

  } catch (err: any) {
    console.error('[survey:exportWord]', err)
    return { success: false, error: err.message }
  }
})

// ── SURVEY — File Word upload thẳng (.docx) thay cho điền form ──────────
// Mở file picker chọn .docx → upload lên server (Cloudflare R2) → trả về
// survey đã cập nhật (có word_file_name/word_file_key...) để FE re-render.
ipcMain.handle('survey:uploadWordFile', async (_e, surveyId: number) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn file Word báo cáo khảo sát',
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { canceled: true }

    const { apiUploadWordFile } = await import('./api')
    const survey = await apiUploadWordFile(surveyId, filePaths[0])
    return { success: true, survey }
  } catch (err: any) {
    console.error('[survey:uploadWordFile]', err)
    return { success: false, error: err.message }
  }
})

// Tải (export) file Word gốc đã upload về máy — mở dialog chọn nơi lưu,
// giống hệt hành vi survey:exportWord nhưng lấy đúng file gốc trên R2
// (không phải file generate lại từ form_data).
ipcMain.handle('survey:downloadWordFile', async (_e, surveyId: number) => {
  try {
    const { apiFetchRaw } = await import('./api')
    const { buffer, headers } = await apiFetchRaw(`/surveys/${surveyId}/word-file`)

    const cd = headers['content-disposition'] ?? ''
    const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/)
    const filename = match ? decodeURIComponent(match[1]) : `BaoCaoKhaoSat_${surveyId}.docx`

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Lưu file Word báo cáo khảo sát',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })
    if (canceled || !filePath) return { success: false, error: 'Hủy' }

    require('fs').writeFileSync(filePath, buffer)
    return { success: true, filePath }
  } catch (err: any) {
    console.error('[survey:downloadWordFile]', err)
    return { success: false, error: err.message }
  }
})

// Lấy nội dung file Word dạng HTML để xem ngay trong app (không cần mở Word)
ipcMain.handle('survey:previewWordFile', async (_e, surveyId: number) => {
  try {
    return await api.get<any>(`/surveys/${surveyId}/word-file/preview`)
  } catch (err: any) {
    return { error: err.message }
  }
})

// Xóa file Word đã upload (để upload lại file khác)
ipcMain.handle('survey:deleteWordFile', async (_e, surveyId: number) => {
  try { return await api.delete(`/surveys/${surveyId}/word-file`) }
  catch (err: any) { return { error: err.message } }
})


// ── formTemplates ─────────────────────────────────────────────
ipcMain.handle('formTemplates:getAll', async (_e, solution_id?: number) => {
  try {
    const params = solution_id ? { solution_id } : {}
    const r = await api.get<any>('/form-templates', params)
    return Array.isArray(r) ? r : (r as any)?.data ?? []
  }
  catch { return [] }
})

ipcMain.handle('formTemplates:getById', async (_e, id: number) => {
  try { return await api.get<any>(`/form-templates/${id}`) }
  catch { return null }
})

ipcMain.handle('formTemplates:create', async (_e, data: any) => {
  try { return await api.post('/form-templates', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('formTemplates:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/form-templates/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('formTemplates:delete', async (_e, id: number) => {
  try { return await api.delete(`/form-templates/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── Upload ảnh lên Supabase Storage ──────────────────────────
// Mở file picker → upload → trả về public URL
ipcMain.handle('upload:image', async (_e, folder: string, oldUrl?: string) => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn ảnh',
      filters: [{ name: 'Hình ảnh', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { canceled: true }

    const url = await apiUpload(folder, filePaths[0], oldUrl)
    return { url }
  } catch (err: any) {
    return { error: err.message }
  }
})


// Nhận base64 từ renderer → giải mã → upload lên server → Supabase → trả về public URL
// Dùng cho FormRenderer image fields (file chọn qua <input type="file">)
ipcMain.handle(
  'upload:image-buffer',
  async (
    _e,
    folder:   string,
    base64:   string,
    filename: string,
    mimeType: string,
    oldUrl?:  string,
  ) => {
    try {
      const buffer = Buffer.from(base64, 'base64')
      const url = await apiUploadBuffer(folder, buffer, filename, mimeType, oldUrl)
      return { url }
    } catch (err: any) {
      return { error: err.message }
    }
  }
)
// ── Gemini AI — trích xuất model+giá từ text bảng Excel ──────
// ── Shared AI extract logic (dùng cho cả gemini:extractPrice và pricing:importFromExcel) ──
async function _aiExtractPrices(sheetText: string, fileName: string): Promise<{ data: { model: string; price: number }[]; model_used?: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { data: [], error: 'OPENROUTER_API_KEY chưa được cấu hình trong file .env' }

  const { net } = await import('electron')

  // Luôn fetch model live để tránh dùng model đã bị xoá/paid
  async function fetchLiveModels(): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      const req = net.request({ method: 'GET', url: 'https://openrouter.ai/api/v1/models' })
      req.setHeader('Authorization', `Bearer ${apiKey}`)
      let body = ''
      req.on('response', (res) => {
        res.on('data', (c: Buffer) => { body += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            const free: string[] = (json.data ?? [])
              .filter((m: any) => m.id?.endsWith(':free') && (m.context_length ?? 0) >= 8000)
              .sort((a: any, b: any) => (b.context_length ?? 0) - (a.context_length ?? 0))
              .slice(0, 12)
              .map((m: any) => m.id as string)
            resolve(free)
          } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.end()
    })
  }

  const FALLBACK_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'deepseek/deepseek-chat:free',
  ]

  const liveModels = await fetchLiveModels()
  const MODEL_LIST = liveModels.length >= 3
    ? [...new Set([...liveModels, ...FALLBACK_MODELS])]
    : [...new Set([...FALLBACK_MODELS, ...liveModels])]

  const prompt = `Bạn là công cụ trích xuất dữ liệu từ bảng báo giá Excel của nhà cung cấp thiết bị IT tại Việt Nam.

NHIỆM VỤ: Đọc bảng CSV bên dưới, trích xuất model code và đơn giá của từng sản phẩm.

CÁC TRƯỜNG:
- "model": MÃ SẢN PHẨM / MODEL CODE (ví dụ: XGS1935-28HP, FG-401F, ECW220). KHÔNG phải tên hãng, KHÔNG phải mô tả.
- "price": Đơn giá (số nguyên VNĐ). Ưu tiên giá chưa VAT. Nếu chỉ có giá đã VAT thì lấy giá đó.

QUY TẮC:
1. Chỉ trả về JSON array thuần túy — KHÔNG có markdown, KHÔNG có \`\`\`json, KHÔNG giải thích.
2. Bỏ qua: hàng tiêu đề, hàng tổng, hàng trống, hàng ghi chú.
3. Nếu 1 sản phẩm xuất hiện nhiều lần, chỉ lấy lần đầu.
4. price phải là số nguyên dương.

VÍ DỤ OUTPUT:
[{"model":"ECW220","price":2500000},{"model":"XGS4600-32","price":15000000}]

File: ${fileName}

DỮ LIỆU:
${sheetText.slice(0, 12000)}`

  async function callModel(modelId: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const TIMEOUT_MS = 45_000
      let settled = false
      const done = (fn: () => void) => { if (!settled) { settled = true; fn() } }
      const timer = setTimeout(() => {
        done(() => reject(new Error(`Timeout 45s — ${modelId}`)))
        try { request.abort() } catch {}
      }, TIMEOUT_MS)
      const request = net.request({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions' })
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Authorization', `Bearer ${apiKey}`)
      request.setHeader('HTTP-Referer', 'https://uni-pom.app')
      request.setHeader('X-Title', 'UNI POM')
      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { body += chunk.toString() })
        response.on('end', () => {
          clearTimeout(timer)
          try { done(() => resolve(JSON.parse(body))) }
          catch { done(() => reject(new Error('Invalid JSON từ server'))) }
        })
      })
      request.on('error', (err: Error) => { clearTimeout(timer); done(() => reject(err)) })
      request.write(JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 2048,
      }))
      request.end()
    })
  }

  const errors: string[] = []
  for (const modelId of MODEL_LIST) {
    try {
      const res = await callModel(modelId)
      if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error))
      const raw: string = res?.choices?.[0]?.message?.content ?? ''
      if (!raw.trim()) throw new Error('Model trả về rỗng')
      const jsonMatch = raw.match(/\[[\s\S]*\]/s)
      if (!jsonMatch) throw new Error('Không tìm thấy JSON array')
      const items = JSON.parse(jsonMatch[0])
      if (!Array.isArray(items) || items.length === 0) throw new Error('Array rỗng')
      const valid = items.filter((x: any) =>
        x && typeof x.model === 'string' && x.model.trim().length > 0 &&
        typeof x.price === 'number' && x.price > 0
      )
      if (valid.length === 0) throw new Error('Không có item hợp lệ')
      return { data: valid, model_used: modelId }
    } catch (err: any) {
      errors.push(`[${modelId.split('/')[1] ?? modelId}] ${err.message ?? String(err)}`)
      continue
    }
  }

  return { data: [], error: `Tất cả model đều thất bại:\n${errors.slice(0, 5).join('\n')}` }
}

// ── PRICING — Import giá từ Excel ────────────────────────────
// Bước 1: Chỉ mở dialog + đọc file — KHÔNG gọi AI
// Renderer gọi cái này TRƯỚC khi show loading, để native dialog KHÔNG đóng băng animation
ipcMain.handle('pricing:pickFile', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn file bảng giá Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { cancelled: true }

    const filePath = filePaths[0]
    const fileName = path.basename(filePath)

    const XLSX = require('xlsx')
    const workbook  = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const sheet     = workbook.Sheets[sheetName]
    const sheetText = XLSX.utils.sheet_to_csv(sheet)

    return { fileName, sheetText }
  } catch (err: any) {
    return { error: err.message || 'Không đọc được file' }
  }
})

// Bước 2: AI extract + match DB — renderer gọi SAU KHI show loading
// Lúc này native dialog đã đóng → animation chạy mượt hoàn toàn
ipcMain.handle('pricing:analyzeFile', async (_e, sheetText: string, fileName: string) => {
  // Push real-time status events về renderer để drive animation
  const sender = _e.sender
  const emit = (status: string, detail?: string) => {
    try { if (!sender.isDestroyed()) sender.send('pricing:status', { status, detail }) } catch {}
  }

  try {
    emit('reading', fileName)
    await new Promise(r => setTimeout(r, 50)) // yield ≥1 frame so renderer can paint

    emit('ai_start', 'Gửi dữ liệu lên AI...')
    const aiResult = await _aiExtractPrices(sheetText, fileName)
    emit('matching', 'So khớp với database...')
    if (aiResult.error) return { error: aiResult.error }

    let products: any[] = []
    try {
      const raw = await api.get<any>('/products')
      // Server trả về { data: [...], pagination: {...} } — unwrap đúng như hooks/index.ts
      products = Array.isArray(raw) ? raw
               : Array.isArray(raw?.data) ? raw.data
               : Array.isArray(raw?.data?.data) ? raw.data.data
               : []
    } catch { products = [] }
    if (!Array.isArray(products)) products = []

    // Dùng cùng logic matchModel với ProductsPage (3-level)
    const norm = (s: string) => s.toUpperCase().replace(/[\s\-_\.]/g, '')
    const matchProduct = (modelCode: string): { product: any; type: 'exact' | 'fuzzy' } | null => {
      const m = modelCode.trim().toUpperCase()
      if (!m || m.length < 2) return null
      const exact = products.find((p: any) => (p.part_number ?? '').trim().toUpperCase() === m)
      if (exact) return { product: exact, type: 'exact' }
      const normalized = products.find((p: any) => p.part_number && norm(p.part_number) === norm(m))
      if (normalized) return { product: normalized, type: 'exact' }
      const contained = products.find((p: any) => p.part_number && (
        p.part_number.trim().toUpperCase().includes(m) ||
        m.includes(p.part_number.trim().toUpperCase())
      ))
      if (contained) return { product: contained, type: 'fuzzy' }
      return null
    }

    const items = (aiResult.data ?? []).map((aiItem: { model: string; price: number }) => {
      const result = matchProduct(aiItem.model)
      if (result) {
        const p = result.product
        return {
          model:        aiItem.model,
          new_price:    aiItem.price,
          old_price:    p.price ?? null,
          vat_rate:     Number(p.vat_rate ?? 0.10),
          confidence:   result.type === 'exact' ? 1.0 : 0.7,
          match_type:   result.type,
          product_id:   p.id,
          product_name: p.name,
          brand_name:   p.brand_name ?? null,
          selected:     result.type === 'exact',
        }
      }
      return {
        model: aiItem.model, new_price: aiItem.price, old_price: null,
        vat_rate: 0.10, confidence: 0, match_type: 'not_found',
        product_id: null, product_name: null, brand_name: null, selected: false,
      }
    })

    emit('done')
    return {
      items,
      file_name: fileName,
      vat_rate:  0.10,
      ai_notes:  `Phân tích thành công bằng ${aiResult.model_used ?? 'AI'} — ${items.length} sản phẩm`,
    }
  } catch (err: any) {
    console.error('[pricing:analyzeFile]', err)
    return { error: err.message || 'Đã xảy ra lỗi khi phân tích' }
  }
})

ipcMain.handle('pricing:applyImport', async (_e, items: any[]) => {
  let succeeded = 0, failed = 0
  for (const item of items) {
    if (!item.product_id) continue
    try {
      await api.put(`/products/${item.product_id}`, { price: item.new_price })
      succeeded++
    } catch { failed++ }
  }
  return { succeeded, failed }
})

// gemini:extractPrice — delegate sang shared function
ipcMain.handle('gemini:extractPrice', async (_e, sheetText: string, fileName: string) => {
  return await _aiExtractPrices(sheetText, fileName)
})

// ── PRODUCTS — Import sản phẩm mới từ Excel ──────────────────
// Bước 1: Mở dialog + đọc file (KHÔNG gọi AI, tránh đóng băng animation)
ipcMain.handle('products:importPickFile', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn file danh sách sản phẩm Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { cancelled: true }

    const filePath = filePaths[0]
    const fileName = path.basename(filePath)
    const XLSX = require('xlsx')
    const workbook  = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const sheet     = workbook.Sheets[sheetName]
    const sheetText = XLSX.utils.sheet_to_csv(sheet)
    return { fileName, sheetText }
  } catch (err: any) {
    return { error: err.message || 'Không đọc được file' }
  }
})

// Bước 2: AI phân tích file → danh sách sản phẩm cần thêm
ipcMain.handle('products:importAnalyze', async (_e, sheetText: string, fileName: string) => {
  const sender = _e.sender
  const emit = (status: string, detail?: string) => {
    try { if (!sender.isDestroyed()) sender.send('products:importStatus', { status, detail }) } catch {}
  }

  try {
    emit('reading', fileName)
    await new Promise(r => setTimeout(r, 30))

    emit('ai_start', 'Gửi dữ liệu lên AI...')
    const aiResult = await _aiExtractProducts(sheetText, fileName)
    if (aiResult.error) return { error: aiResult.error }

    emit('matching', 'So khớp với database...')

    // Lấy danh sách sản phẩm + brands + categories CÙNG LÚC (Promise.all)
    const [rawProducts, rawBrands, rawCategories] = await Promise.all([
      api.get<any>('/products').catch(() => []),
      api.get<any>('/brands').catch(() => []),
      api.get<any>('/categories').catch(() => []),
    ])
    const existingProducts: any[] = Array.isArray(rawProducts)       ? rawProducts
      : Array.isArray(rawProducts?.data)       ? rawProducts.data
      : Array.isArray(rawProducts?.data?.data) ? rawProducts.data.data
      : []
    const brands:     any[] = rawBrands     || []
    const categories: any[] = rawCategories || []

    const norm = (s: string) => (s ?? '').toUpperCase().replace(/[\s\-_.]/g, '')

    const items = (aiResult.data ?? []).map((ai: any) => {
      // Check trùng part_number
      const dup = existingProducts.find((p: any) =>
        p.part_number && ai.part_number &&
        norm(p.part_number) === norm(ai.part_number)
      )

      // Match brand (tên hoặc short_name)
      const matchedBrand = brands.find((b: any) =>
        b.name?.toLowerCase() === (ai.brand ?? '').toLowerCase() ||
        b.short_name?.toLowerCase() === (ai.brand ?? '').toLowerCase()
      )

      // Match category (tên)
      const matchedCategory = categories.find((c: any) =>
        c.name?.toLowerCase() === (ai.category ?? '').toLowerCase()
      )

      return {
        // Dữ liệu AI trả về
        part_number:   ai.part_number   ?? '',
        name:          ai.name          ?? '',
        brand:         ai.brand         ?? '',
        category:      ai.category      ?? '',
        description:   ai.description   ?? '',
        unit:          ai.unit          ?? 'Cái',
        origin:        ai.origin        ?? '',
        // Matched IDs (null nếu chưa có trong DB)
        brand_id:      matchedBrand?.id     ?? null,
        category_id:   matchedCategory?.id  ?? null,
        brand_name:    matchedBrand?.name   ?? ai.brand ?? '',
        category_name: matchedCategory?.name ?? ai.category ?? '',
        // Trạng thái
        is_duplicate:  !!dup,
        duplicate_id:  dup?.id ?? null,
        selected:      !dup,  // mặc định chỉ chọn hàng không trùng
        brand_matched:    !!matchedBrand,
        category_matched: !!matchedCategory,
      }
    })

    emit('done')
    return {
      items,
      file_name: fileName,
      ai_notes: `Phân tích thành công bằng ${aiResult.model_used ?? 'AI'} — ${items.length} sản phẩm`,
      brands,
      categories,
    }
  } catch (err: any) {
    console.error('[products:importAnalyze]', err)
    return { error: err.message || 'Đã xảy ra lỗi khi phân tích' }
  }
})

// Bước 3: Thêm sản phẩm đã chọn vào DB
ipcMain.handle('products:importApply', async (_e, items: any[]) => {
  let succeeded = 0, failed = 0
  const errors: string[] = []
  for (const item of items) {
    if (!item.selected) continue
    try {
      await api.post('/products', {
        name:        item.name        || item.part_number,
        part_number: item.part_number || null,
        brand_id:    item.brand_id    || null,
        category_id: item.category_id || null,
        unit:        item.unit        || 'Cái',
        description: item.description || null,
        origin:      item.origin      || null,
        price:       0,
        vat_rate:    0.10,
        status:      'active',
      })
      succeeded++
    } catch (err: any) {
      failed++
      errors.push(`${item.part_number}: ${err.message}`)
    }
  }
  return { succeeded, failed, errors }
})

// Helper: AI trích xuất danh sách sản phẩm từ file Excel
// ── PARALLEL RACE: gọi nhiều model cùng lúc, lấy model nào trả lời trước ──
async function _aiExtractProducts(sheetText: string, fileName: string): Promise<{
  data: {
    part_number: string; name: string; brand: string; category: string;
    description: string; unit: string; origin: string;
  }[];
  model_used?: string;
  error?: string;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { data: [], error: 'OPENROUTER_API_KEY chưa được cấu hình trong file .env' }

  const { net } = await import('electron')

  // ── Lấy danh sách model free đang hoạt động từ OpenRouter ─────────────────
  async function fetchLiveModels(): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      const req = net.request({ method: 'GET', url: 'https://openrouter.ai/api/v1/models' })
      req.setHeader('Authorization', `Bearer ${apiKey}`)
      let body = ''
      req.on('response', (res) => {
        res.on('data', (c: Buffer) => { body += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            const free: string[] = (json.data ?? [])
              .filter((m: any) =>
                m.id?.endsWith(':free') &&
                (m.context_length ?? 0) >= 8000
              )
              .sort((a: any, b: any) => (b.context_length ?? 0) - (a.context_length ?? 0))
              .slice(0, 12)
              .map((m: any) => m.id as string)
            resolve(free)
          } catch { resolve([]) }
        })
      })
      req.on('error', () => resolve([]))
      req.end()
    })
  }

  const FALLBACK_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'deepseek/deepseek-chat:free',
  ]

  const liveModels = await fetchLiveModels()
  const MODEL_LIST = liveModels.length >= 3
    ? [...new Set([...liveModels, ...FALLBACK_MODELS])]
    : [...new Set([...FALLBACK_MODELS, ...liveModels])]

  // ── Prompt ─────────────────────────────────────────────────────────────────
  const prompt = `Bạn là công cụ trích xuất dữ liệu sản phẩm IT từ file Excel.

NHIỆM VỤ: Đọc bảng CSV bên dưới và trả về JSON array chứa thông tin từng sản phẩm.

CÁC TRƯỜNG:
- "part_number": Mã sản phẩm / model code (ví dụ: ECW220, XGS4600-32, FG-401F). BẮT BUỘC.
- "name": Tên đầy đủ sản phẩm. Nếu không có dùng part_number làm tên.
- "brand": Hãng sản xuất (ví dụ: EnGenius, Zyxel, Fortinet, Synology). Để "" nếu không rõ.
- "category": Loại thiết bị (ví dụ: Wifi AP, Switch, Firewall, NAS, Camera). Để "" nếu không rõ.
- "description": Mô tả / thông số kỹ thuật ngắn gọn. Để "" nếu không có.
- "unit": Đơn vị tính (Cái / Bộ / Chiếc / Gói). Mặc định "Cái".
- "origin": Xuất xứ quốc gia (ví dụ: USA, Taiwan, China). Để "" nếu không có.

QUY TẮC QUAN TRỌNG:
1. Chỉ trả về JSON array thuần túy — KHÔNG có markdown, KHÔNG có \`\`\`json, KHÔNG giải thích.
2. Bỏ qua: hàng tiêu đề, hàng tổng cộng, hàng trống, hàng ghi chú.
3. Mỗi sản phẩm = 1 object. Không gộp nhiều sản phẩm.
4. part_number không được để trống.

VÍ DỤ OUTPUT:
[{"part_number":"ECW220","name":"EnGenius ECW220 WiFi 6 AP","brand":"EnGenius","category":"Wifi AP","description":"AX1800, 2x2 MU-MIMO, Cloud Managed","unit":"Cái","origin":"Taiwan"},{"part_number":"XGS4600-32","name":"Zyxel XGS4600-32 Switch","brand":"Zyxel","category":"Switch","description":"Layer 3, 28-port GbE","unit":"Cái","origin":"Taiwan"}]

File: ${fileName}

DỮ LIỆU:
${sheetText.slice(0, 12000)}`

  // ── Gọi 1 model (timeout 30s — ngắn hơn để batch kế được thử nhanh hơn) ───
  function callModel(modelId: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const TIMEOUT_MS = 30_000
      let settled = false
      const done = (fn: () => void) => { if (!settled) { settled = true; fn() } }
      const timer = setTimeout(() => {
        done(() => reject(new Error(`Timeout 30s — ${modelId}`)))
        try { request.abort() } catch {}
      }, TIMEOUT_MS)
      const request = net.request({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions' })
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Authorization', `Bearer ${apiKey}`)
      request.setHeader('HTTP-Referer', 'https://uni-pom.app')
      request.setHeader('X-Title', 'UNI POM')
      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { body += chunk.toString() })
        response.on('end', () => {
          clearTimeout(timer)
          try { done(() => resolve(JSON.parse(body))) }
          catch { done(() => reject(new Error('Invalid JSON từ server'))) }
        })
      })
      request.on('error', (err: Error) => { clearTimeout(timer); done(() => reject(err)) })
      request.write(JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 4096,
      }))
      request.end()
    })
  }

  function parseResponse(res: any, modelId: string): { data: any[]; modelId: string } {
    if (res.error) {
      const msg = res.error.message ?? res.error.code ?? JSON.stringify(res.error)
      throw new Error(msg)
    }
    const raw: string = res?.choices?.[0]?.message?.content ?? ''
    if (!raw.trim()) throw new Error('Model trả về nội dung rỗng')
    const jsonMatch = raw.match(/\[[\s\S]*\]/s)
    if (!jsonMatch) throw new Error('Không tìm thấy JSON array trong response')
    let items: any[]
    try { items = JSON.parse(jsonMatch[0]) }
    catch { throw new Error('JSON array không hợp lệ') }
    if (!Array.isArray(items) || items.length === 0) throw new Error('Array rỗng')
    const valid = items.filter((x: any) =>
      x && typeof x.part_number === 'string' && x.part_number.trim().length > 0
    )
    if (valid.length === 0) throw new Error('Không có sản phẩm hợp lệ (thiếu part_number)')
    return { data: valid, modelId }
  }

  // ── RACE SONG SONG ─────────────────────────────────────────────────────────
  // Chia MODEL_LIST thành các batch RACE_SIZE model, mỗi batch gọi đồng thời.
  // Promise.any() resolve ngay khi 1 model trong batch thành công.
  // Nếu cả batch thất bại (AggregateError) → thử batch tiếp theo.
  //
  // Ví dụ RACE_SIZE=4, MODEL_LIST 8 model:
  //   Batch 1: [m1,m2,m3,m4] — gọi cùng lúc → m3 OK sau 9s → trả về ngay ✅
  //   (thay vì tuần tự: m1 timeout 30s + m2 timeout 30s + m3 OK = 69s)
  const RACE_SIZE = 4

  const batches: string[][] = []
  for (let i = 0; i < MODEL_LIST.length; i += RACE_SIZE) {
    batches.push(MODEL_LIST.slice(i, i + RACE_SIZE))
  }

  const allErrors: string[] = []

  for (const batch of batches) {
    try {
      const result = await Promise.any(
        batch.map(modelId =>
          callModel(modelId).then(res => parseResponse(res, modelId))
        )
      )
      return { data: result.data, model_used: result.modelId }
    } catch (aggErr: any) {
      // AggregateError: tất cả model trong batch thất bại → thử batch tiếp
      const errs: Error[] = aggErr.errors ?? []
      errs.forEach((e, i) => {
        const shortName = batch[i]?.split('/')?.[1] ?? batch[i] ?? `model${i}`
        allErrors.push(`[${shortName}] ${e.message ?? String(e)}`)
      })
    }
  }

  return {
    data: [],
    error: `Tất cả model đều thất bại:\n${allErrors.slice(0, 5).join('\n')}`,
  }
}
// ============================================================
// WARDS / PROVINCES / DISTRICTS / CONTACTS / WARD-ACTIVITIES
// Các handler này bị thiếu → "No handler registered for 'wards:getAll'"
// ============================================================

// ── Provinces ─────────────────────────────────────────────────
// Lấy từ DB — id là auto-increment, KHÔNG phải DVCQG code
// Dùng API ngoài sẽ trả id=79 (DVCQG code) nhưng DB id có thể là 1,2,3...
// → FK lỗi khi INSERT ward. Phải dùng DB id thực.
ipcMain.handle('provinces:getAll', async () => {
  try {
    return await api.get('/provinces')
  } catch { return [] }
})

// ── Districts ──────────────────────────────────────────────────
// Tương tự: lấy từ DB để id khớp FK
ipcMain.handle('districts:getAll', async (_e, params?: { province_id?: number }) => {
  try {
    const q = params?.province_id ? `?province_id=${params.province_id}` : ''
    return await api.get(`/districts${q}`)
  } catch { return [] }
})

// ── Wards (UBND Phường/Xã) ────────────────────────────────────
ipcMain.handle('wards:getAll', async (_e, params?: any) => {
  try {
    const qs = params
      ? '?' + Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
      : ''
    return await api.get(`/wards${qs}`)
  }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:getSummary', async () => {
  try { return await api.get('/wards/summary') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:getById', async (_e, id: number) => {
  try { return await api.get(`/wards/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:create', async (_e, data: any) => {
  try { return await api.post('/wards', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/wards/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:delete', async (_e, id: number) => {
  try { return await api.delete(`/wards/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── Contacts (liên hệ trong UBND) ─────────────────────────────
ipcMain.handle('contacts:getAll', async (_e, params?: any) => {
  try {
    const qs = params
      ? '?' + Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
      : ''
    return await api.get(`/contacts${qs}`)
  }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('contacts:create', async (_e, data: any) => {
  try { return await api.post('/contacts', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('contacts:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/contacts/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('contacts:delete', async (_e, id: number) => {
  try { return await api.delete(`/contacts/${id}`) }
  catch (err: any) { return { error: err.message } }
})

// ── Ward Activities (hoạt động với UBND) ──────────────────────
ipcMain.handle('wardActivities:getAll', async (_e, ward_id: number) => {
  try { return await api.get(`/ward-activities?ward_id=${ward_id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wardActivities:create', async (_e, data: any) => {
  try { return await api.post('/ward-activities', data) }
  catch (err: any) { return { error: err.message } }
})
// ── Notifications ─────────────────────────────────────────────
ipcMain.handle('notifications:getAll', async (_e, params?: { unread?: boolean; limit?: number }) => {
  try {
    const qs = new URLSearchParams()
    if (params?.unread) qs.set('unread', 'true')
    if (params?.limit)  qs.set('limit', String(params.limit))
    const query = qs.toString() ? `?${qs}` : ''
    return await api.get(`/notifications${query}`)
  } catch (err: any) { return { error: err.message } }
})

ipcMain.handle('notifications:getUnreadCount', async () => {
  try { return await api.get('/notifications/unread-count') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('notifications:markAsRead', async (_e, id: number) => {
  try { return await api.put(`/notifications/${id}/read`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('notifications:markAllAsRead', async () => {
  try { return await api.put('/notifications/read-all', {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('notifications:delete', async (_e, id: number) => {
  try { return await api.delete(`/notifications/${id}`) }
  catch (err: any) { return { error: err.message } }
})
// ══════════════════════════════════════════════════════════════════
// PLANNER MODULE
// ══════════════════════════════════════════════════════════════════

// ── Plans ──────────────────────────────────────────────────────────
ipcMain.handle('planner:getPlans', async () => {
  try { return await api.get('/planner/plans') }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:createPlan', async (_e, data: any) => {
  try { return await api.post('/planner/plans', data) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:updatePlan', async (_e, id: number, data: any) => {
  try { return await api.put(`/planner/plans/${id}`, data) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:deletePlan', async (_e, id: number) => {
  try { return await api.delete(`/planner/plans/${id}`) }
  catch (e: any) { return { error: e.message } }
})

// ── Plan Members (Team) ──────────────────────────────────────────────
ipcMain.handle('planner:getPlanMembers', async (_e, planId: number) => {
  try { return await api.get(`/planner/plans/${planId}/members`) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:addPlanMembers', async (_e, planId: number, userIds: number[]) => {
  try { return await api.post(`/planner/plans/${planId}/members`, { user_ids: userIds }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:removePlanMember', async (_e, planId: number, userId: number) => {
  try { return await api.delete(`/planner/plans/${planId}/members/${userId}`) }
  catch (e: any) { return { error: e.message } }
})

// ── Buckets ────────────────────────────────────────────────────────
ipcMain.handle('planner:getBuckets', async (_e, planId: number) => {
  try { return await api.get(`/planner/plans/${planId}/buckets`) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:createBucket', async (_e, planId: number, name: string) => {
  try { return await api.post(`/planner/plans/${planId}/buckets`, { name }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:updateBucket', async (_e, id: number, name: string) => {
  try { return await api.put(`/planner/buckets/${id}`, { name }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:deleteBucket', async (_e, id: number) => {
  try { return await api.delete(`/planner/buckets/${id}`) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:reorderBuckets', async (_e, data: any) => {
  try { return await api.put('/planner/buckets/reorder', data) }
  catch (e: any) { return { error: e.message } }
})

// ── Tasks ──────────────────────────────────────────────────────────
ipcMain.handle('planner:getTasks', async (_e, filters?: any) => {
  try { return await api.get('/planner/tasks', filters) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:getTask', async (_e, id: number) => {
  try { return await api.get(`/planner/tasks/${id}`) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:createTask', async (_e, data: any) => {
  try { return await api.post('/planner/tasks', data) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:updateTask', async (_e, id: number, data: any) => {
  try { return await api.put(`/planner/tasks/${id}`, data) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:deleteTask', async (_e, id: number) => {
  try { return await api.delete(`/planner/tasks/${id}`) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:reorderTask', async (_e, id: number, data: any) => {
  try { return await api.put(`/planner/tasks/${id}/reorder`, data) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:copyTask', async (_e, id: number, data?: any) => {
  try { return await api.post(`/planner/tasks/${id}/copy`, data || {}) }
  catch (e: any) { return { error: e.message } }
})

// ── Checklists ─────────────────────────────────────────────────────
ipcMain.handle('planner:addChecklist', async (_e, taskId: number, title: string) => {
  try { return await api.post(`/planner/tasks/${taskId}/checklist`, { title }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:toggleChecklist', async (_e, taskId: number, itemId: number) => {
  try { return await api.put(`/planner/tasks/${taskId}/checklist/${itemId}/toggle`, {}) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:updateChecklist', async (_e, taskId: number, itemId: number, title: string) => {
  try { return await api.put(`/planner/tasks/${taskId}/checklist/${itemId}`, { title }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:deleteChecklist', async (_e, taskId: number, itemId: number) => {
  try { return await api.delete(`/planner/tasks/${taskId}/checklist/${itemId}`) }
  catch (e: any) { return { error: e.message } }
})

// ── Comments ───────────────────────────────────────────────────────
ipcMain.handle('planner:addComment', async (_e, taskId: number, content: string) => {
  try { return await api.post(`/planner/tasks/${taskId}/comments`, { content }) }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:deleteComment', async (_e, taskId: number, commentId: number) => {
  try { return await api.delete(`/planner/tasks/${taskId}/comments/${commentId}`) }
  catch (e: any) { return { error: e.message } }
})

// ── Stats (Chart view) ──────────────────────────────────────────────
ipcMain.handle('planner:getPlanStats', async (_e, planId: number) => {
  try { return await api.get(`/planner/plans/${planId}/stats`) }
  catch (e: any) { return { error: e.message } }
})

// ── Users (for assignee picker) ────────────────────────────────────
ipcMain.handle('planner:getUsers', async () => {
  try { return await api.get('/planner/users') }
  catch (e: any) { return { error: e.message } }
})

ipcMain.handle('planner:getMyTasks', async (_e, filters?: any) => {
  try { return await api.get('/planner/my-tasks', filters) }
  catch (e: any) { return { error: e.message } }
})

// ============================================================
// electron/ipcHandlers_additions.ts
// THÊM VÀO CUỐI FILE ipcHandlers.ts HIỆN TẠI
// (Import api và ipcMain đã có sẵn ở file gốc)
// ============================================================

// ── ATTENDANCE — Chấm công ───────────────────────────────────────────────────

ipcMain.handle('attendance:checkIn', async (_e, note?: string) => {
  try { return await api.post('/attendance/check-in', { note }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:checkOut', async (_e, note?: string) => {
  try { return await api.post('/attendance/check-out', { note }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getToday', async () => {
  try { return await api.get('/attendance/today') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getMy', async (_e, params?: { month?: number; year?: number }) => {
  const q = params ? `?month=${params.month ?? ''}&year=${params.year ?? ''}` : ''
  try { return await api.get(`/attendance/my${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getAll', async (_e, params?: any) => {
  const q = params
    ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&user_id=${params.user_id ?? ''}&status=${params.status ?? ''}`
    : ''
  try { return await api.get(`/attendance${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getStats', async (_e, params?: any) => {
  const q = params ? `?month=${params.month ?? ''}&year=${params.year ?? ''}` : ''
  try { return await api.get(`/attendance/stats${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getWorkWeek', async () => {
  try { return await api.get('/attendance/work-week') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:setWorkWeek', async (_e, config: Record<number, string>) => {
  try { return await api.put('/attendance/work-week', { config }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:getWorkHours', async () => {
  try { return await api.get('/attendance/work-hours') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:setWorkHours', async (_e, payload: { work_start: string; work_end: string }) => {
  try { return await api.put('/attendance/work-hours', payload) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('attendance:exportExcel', async (_e, params?: any) => {
  try {
    const ExcelJS = require('exceljs')
    const { dialog: _dialog } = require('electron')

    const m = Number(params?.month) || new Date().getMonth() + 1
    const y = Number(params?.year)  || new Date().getFullYear()
    const userId = params?.user_id

    // ── Lấy dữ liệu nguồn ────────────────────────────────────
    const qBase = `month=${m}&year=${y}`
    const qUser = userId ? `&user_id=${userId}` : ''

    const [stats, detail, trips, allowanceRes, leaveApproved]: any[] = await Promise.all([
      api.get(`/attendance/stats?${qBase}`),
      api.get(`/attendance?${qBase}${qUser}`),
      api.get(`/business-trips?${qBase}${qUser}`),
      api.get('/business-trips/allowance').catch(() => null),
      api.get(`/leave-requests?${qBase}${qUser}&status=approved`).catch(() => []),
    ])

    const statsRows: any[]  = (Array.isArray(stats) ? stats : []).filter((s: any) => !userId || String(s.id) === String(userId))
    const detailRows: any[] = Array.isArray(detail) ? detail : []
    const tripRows: any[]   = Array.isArray(trips) ? trips : []
    const leaveRows: any[]  = Array.isArray(leaveApproved) ? leaveApproved : []
    const dailyAllowance = Number(allowanceRes?.daily_allowance ?? 150000)
    const workDaysInMonth = statsRows.reduce((max, s) => Math.max(max, Number(s.total_days || 0)), 0)

    // Ngày nghỉ phép CÓ LƯƠNG đã được trừ vào quỹ phép năm (paid_days, tính khi duyệt đơn)
    // theo từng người — phần còn lại trong tổng "Nghỉ phép" của tháng là KHÔNG LƯƠNG.
    const paidByUser: Record<string, number> = {}
    leaveRows.forEach((lr: any) => {
      paidByUser[lr.user_id] = (paidByUser[lr.user_id] ?? 0) + Number(lr.paid_days || 0)
    })

    const ROLE_LABEL: Record<string, string> = {
      technical: 'Kỹ thuật', technical_lead: 'Trưởng phòng KT',
      sales: 'Sale', sales_admin: 'Sale Admin', ke_toan: 'Kế toán',
    }
    const dayTotal = (item: any) =>
      Array.isArray(item.expenses) && item.expenses.length
        ? item.expenses.reduce((s: number, e: any) => s + Number(e.total_price || 0), 0)
        : Number(item.total_price || 0)

    // Chi tiết ngày vắng / nghỉ phép theo từng người (kể cả những ngày KHÔNG
    // có dòng nào trong bảng attendance — backend trả về dạng "ma trận" nên
    // mọi ngày làm việc đã qua trong tháng đều có status: present | leave | absent)
    const detailByUser: Record<string, string[]> = {}
    detailRows.forEach((r: any) => {
      if (r.status !== 'absent' && r.status !== 'leave') return
      const d = new Date(r.date)
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      let label = `Vắng ${dateStr}`
      if (r.status === 'leave') {
        const note = String(r.note || '')
        label = note.includes('sáng') ? `Nghỉ sáng ${dateStr}`
              : note.includes('chiều') ? `Nghỉ chiều ${dateStr}`
              : `Nghỉ phép ${dateStr}`
      }
      ;(detailByUser[r.user_id] ??= []).push(label)
    })

    // Công tác Chủ nhật / Lễ + tổng hợp chi phí công tác theo người
    type SundayRow = { date: Date; name: string; role: string; place: string }
    const sundayRows: SundayRow[] = []
    const expenseByUser: Record<string, {
      name: string; role: string; days: number;
      allowance: number; transport: number; hotel: number; meal: number; other: number;
      advance: number; total: number; statuses: Set<string>;
    }> = {}

    tripRows.forEach((trip: any) => {
      const key = String(trip.user_id)
      const acc = (expenseByUser[key] ??= {
        name: trip.full_name, role: trip.role, days: 0,
        allowance: 0, transport: 0, hotel: 0, meal: 0, other: 0,
        advance: 0, total: 0, statuses: new Set(),
      })
      acc.advance += Number(trip.advance_amount || 0)
      acc.total   += Number(trip.total_amount || 0)
      acc.statuses.add(trip.status)

      const items: any[] = trip.items ?? []
      items.forEach((item: any) => {
        acc.days += 1
        const place = [item.ward, item.province, item.location].filter(Boolean).join(' · ')
        const expenses: any[] = Array.isArray(item.expenses) && item.expenses.length
          ? item.expenses
          : [{ category: 'other', total_price: item.total_price }]
        expenses.forEach((exp: any) => {
          const v = Number(exp.total_price || 0)
          if (exp.category === 'allowance') acc.allowance += v
          else if (exp.category === 'transport') acc.transport += v
          else if (exp.category === 'hotel') acc.hotel += v
          else if (exp.category === 'meal') acc.meal += v
          else acc.other += v
        })
        const d = item.date ? new Date(item.date) : null
        if (d && d.getDay() === 0) {
          sundayRows.push({ date: d, name: trip.full_name, role: trip.role, place })
        }
      })
    })

    const statusLabel = (statuses: Set<string>) => {
      if (statuses.has('pending')) return 'Chờ duyệt'
      if ([...statuses].every(s => s === 'approved')) return 'Đã duyệt'
      return 'Từ chối'
    }

    // ══════════════════════════════════════════════════════════
    // DỰNG FILE EXCEL — theo mẫu BM-CC-01
    // ══════════════════════════════════════════════════════════
    const FONT = 'Times New Roman'
    const NAVY = 'FF3C3489', NAVY_LT = 'FFEEEDFE', BLUE_LT = 'FFE0EDFF'
    const AMBER = 'FF854F0B', RED = 'FFB91C1C', GREEN = 'FF3B6D11'
    const GREY = 'FF6B7280', WHITE = 'FFFFFFFF', STRIPE = 'FFF9FAFB'
    const thin = { style: 'thin', color: { argb: 'FFD9DCE3' } }
    const BORDER = { top: thin, bottom: thin, left: thin, right: thin }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(`Thang ${String(m).padStart(2, '0')}-${y}`, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    ws.views = [{ showGridLines: false }]

    const COLS = 14
    const widths = [5, 22, 17, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11, 22]
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    let r = 1
    const styleCell = (cell: any, opt: any = {}) => {
      cell.font = { name: FONT, size: opt.size ?? 11, bold: !!opt.bold, italic: !!opt.italic, color: { argb: opt.color ?? 'FF000000' } }
      cell.alignment = { horizontal: opt.align ?? 'left', vertical: 'middle', wrapText: !!opt.wrap }
      if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } }
      if (opt.border !== false) cell.border = BORDER
    }
    const mergeVal = (range: string, value: any, opt: any = {}) => {
      ws.mergeCells(range)
      const cell = ws.getCell(range.split(':')[0])
      cell.value = value
      styleCell(cell, opt)
      return cell
    }

    // Header công ty
    mergeVal(`A${r}:C${r}`, 'CÔNG TY TNHH UNI', { bold: true, size: 12, border: false })
    mergeVal(`D${r}:N${r}`, 'Biểu mẫu: BM-CC-01', { size: 9, color: GREY, align: 'right', border: false })
    r++
    mergeVal(`A${r}:N${r}`, 'Phòng Kỹ thuật - Kinh doanh', { size: 10, italic: true, color: GREY, border: false })
    r += 2

    mergeVal(`A${r}:N${r}`, 'BẢNG TỔNG HỢP CHẤM CÔNG & CÔNG TÁC PHÍ', { bold: true, size: 16, align: 'center', color: NAVY, border: false })
    ws.getRow(r).height = 26
    r++
    mergeVal(`A${r}:N${r}`, `Tháng ${String(m).padStart(2, '0')} / ${y}`, { bold: true, size: 12, align: 'center', color: 'FF185FA5', border: false })
    r += 2

    mergeVal(`A${r}:D${r}`, `Số ngày làm việc trong tháng (theo cấu hình tuần): ${workDaysInMonth}`, { size: 10, color: GREY, border: false })
    mergeVal(`E${r}:H${r}`, `Tổng ngày nghỉ phép: ${statsRows.reduce((s, x) => s + Number(x.leave_count || 0), 0)} (không lương: ${statsRows.reduce((s, x) => s + Math.max(0, Number(x.leave_count || 0) - Math.min(Number(x.leave_count || 0), paidByUser[x.id] ?? 0)), 0)})`, { size: 10, color: GREY, border: false })
    mergeVal(`I${r}:N${r}`, `Trợ cấp công tác / ngày: ${dailyAllowance.toLocaleString('vi-VN')} đ`, { size: 10, color: GREY, align: 'right', border: false })
    r += 2

    // ── PHẦN I — CHẤM CÔNG ──────────────────────────────────
    mergeVal(`A${r}:N${r}`, 'I. CHẤM CÔNG', { bold: true, size: 11.5, color: WHITE, fill: NAVY, border: false })
    ws.getRow(r).height = 22
    r++

    const hdr1 = r
    const labels1: Record<string, string> = {
      A: 'TT', B: 'Họ và tên', C: 'Vai trò', D: 'Đúng giờ', E: 'Nghỉ phép',
      F: 'Có lương', G: 'Không lương', H: 'Vắng', I: 'Tổng ngày làm việc',
    }
    ws.mergeCells(`J${hdr1}:M${hdr1}`)
    for (let i = 1; i <= COLS; i++) styleCell(ws.getCell(hdr1, i), { fill: NAVY_LT })
    Object.entries(labels1).forEach(([col, label]) => { const c = ws.getCell(`${col}${hdr1}`); c.value = label; styleCell(c, { bold: true, size: 10, color: NAVY, align: 'center', fill: NAVY_LT, wrap: true }) })
    ws.getCell(`J${hdr1}`).value = 'Chi tiết ngày nghỉ phép / vắng'; styleCell(ws.getCell(`J${hdr1}`), { bold: true, size: 10, color: NAVY, align: 'center', fill: NAVY_LT, wrap: true })
    ws.getCell(`N${hdr1}`).value = 'Ghi chú'; styleCell(ws.getCell(`N${hdr1}`), { bold: true, size: 10, color: NAVY, align: 'center', fill: NAVY_LT, wrap: true })
    ws.getRow(hdr1).height = 30
    r++

    const firstRow1 = r
    statsRows.forEach((s: any, idx: number) => {
      const row = r
      const leaveCount = Number(s.leave_count || 0)
      const paid = Math.min(leaveCount, paidByUser[s.id] ?? 0)
      const unpaid = Math.round((leaveCount - paid) * 2) / 2
      ws.getCell(`A${row}`).value = idx + 1
      ws.getCell(`B${row}`).value = s.full_name
      ws.getCell(`C${row}`).value = ROLE_LABEL[s.role] ?? s.role
      ws.getCell(`D${row}`).value = Number(s.present_count || 0)
      ws.getCell(`E${row}`).value = leaveCount
      ws.getCell(`F${row}`).value = paid
      ws.getCell(`G${row}`).value = { formula: `E${row}-F${row}` }
      ws.getCell(`H${row}`).value = Number(s.absent_count || 0)
      ws.getCell(`I${row}`).value = { formula: `D${row}+E${row}+H${row}` }
      ws.mergeCells(`J${row}:M${row}`)
      ws.getCell(`J${row}`).value = (detailByUser[s.id] ?? []).join(', ')
      ws.getCell(`N${row}`).value = ''
      for (let i = 1; i <= COLS; i++) {
        const col = String.fromCharCode(64 + i)
        const cell = ws.getCell(`${col}${row}`)
        const align = ['A', 'D', 'E', 'F', 'G', 'H', 'I'].includes(col) ? 'center' : 'left'
        const color = (col === 'G' && unpaid > 0) ? AMBER : (col === 'H' && Number(s.absent_count) > 0) ? RED : 'FF000000'
        styleCell(cell, { align, bold: col === 'B', color, wrap: col === 'J' })
        if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } }
      }
      r++
    })
    const lastRow1 = r - 1
    mergeVal(`A${r}:C${r}`, 'Tổng cộng', { bold: true, align: 'right', fill: BLUE_LT })
    ;['D', 'E', 'F', 'G', 'H', 'I'].forEach(col => {
      const cell = ws.getCell(`${col}${r}`)
      cell.value = { formula: `SUM(${col}${firstRow1}:${col}${lastRow1})` }
      styleCell(cell, { bold: true, align: 'center', fill: BLUE_LT })
    })
    ws.mergeCells(`J${r}:N${r}`); styleCell(ws.getCell(`J${r}`), { fill: BLUE_LT })
    r += 2

    // ── PHẦN II — CÔNG TÁC TỈNH (CHỦ NHẬT / LỄ) ─────────────
    mergeVal(`A${r}:N${r}`, 'II. CÔNG TÁC TỈNH (CHỦ NHẬT / NGÀY LỄ)', { bold: true, size: 11.5, color: WHITE, fill: NAVY, border: false })
    ws.getRow(r).height = 22
    r++

    const hdr2 = r
    const labels2: Record<string, string> = { A: 'TT', B: 'Ngày', C: 'Họ và tên', D: 'Vai trò', E: 'Địa điểm / Khách hàng', I: 'Phương tiện', J: 'Loại ngày', K: 'Ghi chú' }
    ws.mergeCells(`E${hdr2}:H${hdr2}`); ws.mergeCells(`K${hdr2}:N${hdr2}`)
    for (let i = 1; i <= COLS; i++) styleCell(ws.getCell(hdr2, i), { fill: NAVY_LT })
    Object.entries(labels2).forEach(([col, label]) => { const c = ws.getCell(`${col}${hdr2}`); c.value = label; styleCell(c, { bold: true, size: 10, color: NAVY, align: 'center', fill: NAVY_LT, wrap: true }) })
    ws.getRow(hdr2).height = 22
    r++

    sundayRows.sort((a, b) => a.date.getTime() - b.date.getTime())
    if (sundayRows.length === 0) {
      mergeVal(`A${r}:N${r}`, 'Không có công tác Chủ nhật / Lễ trong tháng', { align: 'center', color: GREY, italic: true })
      r++
    } else {
      sundayRows.forEach((s, idx) => {
        const row = r
        ws.getCell(`A${row}`).value = idx + 1
        ws.getCell(`B${row}`).value = `${String(s.date.getDate()).padStart(2, '0')}/${String(s.date.getMonth() + 1).padStart(2, '0')}/${s.date.getFullYear()}`
        ws.getCell(`C${row}`).value = s.name
        ws.getCell(`D${row}`).value = ROLE_LABEL[s.role] ?? s.role
        ws.mergeCells(`E${row}:H${row}`)
        ws.getCell(`E${row}`).value = s.place
        ws.getCell(`I${row}`).value = ''
        ws.getCell(`J${row}`).value = 'Chủ nhật'
        ws.mergeCells(`K${row}:N${row}`)
        ws.getCell(`K${row}`).value = ''
        for (let i = 1; i <= COLS; i++) {
          const col = String.fromCharCode(64 + i)
          const align = ['A', 'B', 'J'].includes(col) ? 'center' : 'left'
          styleCell(ws.getCell(`${col}${row}`), { align, bold: col === 'C' })
        }
        r++
      })
    }
    r++

    // ── PHẦN III — CHI PHÍ CÔNG TÁC TRONG THÁNG ─────────────
    mergeVal(`A${r}:N${r}`, 'III. CHI PHÍ CÔNG TÁC PHÁT SINH TRONG THÁNG', { bold: true, size: 11.5, color: WHITE, fill: NAVY, border: false })
    ws.getRow(r).height = 22
    r++

    const hdr3 = r
    const labels3: Record<string, string> = {
      A: 'TT', B: 'Họ và tên', C: 'Số ngày\ncông tác', D: 'Trợ cấp\nđi tỉnh', E: 'Di chuyển /\nXăng xe',
      F: 'Khách sạn', G: 'Ăn uống', H: 'Khác', I: 'Tổng chi', J: 'Tạm ứng', K: 'Hoàn\ntạm ứng', L: 'Trạng thái',
    }
    ws.mergeCells(`L${hdr3}:N${hdr3}`)
    for (let i = 1; i <= COLS; i++) styleCell(ws.getCell(hdr3, i), { fill: NAVY_LT })
    Object.entries(labels3).forEach(([col, label]) => { const c = ws.getCell(`${col}${hdr3}`); c.value = label; styleCell(c, { bold: true, size: 10, color: NAVY, align: 'center', fill: NAVY_LT, wrap: true }) })
    ws.getRow(hdr3).height = 30
    r++

    const firstRow3 = r
    const expenseList = Object.values(expenseByUser)
    expenseList.forEach((acc, idx) => {
      const row = r
      ws.getCell(`A${row}`).value = idx + 1
      ws.getCell(`B${row}`).value = acc.name
      ws.getCell(`C${row}`).value = acc.days
      ws.getCell(`D${row}`).value = acc.allowance
      ws.getCell(`E${row}`).value = acc.transport
      ws.getCell(`F${row}`).value = acc.hotel
      ws.getCell(`G${row}`).value = acc.meal
      ws.getCell(`H${row}`).value = acc.other
      ws.getCell(`I${row}`).value = { formula: `SUM(D${row}:H${row})` }
      ws.getCell(`J${row}`).value = acc.advance
      ws.getCell(`K${row}`).value = { formula: `J${row}-I${row}` }
      ws.mergeCells(`L${row}:N${row}`)
      ws.getCell(`L${row}`).value = statusLabel(acc.statuses)
      for (let i = 1; i <= COLS; i++) {
        const col = String.fromCharCode(64 + i)
        const cell = ws.getCell(`${col}${row}`)
        const money = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].includes(col)
        if (money) cell.numFmt = '#,##0'
        const align = ['A', 'C', 'L'].includes(col) ? 'center' : (money ? 'right' : 'left')
        styleCell(cell, { align, bold: ['I', 'K'].includes(col), color: col === 'K' ? GREEN : 'FF000000' })
      }
      r++
    })
    if (expenseList.length === 0) {
      mergeVal(`A${r}:N${r}`, 'Không có chi phí công tác phát sinh trong tháng', { align: 'center', color: GREY, italic: true })
      r++
    } else {
      const lastRow3 = r - 1
      mergeVal(`A${r}:C${r}`, 'Tổng cộng', { bold: true, align: 'right', fill: BLUE_LT })
      ;['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(col => {
        const cell = ws.getCell(`${col}${r}`)
        cell.value = { formula: `SUM(${col}${firstRow3}:${col}${lastRow3})` }
        cell.numFmt = '#,##0'
        styleCell(cell, { bold: true, align: 'right', fill: BLUE_LT })
      })
      ws.mergeCells(`L${r}:N${r}`); styleCell(ws.getCell(`L${r}`), { fill: BLUE_LT })
      r++
    }
    r += 2

    // ── Khu vực ký duyệt ─────────────────────────────────────
    const signLabels = ['Người lập bảng', 'Quản lý trực tiếp', 'Kế toán', 'Giám đốc']
    const signCols: [string, string][] = [['A', 'C'], ['D', 'F'], ['G', 'I'], ['J', 'N']]
    signLabels.forEach((label, i) => mergeVal(`${signCols[i][0]}${r}:${signCols[i][1]}${r}`, label, { bold: true, align: 'center', border: false }))
    r++
    signCols.forEach(([c1, c2]) => mergeVal(`${c1}${r}:${c2}${r}`, '(Ký, ghi rõ họ tên)', { italic: true, size: 9, color: GREY, align: 'center', border: false }))
    r += 5
    signCols.forEach(([c1, c2]) => ws.mergeCells(`${c1}${r}:${c2}${r}`))

    ws.pageSetup.printArea = `A1:N${r}`

    // ── Lưu file ─────────────────────────────────────────────
    const savePath = await _dialog.showSaveDialog({
      title: 'Lưu bảng tổng hợp chấm công',
      defaultPath: `Bang_tong_hop_cham_cong_T${m}_${y}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (savePath.canceled || !savePath.filePath) return { error: 'Đã huỷ' }

    await wb.xlsx.writeFile(savePath.filePath)
    return { success: true, path: savePath.filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ── LEAVE REQUESTS — Xin nghỉ phép ───────────────────────────────────────────

ipcMain.handle('leave:getMy', async (_e, params?: any) => {
  const q = params ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&status=${params.status ?? ''}` : ''
  try { return await api.get(`/leave-requests/my${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:getAll', async (_e, params?: any) => {
  const q = params
    ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&status=${params.status ?? ''}&user_id=${params.user_id ?? ''}`
    : ''
  try { return await api.get(`/leave-requests${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:create', async (_e, data: any) => {
  try { return await api.post('/leave-requests', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/leave-requests/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:cancel', async (_e, id: number) => {
  try { return await api.delete(`/leave-requests/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:approve', async (_e, id: number) => {
  try { return await api.put(`/leave-requests/${id}/approve`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:reject', async (_e, id: number, note?: string) => {
  try { return await api.put(`/leave-requests/${id}/reject`, { note }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:getMyBalance', async (_e, year?: number) => {
  try { return await api.get(`/leave-requests/balances/my?year=${year ?? ''}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:getAllBalances', async (_e, year?: number) => {
  try { return await api.get(`/leave-requests/balances?year=${year ?? ''}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:setBalance', async (_e, userId: number, year: number, total_days: number) => {
  try { return await api.put(`/leave-requests/balances/${userId}`, { year, total_days }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('leave:recalculateBalances', async (_e, year?: number) => {
  try { return await api.put(`/leave-requests/recalculate-balances?year=${year ?? ''}`, {}) }
  catch (err: any) { return { error: err.message } }
})

// ── BUSINESS TRIPS — Chi phí công tác ────────────────────────────────────────

ipcMain.handle('businessTrips:getAllowance', async () => {
  try { return await api.get('/business-trips/allowance') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:setAllowance', async (_e, amount: number) => {
  try { return await api.put('/business-trips/allowance', { amount }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:getMy', async (_e, params?: any) => {
  const q = params ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&status=${params.status ?? ''}` : ''
  try { return await api.get(`/business-trips/my${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:getAll', async (_e, params?: any) => {
  const q = params
    ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&user_id=${params.user_id ?? ''}&status=${params.status ?? ''}`
    : ''
  try { return await api.get(`/business-trips${q}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:getById', async (_e, id: number) => {
  try { return await api.get(`/business-trips/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:create', async (_e, data: any) => {
  try { return await api.post('/business-trips', data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:update', async (_e, id: number, data: any) => {
  try { return await api.put(`/business-trips/${id}`, data) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:delete', async (_e, id: number) => {
  try { return await api.delete(`/business-trips/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:approve', async (_e, id: number) => {
  try { return await api.put(`/business-trips/${id}/approve`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:reject', async (_e, id: number, note?: string) => {
  try { return await api.put(`/business-trips/${id}/reject`, { note }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:markPaid', async (_e, id: number) => {
  try { return await api.put(`/business-trips/${id}/mark-paid`, {}) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('businessTrips:exportExcel', async (_e, id: number) => {
  try {
    const ExcelJS = require('exceljs')
    const { dialog: _dialog } = require('electron')
    const trip: any = await api.get(`/business-trips/${id}`)

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('vi-VN') : ''
    const fmtNum  = (n: any) => Number(n || 0)

    const CATEGORY_LABEL: Record<string, string> = {
      allowance:  'Tro cap di tinh',
      hotel:      'Khach san',
      meal:       'An uong',
      transport:  'Di chuyen/Xang xe',
      bus_ticket: 'Ve xe khach',
      flight:     'Ve may bay',
      train:      'Ve tau',
      taxi:       'Xe om/Taxi',
      other:      'Khac',
    }

    const items: any[] = trip.items ?? []

    const locationSet = new Set<string>()
    const saleSet     = new Set<string>()
    items.forEach((item: any) => {
      const loc = [item.ward, item.province].filter(Boolean).join(', ')
      if (loc) locationSet.add(loc)
      if (item.sale_person) saleSet.add(item.sale_person)
    })
    const locStr  = [...locationSet].join(' / ') || ''
    const saleStr = [...saleSet].join(', ') || ''

    const wb = new ExcelJS.Workbook()
    wb.creator = 'UNI BOM System'
    wb.created = new Date()
    const ws = wb.addWorksheet('Chi phi')
    ws.views = [{ showGridLines: false }]

    const C_HEADER  = '0D4C5C'
    const C_INFO_LB = '1A7A8A'
    const C_INFO_VB = 'EBF7FA'
    const C_TOTAL_B = 'FDF3E1'
    const C_ROW_ALT = 'F0F8F9'

    const solidFill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF' + hex } })
    const thinSide  = (c = 'CCCCCC') => ({ style: 'thin' as const, color: { argb: 'FF' + c } })
    const medSide   = (c = C_HEADER) => ({ style: 'medium' as const, color: { argb: 'FF' + c } })
    const thinBdr   = () => ({ top: thinSide(), left: thinSide(), right: thinSide(), bottom: thinSide() })
    const medBdr    = (c = C_HEADER) => ({ top: medSide(c), left: medSide(c), right: medSide(c), bottom: medSide(c) })

    ws.columns = [
      { key: 'a', width: 5  },
      { key: 'b', width: 12 },
      { key: 'c', width: 38 },
      { key: 'd', width: 11 },
      { key: 'e', width: 10 },
      { key: 'f', width: 17 },
      { key: 'g', width: 13 },
      { key: 'h', width: 14 },
      { key: 'i', width: 16 },
      { key: 'j', width: 20 },
    ]

    // Row 1: spacer
    ws.addRow([])
    ws.getRow(1).height = 6

    // Row 2: Title banner
    ws.addRow(['BAO CAO CONG TAC PHI'])
    ws.mergeCells('A2:J2')
    const titleCell = ws.getCell('A2')
    titleCell.value     = 'BÁO CÁO CÔNG TÁC PHÍ'
    titleCell.font      = { bold: true, size: 20, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
    titleCell.fill      = solidFill(C_HEADER)
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 31.2

    // Row 3: spacer
    ws.addRow([])
    ws.getRow(3).height = 6

    // Rows 4-8: Info block
    const infoRows: [string, string][] = [
      ['Ngay bao cao',      fmtDate(trip.report_date)],
      ['Nhan su bao cao',   trip.full_name ?? ''],
      ['Thoi gian',         trip.time_period ?? ''],
      ['Dia diem',          locStr],
      ['Kinh doanh',        saleStr],
    ]
    const infoLabels = [
      '📅  Ngày báo cáo',
      '👤  Nhân sự báo cáo',
      '⏰  Thời gian',
      '📍  Địa điểm',
      '🏢  Kinh doanh',
    ]
    infoRows.forEach(([, value], ri) => {
      const rowNum = 4 + ri
      ws.addRow([infoLabels[ri], '', '', value, '', '', '', '', '', ''])
      ws.mergeCells('A' + rowNum + ':C' + rowNum)
      ws.mergeCells('D' + rowNum + ':J' + rowNum)
      const lc = ws.getCell('A' + rowNum)
      lc.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
      lc.fill      = solidFill(C_INFO_LB)
      lc.alignment = { horizontal: 'left', vertical: 'middle' }
      lc.border    = { right: thinSide() }
      const vc = ws.getCell('D' + rowNum)
      vc.font      = { size: 10, color: { argb: 'FF4A6572' }, name: 'Arial' }
      vc.fill      = solidFill(C_INFO_VB)
      vc.alignment = { horizontal: 'left', vertical: 'middle' }
      ws.getRow(rowNum).height = 25.5
    })

    // Row 9: spacer
    ws.addRow([])
    ws.getRow(9).height = 7.5

    // Row 10: Table header
    const headers = ['TT', 'Ngày', 'Nội dung', 'Hóa đơn\n(CÓ/KO)', 'Số lượng', 'ĐG / Tổng tiền', 'Thành tiền', 'Tạm ứng', 'Hoàn tạm ứng', 'Ghi chú']
    ws.addRow(headers)
    const hRow = ws.getRow(10)
    hRow.height = 30
    hRow.eachCell((cell: any) => {
      cell.font      = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' }
      cell.fill      = solidFill(C_HEADER)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border    = { top: medSide(), bottom: medSide(), left: thinSide(), right: thinSide() }
    })

    // Data rows
    let currentDataRow = 11
    const totalAmount   = fmtNum(trip.total_amount)
    const advanceAmount = fmtNum(trip.advance_amount)

    items.forEach((item: any, idx: number) => {
      const expenses: any[] = Array.isArray(item.expenses) && item.expenses.length
        ? item.expenses
        : [{ category: 'other', description: '', has_invoice: false, quantity: 1, unit_price: 0, total_price: fmtNum(item.total_price) }]

      const rowStart = currentDataRow
      const isAlt    = idx % 2 === 1

      expenses.forEach((exp: any, ei: number) => {
        const catLabel  = CATEGORY_LABEL[exp.category] ?? 'Khac'
        const desc      = exp.description ? catLabel + ' - ' + exp.description : catLabel
        const qty       = fmtNum(exp.quantity) || 1
        const uprice    = fmtNum(exp.unit_price)
        const tprice    = fmtNum(exp.total_price)

        ws.addRow([
          '',
          '',
          desc,
          exp.has_invoice ? 'CO' : 'KO',
          qty > 1 ? qty : '',
          uprice > 0 && qty > 1 ? uprice : '',
          tprice,
          '',
          '',
          item.note ?? '',
        ])

        const r = ws.getRow(currentDataRow)
        r.height = 21.75
        r.eachCell({ includeEmpty: true }, (cell: any, colNum: number) => {
          cell.border = thinBdr()
          cell.fill   = solidFill(isAlt ? C_ROW_ALT : 'FFFFFF')
          cell.font   = { size: 10, color: { argb: 'FF1A1A2E' }, name: 'Arial' }
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
          if (colNum >= 5 && colNum <= 9) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' }
            if (typeof cell.value === 'number') cell.numFmt = '#,##0'
          }
          if (colNum === 1 || colNum === 2) cell.alignment = { horizontal: 'center', vertical: 'middle' }
          if (colNum === 4) cell.alignment = { horizontal: 'center', vertical: 'middle' }
        })

        // Invoice cell color
        const invCell = ws.getCell(currentDataRow, 4)
        invCell.value = exp.has_invoice ? 'CÓ' : 'KO'
        if (exp.has_invoice) {
          invCell.font = { size: 10, bold: true, color: { argb: 'FF0F6E56' }, name: 'Arial' }
          invCell.fill = solidFill('EAF3DE')
        } else {
          invCell.font = { size: 10, color: { argb: 'FF854F0B' }, name: 'Arial' }
          invCell.fill = solidFill('FAEEDA')
        }

        currentDataRow++
      })

      const rowEnd = currentDataRow - 1

      // Set date & TT on first sub-row
      ws.getCell(rowStart, 1).value = idx + 1
      ws.getCell(rowStart, 2).value = fmtDate(item.date)

      // Merge date & TT columns across expense lines for this day
      if (rowEnd > rowStart) {
        [1, 2].forEach(col => {
          ws.mergeCells(rowStart, col, rowEnd, col)
          const mc = ws.getCell(rowStart, col)
          mc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        })
      }
    })

    // Total row
    const totalRowNum = currentDataRow
    const returnAmt   = advanceAmount - totalAmount
    ws.addRow(['TONG CONG', '', '', '', '', '', totalAmount, advanceAmount, returnAmt, ''])
    ws.mergeCells('A' + totalRowNum + ':F' + totalRowNum)
    ws.getRow(totalRowNum).height = 30

    const totalLabel = ws.getCell('A' + totalRowNum)
    totalLabel.value = 'TỔNG CỘNG'
    totalLabel.font  = { bold: true, size: 11, color: { argb: 'FF' + C_HEADER }, name: 'Arial' }
    totalLabel.fill  = solidFill(C_TOTAL_B)
    totalLabel.alignment = { horizontal: 'right', vertical: 'middle' }
    totalLabel.border = medBdr(C_TOTAL_B)

    ;['G', 'H', 'I', 'J'].forEach(col => {
      const cell = ws.getCell(col + totalRowNum)
      cell.font   = { bold: true, size: 11, color: { argb: 'FF' + C_HEADER }, name: 'Arial' }
      cell.fill   = solidFill(C_TOTAL_B)
      cell.border = medBdr(C_HEADER)
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      if (typeof cell.value === 'number') cell.numFmt = '#,##0'
    })

    // Spacer
    ws.addRow([])
    ws.getRow(totalRowNum + 1).height = 9.75

    // Signature
    const today = new Date()
    const sigDateStr = 'TP. HCM, ngay ' + today.getDate().toString().padStart(2,'0') + ' thang ' + (today.getMonth()+1).toString().padStart(2,'0') + ' nam ' + today.getFullYear()
    
    const sigRow1 = totalRowNum + 2
    ws.addRow(['', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells('F' + sigRow1 + ':J' + sigRow1)
    const sigDateCell = ws.getCell('F' + sigRow1)
    sigDateCell.value = 'TP. HCM, ngày ' + today.getDate().toString().padStart(2,'0') + ' tháng ' + (today.getMonth()+1).toString().padStart(2,'0') + ' năm ' + today.getFullYear()
    sigDateCell.font      = { italic: true, size: 10, color: { argb: 'FF4A6572' }, name: 'Arial' }
    sigDateCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(sigRow1).height = 21.75

    const sigRow2 = sigRow1 + 1
    ws.addRow(['', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells('F' + sigRow2 + ':J' + sigRow2)
    const sigLblCell = ws.getCell('F' + sigRow2)
    sigLblCell.value = 'Ký xác nhận'
    sigLblCell.font      = { bold: true, size: 10, color: { argb: 'FF' + C_HEADER }, name: 'Arial' }
    sigLblCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(sigRow2).height = 30

    const sigRow3 = sigRow2 + 1
    ws.addRow(['', '', '', '', '', '', '', '', '', ''])
    ws.mergeCells('F' + sigRow3 + ':J' + sigRow3)
    const sigSubCell = ws.getCell('F' + sigRow3)
    sigSubCell.value = '(Ký và ghi rõ họ tên)'
    sigSubCell.font      = { size: 9, color: { argb: 'FF4A6572' }, name: 'Arial' }
    sigSubCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(sigRow3).height = 39.75

    ws.addRow([])
    ws.getRow(sigRow3 + 1).height = 7.5

    // Save dialog
    const safeName = (trip.full_name ?? 'NhanVien').replace(/\s+/g, '_')
    const dateStr  = fmtDate(trip.report_date).replace(/\//g, '-')
    const savePath = await _dialog.showSaveDialog({
      title: 'Luu bao cao cong tac phi',
      defaultPath: 'CongTacPhi_' + safeName + '_' + dateStr + '.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (savePath.canceled || !savePath.filePath) return { error: 'Da huy' }

    await wb.xlsx.writeFile(savePath.filePath)
    return { success: true, path: savePath.filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})

// Export tổng hợp nhiều báo cáo (ke_toan)
ipcMain.handle('businessTrips:exportSummary', async (_e, params?: any) => {
  try {
    const ExcelJS  = require('exceljs')
    const { dialog: _dialog } = require('electron')

    const q = params
      ? `?month=${params.month ?? ''}&year=${params.year ?? ''}&user_id=${params.user_id ?? ''}&status=${params.status ?? ''}`
      : ''
    const trips: any[] = await api.get(`/business-trips${q}`)

    // Lấy mức trợ cấp
    const allowanceData: any = await api.get('/business-trips/allowance')
    const dailyAllowance = Number(allowanceData?.daily_allowance ?? 150000)

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Tổng hợp công tác phí')

    const m = params?.month ?? new Date().getMonth() + 1
    const y = params?.year  ?? new Date().getFullYear()

    ws.mergeCells('A1:J1')
    const t1 = ws.getCell('A1')
    t1.value     = `TỔNG HỢP CHI PHÍ CÔNG TÁC THÁNG ${m}/${y}`
    t1.font      = { bold: true, size: 13 }
    t1.alignment = { horizontal: 'center' }

    ws.addRow([])

    const hRow = ws.addRow([
      'STT', 'Nhân viên', 'Vai trò', 'Ngày BC', 'Thời gian',
      'Tổng chi phí', 'Tạm ứng', 'Trợ cấp/ngày', 'Số ngày', 'Trợ cấp tổng', 'Hoàn TU', 'Trạng thái'
    ])
    hRow.font  = { bold: true }
    hRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } }

    const widths2 = [5, 22, 16, 12, 20, 16, 14, 14, 10, 14, 12, 12]
    widths2.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('vi-VN') : ''
    const statusLabel: Record<string, string> = {
      pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối'
    }

    trips.forEach((trip: any, idx: number) => {
      // Tính số ngày đi tỉnh = số "ngày công tác" có khoản chi loại "allowance" (Trợ cấp đi tỉnh)
      const items: any[] = trip.items ?? []
      const allowanceDays = items.filter((i: any) => {
        if (Array.isArray(i.expenses) && i.expenses.length) {
          return i.expenses.some((e: any) => e.category === 'allowance')
        }
        // fallback cho dữ liệu cũ chưa có expenses[]
        return (i.description ?? '').toLowerCase().includes('hỗ trợ đi tỉnh') ||
               (i.description ?? '').toLowerCase().includes('ho tro di tinh')
      }).length

      const allowanceTotal = allowanceDays * dailyAllowance

      const row = ws.addRow([
        idx + 1,
        trip.full_name,
        trip.role,
        fmtDate(trip.report_date),
        trip.time_period ?? '',
        Number(trip.total_amount),
        Number(trip.advance_amount),
        dailyAllowance,
        allowanceDays,
        allowanceTotal,
        Number(trip.return_amount),
        statusLabel[trip.status] ?? trip.status,
      ])

      ;[6, 7, 8, 10, 11].forEach(col => {
        row.getCell(col).numFmt    = '#,##0'
        row.getCell(col).alignment = { horizontal: 'right' }
      })
    })

    // Tổng
    ws.addRow([])
    const sumRow = ws.addRow([
      'TỔNG', '', '', '', '',
      trips.reduce((s, t) => s + Number(t.total_amount), 0),
      trips.reduce((s, t) => s + Number(t.advance_amount), 0),
      '', '', '', '', ''
    ])
    sumRow.font = { bold: true }
    ;[6, 7].forEach(col => {
      sumRow.getCell(col).numFmt    = '#,##0'
      sumRow.getCell(col).alignment = { horizontal: 'right' }
    })

    const savePath = await _dialog.showSaveDialog({
      title: 'Lưu tổng hợp công tác phí',
      defaultPath: `Tong_hop_cong_tac_phi_T${m}_${y}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (savePath.canceled || !savePath.filePath) return { error: 'Đã huỷ' }

    await wb.xlsx.writeFile(savePath.filePath)
    return { success: true, path: savePath.filePath }
  } catch (err: any) {
    return { error: err.message }
  }
})
// ── SCHEDULE — Lịch tuần ──────────────────────────────────────────────────
// Backend cần expose GET /schedule?week_start=&week_end=
//                       POST   /schedule
//                       PUT    /schedule/:id
//                       DELETE /schedule/:id

ipcMain.handle('schedule:getAll', async (_e, { week_start, week_end }: { week_start: string; week_end: string }) => {
  try {
    return await api.get('/schedule', { week_start, week_end })
  } catch (err: any) {
    console.error('[schedule:getAll]', err.message)
    return []
  }
})

ipcMain.handle('schedule:create', async (_e, data: any) => {
  try {
    return await api.post('/schedule', data)
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('schedule:update', async (_e, id: number, data: any) => {
  try {
    return await api.put(`/schedule/${id}`, data)
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('schedule:delete', async (_e, id: number) => {
  try {
    return await api.delete(`/schedule/${id}`)
  } catch (err: any) {
    return { error: err.message }
  }
})

// ── Nominatim (OpenStreetMap) — miễn phí, không cần API key ──────────────────
// Policy: max 1 req/s, User-Agent bắt buộc

const NOMINATIM_UA = 'UNI-BOM-System/1.0 (internal)'

// Throttle: đảm bảo không quá 1 req/s
let _lastNominatimCall = 0
async function nominatimFetch(url: string): Promise<any> {
  const now  = Date.now()
  const wait = Math.max(0, 1050 - (now - _lastNominatimCall))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _lastNominatimCall = Date.now()
  const res = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_UA,
      'Accept-Language': 'vi,en',
    },
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  return res.json()
}

ipcMain.handle('places:search', async (_e, query: string) => {
  try {
    if (!query?.trim()) return []

    // Nominatim /search — giới hạn trong Việt Nam, trả tối đa 8 kết quả
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q',              query + ', Việt Nam')
    url.searchParams.set('format',         'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit',          '8')
    url.searchParams.set('countrycodes',   'vn')
    url.searchParams.set('accept-language','vi')

    const data: any[] = await nominatimFetch(url.toString())

    return data.map((item: any) => {
      const addr = item.address ?? {}
      // Lấy tên ngắn nhất có nghĩa làm main_text
      const main = addr.amenity || addr.building || addr.road
                || addr.quarter || addr.suburb
                || addr.village || addr.town || addr.city
                || item.name || item.display_name.split(',')[0]
      // Phần còn lại làm secondary
      const parts = [
        addr.suburb || addr.quarter,
        addr.city_district || addr.district,
        addr.city || addr.town || addr.state,
      ].filter(Boolean)
      return {
        place_id:  String(item.osm_id),
        osm_type:  item.osm_type,
        main_text: main.trim(),
        secondary: parts.join(', '),
        lat:       parseFloat(item.lat),
        lng:       parseFloat(item.lon),
        address:   addr,
        source:    'osm',
      }
    })
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('places:detail', async (_e, place_id: string, osm_type?: string) => {
  try {
    // place_id ở đây là osm_id từ search, dùng /details để lấy thông tin đầy đủ
    // Nếu đã có address từ search result thì dùng luôn (được truyền qua place_id dạng JSON)
    let parsed: any = null
    try { parsed = JSON.parse(place_id) } catch { /* not JSON, use as osm_id */ }

    if (parsed?.address) {
      // Đã có address đầy đủ từ search, parse luôn không cần gọi thêm API
      const addr     = parsed.address
      const ward     = addr.amenity || addr.building || addr.road
                     || addr.quarter || addr.suburb || addr.village || ''
      const district = addr.city_district || addr.district || addr.county || ''
      const province = addr.state || addr.city || ''
      return {
        ward, district, province,
        address:   parsed.display_name ?? '',
        full_name: [ward, district, province].filter(Boolean).join(', '),
        lat: parsed.lat,
        lng: parsed.lng,
      }
    }

    // Fallback: gọi Nominatim /lookup
    const type = osm_type ?? 'N'  // N=node, W=way, R=relation
    const url  = new URL('https://nominatim.openstreetmap.org/lookup')
    url.searchParams.set('osm_ids',       `${type.charAt(0).toUpperCase()}${place_id}`)
    url.searchParams.set('format',        'jsonv2')
    url.searchParams.set('addressdetails','1')
    url.searchParams.set('accept-language','vi')

    const data: any[] = await nominatimFetch(url.toString())
    if (!data?.length) return { error: 'Không tìm thấy chi tiết địa điểm' }

    const item  = data[0]
    const addr  = item.address ?? {}
    const ward     = addr.amenity || addr.building || addr.road
                   || addr.quarter || addr.suburb || addr.village || item.name || ''
    const district = addr.city_district || addr.district || addr.county || ''
    const province = addr.state || addr.city || ''
    return {
      ward, district, province,
      address:   item.display_name ?? '',
      full_name: [ward, district, province].filter(Boolean).join(', '),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }
  } catch (err: any) {
    return { error: err.message }
  }
})

// ── WORKFLOWS ─────────────────────────────────────────────────
// api.get/post/put/delete đã dùng _token lưu trong main process (set lúc login)
// apiFetch unwrap { success, data } → trả về data trực tiếp, nên wrap lại

ipcMain.handle('workflows:getAll', async () => {
  try { return { success: true, data: await api.get('/workflows') } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getById', async (_e, id: number) => {
  try { return { success: true, data: await api.get(`/workflows/${id}`) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:create', async (_e, data: any) => {
  try { return { success: true, data: await api.post('/workflows', data) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:update', async (_e, id: number, data: any) => {
  try { return { success: true, data: await api.put(`/workflows/${id}`, data) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:delete', async (_e, id: number) => {
  try { return { success: true, data: await api.delete(`/workflows/${id}`) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getInstances', async () => {
  try { return { success: true, data: await api.get('/workflows/instances') } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:createInstance', async (_e, data: any) => {
  try { return { success: true, data: await api.post('/workflows/instances', data) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:updateInstance', async (_e, id: number, data: any) => {
  try { return { success: true, data: await api.put(`/workflows/instances/${id}`, data) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getStats', async () => {
  try { return { success: true, data: await api.get('/workflows/stats') } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getLinked', async () => {
  try { return { success: true, data: await api.get('/workflows/linked') } }
  catch (err: any) { return { success: false, error: err.message } }
})

// ── Workflow tiến độ cá nhân / tổng quan admin / chuyển trạng thái BOM / nhật ký công trình ──
ipcMain.handle('workflows:updateInstanceStep', async (_e, instanceId: number, stepId: number, data: any) => {
  try { return { success: true, data: await api.patch(`/workflows/instances/${instanceId}/steps/${stepId}`, data) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getMyProgress', async () => {
  try { return { success: true, data: await api.get('/workflows/my-progress') } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getAdminOverview', async () => {
  try { return { success: true, data: await api.get('/workflows/admin-overview') } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:transitionPom', async (_e, { pomId, action, note, reason }: { pomId: number; action: string; note?: string; reason?: string }) => {
  try { return { success: true, data: await api.post(`/workflows/poms/${pomId}/transition`, { action, note, reason }) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:addConstructionLog', async (_e, { pomId, log_type, title, content }: { pomId: number; log_type: string; title: string; content?: string }) => {
  try { return { success: true, data: await api.post(`/workflows/poms/${pomId}/construction-logs`, { log_type, title, content }) } }
  catch (err: any) { return { success: false, error: err.message } }
})

ipcMain.handle('workflows:getConstructionLogs', async (_e, { pomId }: { pomId: number }) => {
  try { return { success: true, data: await api.get(`/workflows/poms/${pomId}/construction-logs`) } }
  catch (err: any) { return { success: false, error: err.message } }
})