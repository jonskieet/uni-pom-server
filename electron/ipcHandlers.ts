// electron/ipcHandlers.ts
// Toàn bộ IPC handlers — thay getDb() SQLite bằng apiFetch() → Render server
// UI/pages/hooks KHÔNG thay đổi gì

import { ipcMain, app, dialog } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { api, setToken, apiUpload } from './api'

const require = createRequire(import.meta.url)

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
      return { ...res.user, ...me }
    } catch {
      return res.user   // fallback về login response nếu /me lỗi
    }
  } catch (err: any) {
    return { error: err.message }
  }
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
  try { return await api.put(`/users/${id}`, data) }
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

ipcMain.handle('poms:delete', async (_e, id: number) => {
  try { return await api.delete(`/poms/${id}`) }
  catch (err: any) { return { error: err.message } }
})

ipcMain.handle('pomItems:upsert', async (_e, pom_id: number, items: any[]) => {
  try { return await api.put(`/poms/${pom_id}/items`, { items }) }
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
