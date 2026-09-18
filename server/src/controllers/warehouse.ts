// ============================================================
// server/src/controllers/warehouse.ts — UNI IMS (Quản lý kho)
// Dùng $queryRaw / $executeRaw để KHÔNG cần sửa schema.prisma
// (không phải chạy prisma generate / db push khi deploy Render)
//
// Quy ước nghiệp vụ:
//  - Phiếu có 3 trạng thái: draft (nháp) → posted (đã ghi sổ) → cancelled
//  - Tồn kho (wh_stocks) CHỈ thay đổi khi phiếu được ghi sổ (post)
//  - Mọi thay đổi tồn đều ghi 1 dòng vào sổ nhật ký wh_movements
//  - Giá vốn bình quân gia quyền (avg_cost) cập nhật khi ghi sổ phiếu nhập
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, Prisma } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

type Tx = Prisma.TransactionClient

// ── Helpers ───────────────────────────────────────────────────────────
const num = (v: any, def = 0): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : def
}
const int = (v: any): number | null => {
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}
const str = (v: any): string | null => {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Sinh mã phiếu dạng PN2609-0001 (prefix + YYMM + số thứ tự trong tháng) */
async function nextCode(tx: Tx, table: string, prefix: string): Promise<string> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const head = `${prefix}${yy}${mm}-`
  const rows = await tx.$queryRawUnsafe<{ max_code: string | null }[]>(
    `SELECT MAX(code) AS max_code FROM public.${table} WHERE code LIKE $1`,
    `${head}%`
  )
  const last = rows[0]?.max_code
  const seq = last ? parseInt(last.slice(head.length), 10) + 1 : 1
  return head + String(seq).padStart(4, '0')
}

/** Validate danh sách dòng hàng của phiếu */
function parseLines(raw: any, opts: { price?: boolean } = {}): Array<{
  item_id: number; quantity: number; unit_price: number; note: string | null
}> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, 'Phiếu phải có ít nhất 1 dòng hàng')
  }
  return raw.map((l: any, idx: number) => {
    const item_id = int(l.item_id)
    const quantity = num(l.quantity)
    if (!item_id) throw new AppError(400, `Dòng ${idx + 1}: thiếu mặt hàng`)
    if (!(quantity > 0)) throw new AppError(400, `Dòng ${idx + 1}: số lượng phải lớn hơn 0`)
    return {
      item_id,
      quantity,
      unit_price: opts.price === false ? 0 : num(l.unit_price),
      note: str(l.note),
    }
  })
}

/** Cộng / trừ tồn kho + ghi sổ nhật ký. delta > 0 = nhập, delta < 0 = xuất */
async function applyMovement(tx: Tx, p: {
  warehouse_id: number
  item_id: number
  delta: number
  unit_price: number
  movement_type: 'receipt' | 'issue' | 'transfer_in' | 'transfer_out' | 'count_adjust'
  ref_table: string
  ref_id: number
  ref_code: string
  user_id: number | null
  note?: string | null
  /** Với kiểm kê: set tồn về đúng giá trị tuyệt đối thay vì cộng dồn */
  absolute?: number
}) {
  const { warehouse_id, item_id, delta, unit_price, movement_type, ref_table, ref_id, ref_code, user_id } = p

  // Khoá dòng tồn hiện tại (nếu có) để tránh race khi 2 phiếu ghi sổ cùng lúc
  const cur = await tx.$queryRawUnsafe<{ quantity: number; avg_cost: number }[]>(
    `SELECT quantity::float8 AS quantity, avg_cost::float8 AS avg_cost
       FROM public.wh_stocks WHERE warehouse_id = $1 AND item_id = $2 FOR UPDATE`,
    warehouse_id, item_id
  )
  const curQty  = cur.length ? num(cur[0].quantity) : 0
  const curCost = cur.length ? num(cur[0].avg_cost) : 0

  const newQty = p.absolute !== undefined ? p.absolute : curQty + delta

  if (newQty < 0) {
    const info = await tx.$queryRawUnsafe<{ sku: string; name: string; unit: string }[]>(
      `SELECT sku, name, unit FROM public.wh_items WHERE id = $1`, item_id
    )
    const it = info[0]
    throw new AppError(400,
      `Không đủ tồn kho cho "${it?.sku ?? item_id} — ${it?.name ?? ''}": tồn hiện tại ${curQty} ${it?.unit ?? ''}, cần xuất ${Math.abs(delta)}`)
  }

  // Giá vốn bình quân gia quyền — chỉ tính lại khi nhập hàng có giá
  let newCost = curCost
  if (delta > 0 && unit_price > 0) {
    const totalValue = curQty * curCost + delta * unit_price
    newCost = newQty > 0 ? totalValue / newQty : unit_price
  } else if (curQty <= 0 && unit_price > 0) {
    newCost = unit_price
  }

  if (cur.length) {
    await tx.$executeRawUnsafe(
      `UPDATE public.wh_stocks SET quantity = $1, avg_cost = $2, updated_at = NOW()
        WHERE warehouse_id = $3 AND item_id = $4`,
      newQty, newCost, warehouse_id, item_id
    )
  } else {
    await tx.$executeRawUnsafe(
      `INSERT INTO public.wh_stocks (warehouse_id, item_id, quantity, avg_cost)
       VALUES ($1, $2, $3, $4)`,
      warehouse_id, item_id, newQty, newCost
    )
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO public.wh_movements
       (warehouse_id, item_id, movement_type, ref_table, ref_id, ref_code,
        quantity, unit_price, balance_after, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    warehouse_id, item_id, movement_type, ref_table, ref_id, ref_code,
    p.absolute !== undefined ? newQty - curQty : delta,
    unit_price || newCost, newQty, p.note ?? null, user_id
  )

  return { before: curQty, after: newQty }
}

const userId = (req: Request): number | null => (req.user?.id ?? null)

// ============================================================
// DASHBOARD — số liệu tổng quan
// ============================================================
export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const warehouseId = int(req.query.warehouse_id)
  const whFilter = warehouseId ? Prisma.sql`AND s.warehouse_id = ${warehouseId}` : Prisma.empty

  const [summary] = await prisma.$queryRaw<any[]>`
    SELECT
      (SELECT COUNT(*)::int FROM public.wh_items WHERE is_active) AS total_items,
      (SELECT COUNT(*)::int FROM public.wh_warehouses WHERE is_active) AS total_warehouses,
      COALESCE(SUM(s.quantity * s.avg_cost), 0)::float8 AS total_value,
      COALESCE(SUM(s.quantity), 0)::float8 AS total_quantity,
      COUNT(*) FILTER (WHERE s.quantity <= 0)::int AS out_of_stock,
      COUNT(*) FILTER (WHERE i.min_qty > 0 AND s.quantity > 0 AND s.quantity <= i.min_qty)::int AS low_stock
    FROM public.wh_stocks s
    JOIN public.wh_items i ON i.id = s.item_id
    WHERE 1 = 1 ${whFilter}
  `

  const [docs] = await prisma.$queryRaw<any[]>`
    SELECT
      (SELECT COUNT(*)::int FROM public.wh_receipts  WHERE status = 'draft')  AS draft_receipts,
      (SELECT COUNT(*)::int FROM public.wh_issues    WHERE status = 'draft')  AS draft_issues,
      (SELECT COUNT(*)::int FROM public.wh_transfers WHERE status = 'draft')  AS draft_transfers,
      (SELECT COUNT(*)::int FROM public.wh_counts    WHERE status = 'draft')  AS draft_counts,
      (SELECT COUNT(*)::int FROM public.wh_movements WHERE created_at::date = CURRENT_DATE) AS today_movements,
      (SELECT COUNT(*)::int FROM public.wh_movements WHERE created_at::date = CURRENT_DATE - 1) AS yesterday_movements
  `

  const byWarehouse = await prisma.$queryRaw<any[]>`
    SELECT w.id, w.code, w.name,
           COUNT(s.id)::int AS item_count,
           COALESCE(SUM(s.quantity), 0)::float8 AS quantity,
           COALESCE(SUM(s.quantity * s.avg_cost), 0)::float8 AS value
      FROM public.wh_warehouses w
      LEFT JOIN public.wh_stocks s ON s.warehouse_id = w.id
     WHERE w.is_active
     GROUP BY w.id, w.code, w.name
     ORDER BY value DESC
  `

  const alerts = await prisma.$queryRaw<any[]>`
    SELECT s.item_id, i.sku, i.name, i.unit, i.min_qty::float8 AS min_qty,
           s.quantity::float8 AS quantity, w.name AS warehouse_name, s.warehouse_id,
           CASE WHEN s.quantity <= 0 THEN 'out' ELSE 'low' END AS stock_status
      FROM public.wh_stocks s
      JOIN public.wh_items i      ON i.id = s.item_id
      JOIN public.wh_warehouses w ON w.id = s.warehouse_id
     WHERE i.is_active
       AND (s.quantity <= 0 OR (i.min_qty > 0 AND s.quantity <= i.min_qty))
       ${warehouseId ? Prisma.sql`AND s.warehouse_id = ${warehouseId}` : Prisma.empty}
     ORDER BY (s.quantity <= 0) DESC, (s.quantity - i.min_qty) ASC
     LIMIT 12
  `

  const recent = await prisma.$queryRaw<any[]>`
    SELECT m.id, m.movement_type, m.ref_code, m.quantity::float8 AS quantity,
           m.balance_after::float8 AS balance_after, m.created_at,
           i.sku, i.name AS item_name, i.unit,
           w.name AS warehouse_name, u.full_name AS created_by_name
      FROM public.wh_movements m
      JOIN public.wh_items i      ON i.id = m.item_id
      JOIN public.wh_warehouses w ON w.id = m.warehouse_id
      LEFT JOIN public.users u    ON u.id = m.created_by
     WHERE 1 = 1 ${warehouseId ? Prisma.sql`AND m.warehouse_id = ${warehouseId}` : Prisma.empty}
     ORDER BY m.created_at DESC
     LIMIT 15
  `

  const trend = await prisma.$queryRaw<any[]>`
    WITH days AS (
      SELECT generate_series(CURRENT_DATE - 13, CURRENT_DATE, '1 day')::date AS d
    )
    SELECT d AS date,
           COALESCE(SUM(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END), 0)::float8 AS qty_in,
           COALESCE(SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE 0 END), 0)::float8 AS qty_out
      FROM days
      LEFT JOIN public.wh_movements m
             ON m.created_at::date = days.d
            ${warehouseId ? Prisma.sql`AND m.warehouse_id = ${warehouseId}` : Prisma.empty}
     GROUP BY d
     ORDER BY d
  `

  const topItems = await prisma.$queryRaw<any[]>`
    SELECT i.id, i.sku, i.name, i.unit,
           COALESCE(SUM(-m.quantity), 0)::float8 AS out_qty
      FROM public.wh_movements m
      JOIN public.wh_items i ON i.id = m.item_id
     WHERE m.quantity < 0
       AND m.created_at >= CURRENT_DATE - 30
       ${warehouseId ? Prisma.sql`AND m.warehouse_id = ${warehouseId}` : Prisma.empty}
     GROUP BY i.id, i.sku, i.name, i.unit
     ORDER BY out_qty DESC
     LIMIT 6
  `

  res.json(successResponse({
    summary: { ...summary, ...docs },
    by_warehouse: byWarehouse,
    alerts,
    recent_movements: recent,
    trend,
    top_items: topItems,
  }))
})

// ============================================================
// KHO
// ============================================================
export const getWarehouses = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT w.*, u.full_name AS manager_name,
           COALESCE(st.item_count, 0)::int    AS item_count,
           COALESCE(st.total_value, 0)::float8 AS total_value
      FROM public.wh_warehouses w
      LEFT JOIN public.users u ON u.id = w.manager_id
      LEFT JOIN (
        SELECT warehouse_id, COUNT(*) AS item_count, SUM(quantity * avg_cost) AS total_value
          FROM public.wh_stocks GROUP BY warehouse_id
      ) st ON st.warehouse_id = w.id
     ORDER BY w.name
  `
  res.json(successResponse(rows))
})

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const { code, name, address, phone, manager_id, note } = req.body
  if (!str(code) || !str(name)) throw new AppError(400, 'Thiếu mã kho hoặc tên kho')
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO public.wh_warehouses (code, name, address, phone, manager_id, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    str(code), str(name), str(address), str(phone), int(manager_id), str(note)
  )
  res.status(201).json(successResponse(rows[0]))
})

export const updateWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const { code, name, address, phone, manager_id, note, is_active } = req.body
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_warehouses SET
       code       = COALESCE($2, code),
       name       = COALESCE($3, name),
       address    = $4,
       phone      = $5,
       manager_id = $6,
       note       = $7,
       is_active  = COALESCE($8, is_active)
     WHERE id = $1 RETURNING *`,
    id, str(code), str(name), str(address), str(phone), int(manager_id), str(note),
    is_active === undefined ? null : Boolean(is_active)
  )
  if (!rows.length) throw new AppError(404, 'Không tìm thấy kho')
  res.json(successResponse(rows[0]))
})

export const deleteWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [used] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM public.wh_stocks WHERE warehouse_id = $1 AND quantity <> 0`, id
  )
  if (num(used?.n) > 0) throw new AppError(400, 'Kho vẫn còn tồn — không thể xoá. Hãy chuyển hết hàng hoặc ngừng hoạt động kho.')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_warehouses WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá kho'))
})

// ============================================================
// NHÀ CUNG CẤP
// ============================================================
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const search = str(req.query.search)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT s.*,
           (SELECT COUNT(*)::int FROM public.wh_receipts r WHERE r.supplier_id = s.id) AS receipt_count
      FROM public.wh_suppliers s
     WHERE ${search
        ? Prisma.sql`(s.name ILIKE ${'%' + search + '%'} OR s.code ILIKE ${'%' + search + '%'} OR s.phone ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
     ORDER BY s.name
  `
  res.json(successResponse(rows))
})

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { code, name, tax_code, phone, email, address, contact_person, note } = req.body
  if (!str(name)) throw new AppError(400, 'Thiếu tên nhà cung cấp')
  let finalCode = str(code)
  if (!finalCode) {
    const [row] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS n FROM public.wh_suppliers`)
    finalCode = 'NCC' + String(num(row?.n) + 1).padStart(4, '0')
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO public.wh_suppliers (code, name, tax_code, phone, email, address, contact_person, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    finalCode, str(name), str(tax_code), str(phone), str(email), str(address), str(contact_person), str(note)
  )
  res.status(201).json(successResponse(rows[0]))
})

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const { code, name, tax_code, phone, email, address, contact_person, note, is_active } = req.body
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_suppliers SET
       code = COALESCE($2, code), name = COALESCE($3, name), tax_code = $4,
       phone = $5, email = $6, address = $7, contact_person = $8, note = $9,
       is_active = COALESCE($10, is_active)
     WHERE id = $1 RETURNING *`,
    id, str(code), str(name), str(tax_code), str(phone), str(email), str(address),
    str(contact_person), str(note), is_active === undefined ? null : Boolean(is_active)
  )
  if (!rows.length) throw new AppError(404, 'Không tìm thấy nhà cung cấp')
  res.json(successResponse(rows[0]))
})

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_suppliers WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá nhà cung cấp'))
})

// ============================================================
// HÀNG HOÁ (SKU)
// ============================================================
export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const search      = str(req.query.search)
  const categoryId  = int(req.query.category_id)
  const warehouseId = int(req.query.warehouse_id)
  const status      = str(req.query.status)          // ok | low | out
  const limit       = Math.min(num(req.query.limit, 500), 2000)

  const rows = await prisma.$queryRaw<any[]>`
    SELECT i.id, i.sku, i.name, i.unit, i.spec, i.barcode, i.image_url, i.note,
           i.min_qty::float8 AS min_qty, i.max_qty::float8 AS max_qty,
           i.unit_cost::float8 AS unit_cost, i.is_active,
           i.category_id, i.brand_id, i.product_id,
           c.name AS category_name, b.name AS brand_name,
           COALESCE(st.total_qty, 0)::float8   AS total_qty,
           COALESCE(st.total_value, 0)::float8 AS total_value,
           COALESCE(st.wh_count, 0)::int       AS warehouse_count,
           CASE
             WHEN COALESCE(st.total_qty, 0) <= 0 THEN 'out'
             WHEN i.min_qty > 0 AND COALESCE(st.total_qty, 0) <= i.min_qty THEN 'low'
             ELSE 'ok'
           END AS stock_status
      FROM public.wh_items i
      LEFT JOIN public.categories c ON c.id = i.category_id
      LEFT JOIN public.brands     b ON b.id = i.brand_id
      LEFT JOIN (
        SELECT item_id,
               SUM(quantity) AS total_qty,
               SUM(quantity * avg_cost) AS total_value,
               COUNT(*) FILTER (WHERE quantity > 0) AS wh_count
          FROM public.wh_stocks
         WHERE ${warehouseId ? Prisma.sql`warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
         GROUP BY item_id
      ) st ON st.item_id = i.id
     WHERE ${search
        ? Prisma.sql`(i.sku ILIKE ${'%' + search + '%'} OR i.name ILIKE ${'%' + search + '%'} OR i.barcode ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
       AND ${categoryId ? Prisma.sql`i.category_id = ${categoryId}` : Prisma.sql`TRUE`}
       AND ${status === 'out'
        ? Prisma.sql`COALESCE(st.total_qty, 0) <= 0`
        : status === 'low'
        ? Prisma.sql`i.min_qty > 0 AND COALESCE(st.total_qty, 0) > 0 AND COALESCE(st.total_qty, 0) <= i.min_qty`
        : status === 'ok'
        ? Prisma.sql`COALESCE(st.total_qty, 0) > 0 AND (i.min_qty = 0 OR COALESCE(st.total_qty, 0) > i.min_qty)`
        : Prisma.sql`TRUE`}
     ORDER BY i.name
     LIMIT ${limit}
  `
  res.json(successResponse(rows))
})

export const getItemDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [item] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT i.*, i.min_qty::float8 AS min_qty, i.max_qty::float8 AS max_qty,
            i.unit_cost::float8 AS unit_cost,
            c.name AS category_name, b.name AS brand_name
       FROM public.wh_items i
       LEFT JOIN public.categories c ON c.id = i.category_id
       LEFT JOIN public.brands     b ON b.id = i.brand_id
      WHERE i.id = $1`, id)
  if (!item) throw new AppError(404, 'Không tìm thấy mặt hàng')

  const stocks = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
            s.quantity::float8 AS quantity, s.avg_cost::float8 AS avg_cost, s.updated_at
       FROM public.wh_stocks s
       JOIN public.wh_warehouses w ON w.id = s.warehouse_id
      WHERE s.item_id = $1 ORDER BY w.name`, id)

  const movements = await prisma.$queryRawUnsafe<any[]>(
    `SELECT m.id, m.movement_type, m.ref_code, m.quantity::float8 AS quantity,
            m.unit_price::float8 AS unit_price, m.balance_after::float8 AS balance_after,
            m.created_at, w.name AS warehouse_name, u.full_name AS created_by_name
       FROM public.wh_movements m
       JOIN public.wh_warehouses w ON w.id = m.warehouse_id
       LEFT JOIN public.users u ON u.id = m.created_by
      WHERE m.item_id = $1 ORDER BY m.created_at DESC LIMIT 50`, id)

  res.json(successResponse({ ...item, stocks, movements }))
})

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const { sku, name, product_id, category_id, brand_id, unit, spec, barcode,
          min_qty, max_qty, unit_cost, image_url, note } = req.body
  if (!str(name)) throw new AppError(400, 'Thiếu tên mặt hàng')

  let finalSku = str(sku)
  if (!finalSku) {
    const [row] = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM public.wh_items`)
    finalSku = 'SKU' + String(num(row?.n) + 1).padStart(5, '0')
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO public.wh_items
       (sku, name, product_id, category_id, brand_id, unit, spec, barcode,
        min_qty, max_qty, unit_cost, image_url, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    finalSku, str(name), int(product_id), int(category_id), int(brand_id),
    str(unit) ?? 'Cái', str(spec), str(barcode),
    num(min_qty), num(max_qty), num(unit_cost), str(image_url), str(note), userId(req)
  )
  res.status(201).json(successResponse(rows[0]))
})

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const { sku, name, product_id, category_id, brand_id, unit, spec, barcode,
          min_qty, max_qty, unit_cost, image_url, note, is_active } = req.body
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_items SET
       sku = COALESCE($2, sku), name = COALESCE($3, name),
       product_id = $4, category_id = $5, brand_id = $6,
       unit = COALESCE($7, unit), spec = $8, barcode = $9,
       min_qty = COALESCE($10, min_qty), max_qty = COALESCE($11, max_qty),
       unit_cost = COALESCE($12, unit_cost), image_url = $13, note = $14,
       is_active = COALESCE($15, is_active)
     WHERE id = $1 RETURNING *`,
    id, str(sku), str(name), int(product_id), int(category_id), int(brand_id),
    str(unit), str(spec), str(barcode),
    min_qty === undefined ? null : num(min_qty),
    max_qty === undefined ? null : num(max_qty),
    unit_cost === undefined ? null : num(unit_cost),
    str(image_url), str(note),
    is_active === undefined ? null : Boolean(is_active)
  )
  if (!rows.length) throw new AppError(404, 'Không tìm thấy mặt hàng')
  res.json(successResponse(rows[0]))
})

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [used] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM public.wh_movements WHERE item_id = $1`, id)
  if (num(used?.n) > 0) {
    await prisma.$executeRawUnsafe(`UPDATE public.wh_items SET is_active = FALSE WHERE id = $1`, id)
    res.json(successResponse(null, 'Mặt hàng đã phát sinh nhập xuất — đã chuyển sang trạng thái ngừng sử dụng'))
    return
  }
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_stocks WHERE item_id = $1`, id)
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_items  WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá mặt hàng'))
})

/** Tạo nhanh SKU kho từ catalog sản phẩm sẵn có (products) */
export const importFromProducts = asyncHandler(async (req: Request, res: Response) => {
  const ids: number[] = Array.isArray(req.body?.product_ids)
    ? req.body.product_ids.map((x: any) => int(x)).filter(Boolean) as number[]
    : []
  if (!ids.length) throw new AppError(400, 'Chưa chọn sản phẩm nào')

  const created = await prisma.$queryRaw<any[]>`
    INSERT INTO public.wh_items (sku, name, product_id, category_id, brand_id, unit, unit_cost, created_by)
    SELECT COALESCE(NULLIF(p.part_number, ''), 'SP' || LPAD(p.id::text, 5, '0')),
           p.name, p.id, p.category_id, p.brand_id, p.unit, p.price, ${userId(req)}
      FROM public.products p
     WHERE p.id = ANY(${ids}::int[])
       AND NOT EXISTS (SELECT 1 FROM public.wh_items wi WHERE wi.product_id = p.id)
    ON CONFLICT (sku) DO NOTHING
    RETURNING id, sku, name
  `
  res.json(successResponse(created, `Đã tạo ${created.length} mặt hàng từ danh mục sản phẩm`))
})

/** Danh sách sản phẩm chưa được đưa vào kho — dùng cho màn hình import */
export const getImportableProducts = asyncHandler(async (req: Request, res: Response) => {
  const search = str(req.query.search)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.name, p.part_number, p.unit, p.price::float8 AS price,
           b.name AS brand_name, c.name AS category_name
      FROM public.products p
      LEFT JOIN public.brands     b ON b.id = p.brand_id
      LEFT JOIN public.categories c ON c.id = p.category_id
     WHERE NOT EXISTS (SELECT 1 FROM public.wh_items wi WHERE wi.product_id = p.id)
       AND ${search
        ? Prisma.sql`(p.name ILIKE ${'%' + search + '%'} OR p.part_number ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
     ORDER BY p.name
     LIMIT 300
  `
  res.json(successResponse(rows))
})

// ============================================================
// TỒN KHO (theo từng kho)
// ============================================================
export const getStocks = asyncHandler(async (req: Request, res: Response) => {
  const warehouseId = int(req.query.warehouse_id)
  const search      = str(req.query.search)
  const status      = str(req.query.status)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT v.*, v.quantity::float8 AS quantity, v.avg_cost::float8 AS avg_cost,
           v.stock_value::float8 AS stock_value, v.min_qty::float8 AS min_qty
      FROM public.wh_stock_overview v
     WHERE ${warehouseId ? Prisma.sql`v.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${search
        ? Prisma.sql`(v.sku ILIKE ${'%' + search + '%'} OR v.item_name ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
       AND ${status ? Prisma.sql`v.stock_status = ${status}` : Prisma.sql`TRUE`}
     ORDER BY v.item_name
     LIMIT 1000
  `
  res.json(successResponse(rows))
})

// ============================================================
// SỔ NHẬT KÝ NHẬP XUẤT
// ============================================================
export const getMovements = asyncHandler(async (req: Request, res: Response) => {
  const warehouseId = int(req.query.warehouse_id)
  const itemId      = int(req.query.item_id)
  const type        = str(req.query.movement_type)
  const from        = str(req.query.from_date)
  const to          = str(req.query.to_date)
  const limit       = Math.min(num(req.query.limit, 200), 1000)

  const rows = await prisma.$queryRaw<any[]>`
    SELECT m.id, m.movement_type, m.ref_table, m.ref_id, m.ref_code,
           m.quantity::float8 AS quantity, m.unit_price::float8 AS unit_price,
           m.balance_after::float8 AS balance_after, m.note, m.created_at,
           i.sku, i.name AS item_name, i.unit,
           w.name AS warehouse_name, u.full_name AS created_by_name
      FROM public.wh_movements m
      JOIN public.wh_items i      ON i.id = m.item_id
      JOIN public.wh_warehouses w ON w.id = m.warehouse_id
      LEFT JOIN public.users u    ON u.id = m.created_by
     WHERE ${warehouseId ? Prisma.sql`m.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${itemId ? Prisma.sql`m.item_id = ${itemId}` : Prisma.sql`TRUE`}
       AND ${type ? Prisma.sql`m.movement_type = ${type}` : Prisma.sql`TRUE`}
       AND ${from ? Prisma.sql`m.created_at >= ${from}::date` : Prisma.sql`TRUE`}
       AND ${to ? Prisma.sql`m.created_at < (${to}::date + 1)` : Prisma.sql`TRUE`}
     ORDER BY m.created_at DESC
     LIMIT ${limit}
  `
  res.json(successResponse(rows))
})

// ============================================================
// PHIẾU NHẬP
// ============================================================
export const getReceipts = asyncHandler(async (req: Request, res: Response) => {
  const status      = str(req.query.status)
  const warehouseId = int(req.query.warehouse_id)
  const search      = str(req.query.search)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT r.id, r.code, r.receipt_date, r.reference_no, r.note, r.status,
           r.total_amount::float8 AS total_amount, r.created_at, r.posted_at,
           r.warehouse_id, w.name AS warehouse_name,
           r.supplier_id, s.name AS supplier_name,
           u.full_name AS created_by_name,
           (SELECT COUNT(*)::int FROM public.wh_receipt_items ri WHERE ri.receipt_id = r.id) AS line_count,
           (SELECT COALESCE(SUM(ri.quantity), 0)::float8 FROM public.wh_receipt_items ri WHERE ri.receipt_id = r.id) AS total_qty
      FROM public.wh_receipts r
      JOIN public.wh_warehouses w ON w.id = r.warehouse_id
      LEFT JOIN public.wh_suppliers s ON s.id = r.supplier_id
      LEFT JOIN public.users u ON u.id = r.created_by
     WHERE ${status ? Prisma.sql`r.status = ${status}` : Prisma.sql`TRUE`}
       AND ${warehouseId ? Prisma.sql`r.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${search
        ? Prisma.sql`(r.code ILIKE ${'%' + search + '%'} OR r.reference_no ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
     ORDER BY r.receipt_date DESC, r.id DESC
     LIMIT 300
  `
  res.json(successResponse(rows))
})

export const getReceiptDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT r.*, r.total_amount::float8 AS total_amount,
            w.name AS warehouse_name, s.name AS supplier_name,
            u.full_name AS created_by_name, p.full_name AS posted_by_name
       FROM public.wh_receipts r
       JOIN public.wh_warehouses w ON w.id = r.warehouse_id
       LEFT JOIN public.wh_suppliers s ON s.id = r.supplier_id
       LEFT JOIN public.users u ON u.id = r.created_by
       LEFT JOIN public.users p ON p.id = r.posted_by
      WHERE r.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu nhập')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ri.id, ri.item_id, ri.quantity::float8 AS quantity,
            ri.unit_price::float8 AS unit_price, ri.amount::float8 AS amount, ri.note,
            i.sku, i.name AS item_name, i.unit
       FROM public.wh_receipt_items ri
       JOIN public.wh_items i ON i.id = ri.item_id
      WHERE ri.receipt_id = $1 ORDER BY ri.id`, id)

  res.json(successResponse({ ...doc, items }))
})

export const saveReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { warehouse_id, supplier_id, receipt_date, reference_no, note, items, post } = req.body
  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho nhập')
  const lines = parseLines(items)
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_receipts WHERE id = $1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy phiếu nhập')
      if (cur.status !== 'draft') throw new AppError(400, 'Phiếu đã ghi sổ — không thể sửa. Hãy huỷ phiếu rồi tạo phiếu mới.')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_receipts SET warehouse_id=$2, supplier_id=$3, receipt_date=$4,
           reference_no=$5, note=$6, total_amount=$7 WHERE id=$1`,
        docId, whId, int(supplier_id), str(receipt_date) ?? new Date().toISOString().slice(0, 10),
        str(reference_no), str(note), total)
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_receipt_items WHERE receipt_id = $1`, docId)
    } else {
      code = await nextCode(tx, 'wh_receipts', 'PN')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_receipts
           (code, warehouse_id, supplier_id, receipt_date, reference_no, note, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        code, whId, int(supplier_id), str(receipt_date) ?? new Date().toISOString().slice(0, 10),
        str(reference_no), str(note), total, uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_receipt_items (receipt_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        docId, l.item_id, l.quantity, l.unit_price, l.quantity * l.unit_price, l.note)
    }

    if (post) await postReceiptTx(tx, docId!, uid)
    return { id: docId, code }
  }, { timeout: 20000 })

  res.status(id ? 200 : 201).json(successResponse(result, post ? 'Đã lưu và ghi sổ phiếu nhập' : 'Đã lưu phiếu nhập'))
})

async function postReceiptTx(tx: Tx, id: number, uid: number | null) {
  const [doc] = await tx.$queryRawUnsafe<any[]>(
    `SELECT id, code, warehouse_id, status FROM public.wh_receipts WHERE id = $1 FOR UPDATE`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu nhập')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã được ghi sổ trước đó')
  if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ')

  const items = await tx.$queryRawUnsafe<any[]>(
    `SELECT item_id, quantity::float8 AS quantity, unit_price::float8 AS unit_price
       FROM public.wh_receipt_items WHERE receipt_id = $1`, id)
  if (!items.length) throw new AppError(400, 'Phiếu chưa có dòng hàng nào')

  for (const l of items) {
    await applyMovement(tx, {
      warehouse_id: doc.warehouse_id, item_id: l.item_id,
      delta: num(l.quantity), unit_price: num(l.unit_price),
      movement_type: 'receipt', ref_table: 'wh_receipts', ref_id: id, ref_code: doc.code, user_id: uid,
    })
  }
  await tx.$executeRawUnsafe(
    `UPDATE public.wh_receipts SET status='posted', posted_by=$2, posted_at=NOW() WHERE id=$1`, id, uid)
}

export const postReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  await prisma.$transaction(tx => postReceiptTx(tx, id, userId(req)), { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã ghi sổ phiếu nhập — tồn kho đã được cập nhật'))
})

export const cancelReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  const uid = userId(req)
  await prisma.$transaction(async tx => {
    const [doc] = await tx.$queryRawUnsafe<any[]>(
      `SELECT id, code, warehouse_id, status FROM public.wh_receipts WHERE id = $1 FOR UPDATE`, id)
    if (!doc) throw new AppError(404, 'Không tìm thấy phiếu nhập')
    if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ trước đó')

    if (doc.status === 'posted') {
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT item_id, quantity::float8 AS quantity, unit_price::float8 AS unit_price
           FROM public.wh_receipt_items WHERE receipt_id = $1`, id)
      for (const l of items) {
        await applyMovement(tx, {
          warehouse_id: doc.warehouse_id, item_id: l.item_id,
          delta: -num(l.quantity), unit_price: num(l.unit_price),
          movement_type: 'issue', ref_table: 'wh_receipts', ref_id: id, ref_code: doc.code,
          user_id: uid, note: 'Huỷ phiếu nhập ' + doc.code,
        })
      }
    }
    await tx.$executeRawUnsafe(`UPDATE public.wh_receipts SET status='cancelled' WHERE id=$1`, id)
  }, { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã huỷ phiếu nhập'))
})

export const deleteReceipt = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT status FROM public.wh_receipts WHERE id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu nhập')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã ghi sổ — hãy huỷ phiếu thay vì xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_receipts WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá phiếu nhập'))
})

// ============================================================
// PHIẾU XUẤT
// ============================================================
export const getIssues = asyncHandler(async (req: Request, res: Response) => {
  const status      = str(req.query.status)
  const warehouseId = int(req.query.warehouse_id)
  const search      = str(req.query.search)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT s.id, s.code, s.issue_date, s.issue_type, s.customer_name, s.receiver,
           s.note, s.status, s.total_amount::float8 AS total_amount, s.created_at, s.posted_at,
           s.warehouse_id, w.name AS warehouse_name, s.pom_id,
           u.full_name AS created_by_name,
           (SELECT COUNT(*)::int FROM public.wh_issue_items ii WHERE ii.issue_id = s.id) AS line_count,
           (SELECT COALESCE(SUM(ii.quantity), 0)::float8 FROM public.wh_issue_items ii WHERE ii.issue_id = s.id) AS total_qty
      FROM public.wh_issues s
      JOIN public.wh_warehouses w ON w.id = s.warehouse_id
      LEFT JOIN public.users u ON u.id = s.created_by
     WHERE ${status ? Prisma.sql`s.status = ${status}` : Prisma.sql`TRUE`}
       AND ${warehouseId ? Prisma.sql`s.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${search
        ? Prisma.sql`(s.code ILIKE ${'%' + search + '%'} OR s.customer_name ILIKE ${'%' + search + '%'} OR s.receiver ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
     ORDER BY s.issue_date DESC, s.id DESC
     LIMIT 300
  `
  res.json(successResponse(rows))
})

export const getIssueDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.*, s.total_amount::float8 AS total_amount,
            w.name AS warehouse_name, u.full_name AS created_by_name, p.full_name AS posted_by_name
       FROM public.wh_issues s
       JOIN public.wh_warehouses w ON w.id = s.warehouse_id
       LEFT JOIN public.users u ON u.id = s.created_by
       LEFT JOIN public.users p ON p.id = s.posted_by
      WHERE s.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu xuất')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ii.id, ii.item_id, ii.quantity::float8 AS quantity,
            ii.unit_price::float8 AS unit_price, ii.amount::float8 AS amount, ii.note,
            i.sku, i.name AS item_name, i.unit,
            COALESCE(st.quantity, 0)::float8 AS available
       FROM public.wh_issue_items ii
       JOIN public.wh_items i ON i.id = ii.item_id
       LEFT JOIN public.wh_stocks st ON st.item_id = ii.item_id AND st.warehouse_id = $2
      WHERE ii.issue_id = $1 ORDER BY ii.id`, id, doc.warehouse_id)

  res.json(successResponse({ ...doc, items }))
})

export const saveIssue = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { warehouse_id, issue_type, pom_id, customer_name, receiver, issue_date, note, items, post } = req.body
  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho xuất')
  const lines = parseLines(items)
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_issues WHERE id = $1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy phiếu xuất')
      if (cur.status !== 'draft') throw new AppError(400, 'Phiếu đã ghi sổ — không thể sửa. Hãy huỷ phiếu rồi tạo phiếu mới.')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_issues SET warehouse_id=$2, issue_type=$3, pom_id=$4, customer_name=$5,
           receiver=$6, issue_date=$7, note=$8, total_amount=$9 WHERE id=$1`,
        docId, whId, str(issue_type) ?? 'sale', int(pom_id), str(customer_name), str(receiver),
        str(issue_date) ?? new Date().toISOString().slice(0, 10), str(note), total)
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_issue_items WHERE issue_id = $1`, docId)
    } else {
      code = await nextCode(tx, 'wh_issues', 'PX')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_issues
           (code, warehouse_id, issue_type, pom_id, customer_name, receiver, issue_date, note, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        code, whId, str(issue_type) ?? 'sale', int(pom_id), str(customer_name), str(receiver),
        str(issue_date) ?? new Date().toISOString().slice(0, 10), str(note), total, uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_issue_items (issue_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        docId, l.item_id, l.quantity, l.unit_price, l.quantity * l.unit_price, l.note)
    }

    if (post) await postIssueTx(tx, docId!, uid)
    return { id: docId, code }
  }, { timeout: 20000 })

  res.status(id ? 200 : 201).json(successResponse(result, post ? 'Đã lưu và ghi sổ phiếu xuất' : 'Đã lưu phiếu xuất'))
})

async function postIssueTx(tx: Tx, id: number, uid: number | null) {
  const [doc] = await tx.$queryRawUnsafe<any[]>(
    `SELECT id, code, warehouse_id, status FROM public.wh_issues WHERE id = $1 FOR UPDATE`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu xuất')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã được ghi sổ trước đó')
  if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ')

  const items = await tx.$queryRawUnsafe<any[]>(
    `SELECT item_id, quantity::float8 AS quantity, unit_price::float8 AS unit_price
       FROM public.wh_issue_items WHERE issue_id = $1`, id)
  if (!items.length) throw new AppError(400, 'Phiếu chưa có dòng hàng nào')

  for (const l of items) {
    await applyMovement(tx, {
      warehouse_id: doc.warehouse_id, item_id: l.item_id,
      delta: -num(l.quantity), unit_price: num(l.unit_price),
      movement_type: 'issue', ref_table: 'wh_issues', ref_id: id, ref_code: doc.code, user_id: uid,
    })
  }
  await tx.$executeRawUnsafe(
    `UPDATE public.wh_issues SET status='posted', posted_by=$2, posted_at=NOW() WHERE id=$1`, id, uid)
}

export const postIssue = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  await prisma.$transaction(tx => postIssueTx(tx, id, userId(req)), { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã ghi sổ phiếu xuất — tồn kho đã được trừ'))
})

export const cancelIssue = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  const uid = userId(req)
  await prisma.$transaction(async tx => {
    const [doc] = await tx.$queryRawUnsafe<any[]>(
      `SELECT id, code, warehouse_id, status FROM public.wh_issues WHERE id = $1 FOR UPDATE`, id)
    if (!doc) throw new AppError(404, 'Không tìm thấy phiếu xuất')
    if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ trước đó')

    if (doc.status === 'posted') {
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT item_id, quantity::float8 AS quantity, unit_price::float8 AS unit_price
           FROM public.wh_issue_items WHERE issue_id = $1`, id)
      for (const l of items) {
        await applyMovement(tx, {
          warehouse_id: doc.warehouse_id, item_id: l.item_id,
          delta: num(l.quantity), unit_price: num(l.unit_price),
          movement_type: 'receipt', ref_table: 'wh_issues', ref_id: id, ref_code: doc.code,
          user_id: uid, note: 'Huỷ phiếu xuất ' + doc.code,
        })
      }
    }
    await tx.$executeRawUnsafe(`UPDATE public.wh_issues SET status='cancelled' WHERE id=$1`, id)
  }, { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã huỷ phiếu xuất — hàng đã được hoàn về kho'))
})

export const deleteIssue = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(`SELECT status FROM public.wh_issues WHERE id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu xuất')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã ghi sổ — hãy huỷ phiếu thay vì xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_issues WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá phiếu xuất'))
})

// ============================================================
// ĐIỀU CHUYỂN KHO
// ============================================================
export const getTransfers = asyncHandler(async (req: Request, res: Response) => {
  const status = str(req.query.status)
  const search = str(req.query.search)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT t.id, t.code, t.transfer_date, t.note, t.status, t.created_at, t.posted_at,
           t.from_warehouse_id, fw.name AS from_warehouse_name,
           t.to_warehouse_id,   tw.name AS to_warehouse_name,
           u.full_name AS created_by_name,
           (SELECT COUNT(*)::int FROM public.wh_transfer_items ti WHERE ti.transfer_id = t.id) AS line_count,
           (SELECT COALESCE(SUM(ti.quantity), 0)::float8 FROM public.wh_transfer_items ti WHERE ti.transfer_id = t.id) AS total_qty
      FROM public.wh_transfers t
      JOIN public.wh_warehouses fw ON fw.id = t.from_warehouse_id
      JOIN public.wh_warehouses tw ON tw.id = t.to_warehouse_id
      LEFT JOIN public.users u ON u.id = t.created_by
     WHERE ${status ? Prisma.sql`t.status = ${status}` : Prisma.sql`TRUE`}
       AND ${search ? Prisma.sql`t.code ILIKE ${'%' + search + '%'}` : Prisma.sql`TRUE`}
     ORDER BY t.transfer_date DESC, t.id DESC
     LIMIT 300
  `
  res.json(successResponse(rows))
})

export const getTransferDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT t.*, fw.name AS from_warehouse_name, tw.name AS to_warehouse_name,
            u.full_name AS created_by_name, p.full_name AS posted_by_name
       FROM public.wh_transfers t
       JOIN public.wh_warehouses fw ON fw.id = t.from_warehouse_id
       JOIN public.wh_warehouses tw ON tw.id = t.to_warehouse_id
       LEFT JOIN public.users u ON u.id = t.created_by
       LEFT JOIN public.users p ON p.id = t.posted_by
      WHERE t.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu điều chuyển')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ti.id, ti.item_id, ti.quantity::float8 AS quantity, ti.note,
            i.sku, i.name AS item_name, i.unit,
            COALESCE(st.quantity, 0)::float8 AS available
       FROM public.wh_transfer_items ti
       JOIN public.wh_items i ON i.id = ti.item_id
       LEFT JOIN public.wh_stocks st ON st.item_id = ti.item_id AND st.warehouse_id = $2
      WHERE ti.transfer_id = $1 ORDER BY ti.id`, id, doc.from_warehouse_id)

  res.json(successResponse({ ...doc, items }))
})

export const saveTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { from_warehouse_id, to_warehouse_id, transfer_date, note, items, post } = req.body
  const fromId = int(from_warehouse_id)
  const toId   = int(to_warehouse_id)
  if (!fromId || !toId) throw new AppError(400, 'Chưa chọn kho nguồn / kho đích')
  if (fromId === toId)  throw new AppError(400, 'Kho nguồn và kho đích phải khác nhau')
  const lines = parseLines(items, { price: false })
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_transfers WHERE id = $1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy phiếu điều chuyển')
      if (cur.status !== 'draft') throw new AppError(400, 'Phiếu đã ghi sổ — không thể sửa')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_transfers SET from_warehouse_id=$2, to_warehouse_id=$3,
           transfer_date=$4, note=$5 WHERE id=$1`,
        docId, fromId, toId, str(transfer_date) ?? new Date().toISOString().slice(0, 10), str(note))
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_transfer_items WHERE transfer_id = $1`, docId)
    } else {
      code = await nextCode(tx, 'wh_transfers', 'DC')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_transfers (code, from_warehouse_id, to_warehouse_id, transfer_date, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        code, fromId, toId, str(transfer_date) ?? new Date().toISOString().slice(0, 10), str(note), uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_transfer_items (transfer_id, item_id, quantity, note)
         VALUES ($1,$2,$3,$4)`, docId, l.item_id, l.quantity, l.note)
    }

    if (post) await postTransferTx(tx, docId!, uid)
    return { id: docId, code }
  }, { timeout: 20000 })

  res.status(id ? 200 : 201).json(successResponse(result, post ? 'Đã lưu và ghi sổ phiếu điều chuyển' : 'Đã lưu phiếu điều chuyển'))
})

async function postTransferTx(tx: Tx, id: number, uid: number | null) {
  const [doc] = await tx.$queryRawUnsafe<any[]>(
    `SELECT id, code, from_warehouse_id, to_warehouse_id, status
       FROM public.wh_transfers WHERE id = $1 FOR UPDATE`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu điều chuyển')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã được ghi sổ trước đó')
  if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ')

  const items = await tx.$queryRawUnsafe<any[]>(
    `SELECT ti.item_id, ti.quantity::float8 AS quantity,
            COALESCE(st.avg_cost, 0)::float8 AS avg_cost
       FROM public.wh_transfer_items ti
       LEFT JOIN public.wh_stocks st ON st.item_id = ti.item_id AND st.warehouse_id = $2
      WHERE ti.transfer_id = $1`, id, doc.from_warehouse_id)
  if (!items.length) throw new AppError(400, 'Phiếu chưa có dòng hàng nào')

  for (const l of items) {
    await applyMovement(tx, {
      warehouse_id: doc.from_warehouse_id, item_id: l.item_id,
      delta: -num(l.quantity), unit_price: num(l.avg_cost),
      movement_type: 'transfer_out', ref_table: 'wh_transfers', ref_id: id, ref_code: doc.code, user_id: uid,
    })
    await applyMovement(tx, {
      warehouse_id: doc.to_warehouse_id, item_id: l.item_id,
      delta: num(l.quantity), unit_price: num(l.avg_cost),
      movement_type: 'transfer_in', ref_table: 'wh_transfers', ref_id: id, ref_code: doc.code, user_id: uid,
    })
  }
  await tx.$executeRawUnsafe(
    `UPDATE public.wh_transfers SET status='posted', posted_by=$2, posted_at=NOW() WHERE id=$1`, id, uid)
}

export const postTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  await prisma.$transaction(tx => postTransferTx(tx, id, userId(req)), { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã ghi sổ phiếu điều chuyển'))
})

export const cancelTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  const uid = userId(req)
  await prisma.$transaction(async tx => {
    const [doc] = await tx.$queryRawUnsafe<any[]>(
      `SELECT id, code, from_warehouse_id, to_warehouse_id, status
         FROM public.wh_transfers WHERE id = $1 FOR UPDATE`, id)
    if (!doc) throw new AppError(404, 'Không tìm thấy phiếu điều chuyển')
    if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ trước đó')

    if (doc.status === 'posted') {
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT ti.item_id, ti.quantity::float8 AS quantity,
                COALESCE(st.avg_cost, 0)::float8 AS avg_cost
           FROM public.wh_transfer_items ti
           LEFT JOIN public.wh_stocks st ON st.item_id = ti.item_id AND st.warehouse_id = $2
          WHERE ti.transfer_id = $1`, id, doc.to_warehouse_id)
      for (const l of items) {
        await applyMovement(tx, {
          warehouse_id: doc.to_warehouse_id, item_id: l.item_id,
          delta: -num(l.quantity), unit_price: num(l.avg_cost),
          movement_type: 'transfer_out', ref_table: 'wh_transfers', ref_id: id, ref_code: doc.code,
          user_id: uid, note: 'Huỷ điều chuyển ' + doc.code,
        })
        await applyMovement(tx, {
          warehouse_id: doc.from_warehouse_id, item_id: l.item_id,
          delta: num(l.quantity), unit_price: num(l.avg_cost),
          movement_type: 'transfer_in', ref_table: 'wh_transfers', ref_id: id, ref_code: doc.code,
          user_id: uid, note: 'Huỷ điều chuyển ' + doc.code,
        })
      }
    }
    await tx.$executeRawUnsafe(`UPDATE public.wh_transfers SET status='cancelled' WHERE id=$1`, id)
  }, { timeout: 20000 })
  res.json(successResponse({ id }, 'Đã huỷ phiếu điều chuyển'))
})

export const deleteTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(`SELECT status FROM public.wh_transfers WHERE id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu điều chuyển')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu đã ghi sổ — hãy huỷ phiếu thay vì xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_transfers WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá phiếu điều chuyển'))
})

// ============================================================
// KIỂM KÊ
// ============================================================
export const getCounts = asyncHandler(async (req: Request, res: Response) => {
  const status      = str(req.query.status)
  const warehouseId = int(req.query.warehouse_id)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT c.id, c.code, c.count_date, c.note, c.status, c.created_at, c.posted_at,
           c.warehouse_id, w.name AS warehouse_name, u.full_name AS created_by_name,
           (SELECT COUNT(*)::int FROM public.wh_count_items ci WHERE ci.count_id = c.id) AS line_count,
           (SELECT COUNT(*)::int FROM public.wh_count_items ci WHERE ci.count_id = c.id AND ci.diff <> 0) AS diff_count
      FROM public.wh_counts c
      JOIN public.wh_warehouses w ON w.id = c.warehouse_id
      LEFT JOIN public.users u ON u.id = c.created_by
     WHERE ${status ? Prisma.sql`c.status = ${status}` : Prisma.sql`TRUE`}
       AND ${warehouseId ? Prisma.sql`c.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
     ORDER BY c.count_date DESC, c.id DESC
     LIMIT 300
  `
  res.json(successResponse(rows))
})

export const getCountDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.*, w.name AS warehouse_name, u.full_name AS created_by_name, p.full_name AS posted_by_name
       FROM public.wh_counts c
       JOIN public.wh_warehouses w ON w.id = c.warehouse_id
       LEFT JOIN public.users u ON u.id = c.created_by
       LEFT JOIN public.users p ON p.id = c.posted_by
      WHERE c.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu kiểm kê')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ci.id, ci.item_id, ci.system_qty::float8 AS system_qty,
            ci.counted_qty::float8 AS counted_qty, ci.diff::float8 AS diff, ci.note,
            i.sku, i.name AS item_name, i.unit
       FROM public.wh_count_items ci
       JOIN public.wh_items i ON i.id = ci.item_id
      WHERE ci.count_id = $1 ORDER BY i.name`, id)

  res.json(successResponse({ ...doc, items }))
})

/** Lấy snapshot tồn hiện tại của 1 kho để khởi tạo phiếu kiểm kê */
export const prepareCount = asyncHandler(async (req: Request, res: Response) => {
  const whId = int(req.query.warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho kiểm kê')
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT s.item_id, i.sku, i.name AS item_name, i.unit,
            s.quantity::float8 AS system_qty
       FROM public.wh_stocks s
       JOIN public.wh_items i ON i.id = s.item_id
      WHERE s.warehouse_id = $1 AND i.is_active
      ORDER BY i.name`, whId)
  res.json(successResponse(rows))
})

export const saveCount = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { warehouse_id, count_date, note, items, post } = req.body
  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho kiểm kê')
  if (!Array.isArray(items) || !items.length) throw new AppError(400, 'Phiếu kiểm kê phải có ít nhất 1 dòng')
  const uid = userId(req)

  const lines = items.map((l: any, idx: number) => {
    const item_id = int(l.item_id)
    if (!item_id) throw new AppError(400, `Dòng ${idx + 1}: thiếu mặt hàng`)
    const system_qty  = num(l.system_qty)
    const counted_qty = num(l.counted_qty)
    if (counted_qty < 0) throw new AppError(400, `Dòng ${idx + 1}: số đếm thực tế không được âm`)
    return { item_id, system_qty, counted_qty, diff: counted_qty - system_qty, note: str(l.note) }
  })

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_counts WHERE id = $1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy phiếu kiểm kê')
      if (cur.status !== 'draft') throw new AppError(400, 'Phiếu kiểm kê đã ghi sổ — không thể sửa')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_counts SET warehouse_id=$2, count_date=$3, note=$4 WHERE id=$1`,
        docId, whId, str(count_date) ?? new Date().toISOString().slice(0, 10), str(note))
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_count_items WHERE count_id = $1`, docId)
    } else {
      code = await nextCode(tx, 'wh_counts', 'KK')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_counts (code, warehouse_id, count_date, note, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        code, whId, str(count_date) ?? new Date().toISOString().slice(0, 10), str(note), uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_count_items (count_id, item_id, system_qty, counted_qty, diff, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        docId, l.item_id, l.system_qty, l.counted_qty, l.diff, l.note)
    }

    if (post) await postCountTx(tx, docId!, uid)
    return { id: docId, code }
  }, { timeout: 30000 })

  res.status(id ? 200 : 201).json(successResponse(result, post ? 'Đã ghi sổ phiếu kiểm kê' : 'Đã lưu phiếu kiểm kê'))
})

async function postCountTx(tx: Tx, id: number, uid: number | null) {
  const [doc] = await tx.$queryRawUnsafe<any[]>(
    `SELECT id, code, warehouse_id, status FROM public.wh_counts WHERE id = $1 FOR UPDATE`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu kiểm kê')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu kiểm kê đã được ghi sổ trước đó')
  if (doc.status === 'cancelled') throw new AppError(400, 'Phiếu đã bị huỷ')

  const items = await tx.$queryRawUnsafe<any[]>(
    `SELECT item_id, counted_qty::float8 AS counted_qty, diff::float8 AS diff
       FROM public.wh_count_items WHERE count_id = $1 AND diff <> 0`, id)

  for (const l of items) {
    await applyMovement(tx, {
      warehouse_id: doc.warehouse_id, item_id: l.item_id,
      delta: num(l.diff), unit_price: 0,
      movement_type: 'count_adjust', ref_table: 'wh_counts', ref_id: id, ref_code: doc.code,
      user_id: uid, note: 'Điều chỉnh theo kiểm kê ' + doc.code,
      absolute: num(l.counted_qty),
    })
  }
  await tx.$executeRawUnsafe(
    `UPDATE public.wh_counts SET status='posted', posted_by=$2, posted_at=NOW() WHERE id=$1`, id, uid)
}

export const postCount = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  await prisma.$transaction(tx => postCountTx(tx, id, userId(req)), { timeout: 30000 })
  res.json(successResponse({ id }, 'Đã ghi sổ kiểm kê — tồn kho đã điều chỉnh theo số đếm thực tế'))
})

export const deleteCount = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(`SELECT status FROM public.wh_counts WHERE id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu kiểm kê')
  if (doc.status === 'posted') throw new AppError(400, 'Phiếu kiểm kê đã ghi sổ — không thể xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_counts WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xoá phiếu kiểm kê'))
})
