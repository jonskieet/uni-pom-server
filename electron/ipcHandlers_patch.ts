// electron/ipcHandlers.ts
// Toàn bộ IPC handlers — thay getDb() SQLite bằng apiFetch() → Render server
// UI/pages/hooks KHÔNG thay đổi gì

import { ipcMain, app, dialog } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, setToken, apiUpload, apiUploadBuffer } from './api'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ── AUTH ──────────────────────────────────────────────────────

ipcMain.handle('users:login', async (_e, username: string, password_hash: string) => {
  try {
    // apiFetch đã unwrap { success, data } → res = { token, user }
    const res = await api.post<{ token: string; user: any }>('/auth/login', {
      username,
      password: password_hash
    })
    setToken(res.token)
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

ipcMain.handle('users:resetPassword', async (_e, id: number, password: string) => {
  try { return await api.put(`/users/${id}/reset-password`, { password }) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('users:delete', async (_e, id: number) => {
  try { return await api.delete(`/users/${id}`) }
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

function _buildDataRow(rowNum: number, item: any, idx: number): string {
  const qty      = Number(item.quantity)   || 0
  const price    = Number(item.unit_price) || 0
  const vat      = Number(item.vat_rate)   || 0.10
  const subtotal = qty * price
  const vatAmt   = Math.round(subtotal * vat)
  const total    = subtotal + vatAmt
  const S        = _BG_STYLES
  const attr     = `r="${rowNum}" spans="1:13" s="47" customFormat="1" ht="18" customHeight="1"`
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
    sheetXml = sheetXml.replace(
      /<c r="I27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="I27" s="${S.I}"><f>SUM(I${FIRST_ROW}:I26)</f><v>0</v></c>`
    )
    sheetXml = sheetXml.replace(
      /<c r="K27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="K27" s="${S.K}"><f>SUM(K${FIRST_ROW}:K26)</f><v>0</v></c>`
    )
    sheetXml = sheetXml.replace(
      /<c r="L27"[^>]*><f>SUM\([^)]+\)<\/f><v>[^<]*<\/v><\/c>/,
      `<c r="L27" s="${S.L}"><f>SUM(L${FIRST_ROW}:L26)</f><v>0</v></c>`
    )
    zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf8'))

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

  const PREFERRED_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'deepseek/deepseek-r1-0528:free',
    'microsoft/phi-4-reasoning-plus:free',
    'qwen/qwen3-235b-a22b:free',
  ]

  async function fetchFreeModels(): Promise<string[]> {
    try {
      const { net } = await import('electron')
      return await new Promise<string[]>((resolve) => {
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
                .slice(0, 8)
                .map((m: any) => m.id as string)
              resolve(free)
            } catch { resolve([]) }
          })
        })
        req.on('error', () => resolve([]))
        req.end()
      })
    } catch { return [] }
  }

  const dynamicModels = await fetchFreeModels()
  const FREE_MODELS = [
    ...PREFERRED_MODELS,
    ...dynamicModels.filter(m => !PREFERRED_MODELS.includes(m)),
  ]

  const prompt = `Bạn là công cụ trích xuất dữ liệu từ bảng báo giá Excel của nhà cung cấp thiết bị IT tại Việt Nam.

Nhiệm vụ: Đọc bảng dưới đây và trích xuất danh sách sản phẩm gồm model code và đơn giá.

Quy tắc:
- "model": MÃ SẢN PHẨM / MODEL CODE (ví dụ: XGS1935-28HP, FG-401F, RS4826xs+, ECW220). KHÔNG phải tên hãng, KHÔNG phải mô tả dài.
- Model thường nằm ở: cột "Model", cột "Part Number", cột "PART", đầu tên sản phẩm, hoặc trong mô tả dạng "Model: XYZ".
- "price": ĐƠN GIÁ (không phải thành tiền). Ưu tiên giá chưa VAT. Nếu chỉ có giá đã VAT thì lấy giá đó. Đơn vị VNĐ số nguyên.
- Bỏ qua hàng tổng cộng, tiêu đề, ghi chú.
- Nếu 1 sản phẩm xuất hiện nhiều lần, lấy lần đầu tiên.

Trả về JSON array thuần túy, KHÔNG có markdown, KHÔNG có giải thích:
[{"model":"...","price":123456},...]

File: ${fileName}

Dữ liệu bảng:
${sheetText.slice(0, 12000)}`

  async function callModel(modelId: string): Promise<any> {
    const { net } = await import('electron')
    return new Promise<any>((resolve, reject) => {
      const TIMEOUT_MS = 30_000
      let settled = false
      const done = (fn: () => void) => { if (!settled) { settled = true; fn() } }
      const timer = setTimeout(() => {
        done(() => reject(new Error(`Timeout sau 30s (model: ${modelId})`)))
        try { request.abort() } catch {}
      }, TIMEOUT_MS)
      const request = net.request({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions' })
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Authorization', `Bearer ${apiKey}`)
      request.setHeader('HTTP-Referer', 'https://uni-pom.app')
      request.setHeader('X-Title', 'UNI POM')
      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { body += chunk.toString() })
        response.on('end', () => {
          clearTimeout(timer)
          try { done(() => resolve(JSON.parse(body))) }
          catch { done(() => reject(new Error('Invalid JSON: ' + body.slice(0, 200)))) }
        })
      })
      request.on('error', (err) => { clearTimeout(timer); done(() => reject(err)) })
      request.write(JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 2048,
      }))
      request.end()
    })
  }

  async function tryModel(modelId: string): Promise<{ data: any[]; modelId: string }> {
    const res = await callModel(modelId)
    if (res.error) throw new Error(res.error.message ?? JSON.stringify(res.error))
    const raw = res?.choices?.[0]?.message?.content ?? ''
    if (!raw.trim()) throw new Error(`${modelId} trả về rỗng`)
    const match = raw.match(/\[[\s\S]*?\]/s)
    if (!match) throw new Error(`${modelId} không trả về JSON array`)
    const items = JSON.parse(match[0])
    if (!Array.isArray(items) || items.length === 0) throw new Error(`${modelId} trả về array rỗng`)
    const valid = items.filter((x: any) =>
      x && typeof x.model === 'string' && x.model.trim().length > 0 &&
      typeof x.price === 'number' && x.price > 0
    )
    if (valid.length === 0) throw new Error(`${modelId} không có item hợp lệ`)
    return { data: valid, modelId }
  }

  try {
    const result = await Promise.any(FREE_MODELS.map(m => tryModel(m)))
    return { data: result.data, model_used: result.modelId }
  } catch (err: any) {
    const errors = err?.errors?.map((e: any) => e.message).join(' | ') ?? err.message ?? String(err)
    return { data: [], error: `Tất cả model đều thất bại: ${errors}` }
  }
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
    await new Promise(r => setTimeout(r, 30)) // yield ≥1 frame so renderer can paint

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
// ── WARDS / UBND ─────────────────────────────────────────────

ipcMain.handle('provinces:getAll', async () => {
  try { return await api.get('/provinces') }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('districts:getAll', async (_e, params?: any) => {
  try {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return await api.get(`/districts${qs}`)
  } catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wards:getAll', async (_e, params?: any) => {
  try {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return await api.get(`/wards${qs}`)
  } catch (err: any) { return { error: err.message } }
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

ipcMain.handle('contacts:getAll', async (_e, params?: any) => {
  try {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return await api.get(`/contacts${qs}`)
  } catch (err: any) { return { error: err.message } }
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

ipcMain.handle('wardActivities:getAll', async (_e, ward_id: number) => {
  try { return await api.get(`/ward-activities?ward_id=${ward_id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('wardActivities:create', async (_e, data: any) => {
  try { return await api.post('/ward-activities', data) }
  catch (err: any) { return { error: err.message } }
})