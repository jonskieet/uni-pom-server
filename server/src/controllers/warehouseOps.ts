// ============================================================
// server/src/controllers/warehouseOps.ts — UNI IMS giai đoạn 2
// Nghiệp vụ dành riêng cho công ty giải pháp & thi công:
//   - Đối chiếu POM với tồn kho (biết cái gì đã có, cái gì phải mua)
//   - Giữ hàng cho dự án (reservation)
//   - Phiếu đề nghị vật tư + duyệt + sinh phiếu xuất/điều chuyển
//   - Serial / MAC / bảo hành thiết bị
//   - Đơn mua hàng (hàng đang về) + đề xuất mua hàng
//   - Quyết toán vật tư theo dự án
// Dùng chung helper của warehouse.ts để giữ một quy ước duy nhất.
// ============================================================

import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import {
  prisma, num, int, str, userId, nextCode, parseLines,
  postIssueTx, postTransferTx, syncPurchaseOrderTx,
} from './warehouse'

const todayStr = () => new Date().toISOString().slice(0, 10)

// ============================================================
// DỰ ÁN — danh sách POM để chọn
// ============================================================
export const getProjects = asyncHandler(async (req: Request, res: Response) => {
  const search = str(req.query.search)
  const limit  = Math.min(num(req.query.limit, 100), 500)

  const rows = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.pom_code, p.project_name, p.customer_name, p.status::text AS status,
           p.created_at,
           (SELECT COUNT(*)::int FROM public.pom_items pi WHERE pi.pom_id = p.id) AS item_count,
           (SELECT COUNT(*)::int FROM public.wh_reservations r
             WHERE r.pom_id = p.id AND r.status = 'active') AS reserved_lines,
           (SELECT COUNT(*)::int FROM public.wh_issues i
             WHERE i.pom_id = p.id AND i.status = 'posted') AS issue_count
      FROM public.poms p
     WHERE ${search
      ? Prisma.sql`(p.pom_code ILIKE ${'%' + search + '%'}
                    OR p.project_name ILIKE ${'%' + search + '%'}
                    OR p.customer_name ILIKE ${'%' + search + '%'})`
      : Prisma.sql`TRUE`}
     ORDER BY p.created_at DESC
     LIMIT ${limit}
  `
  res.json(successResponse(rows))
})

// ============================================================
// ĐỐI CHIẾU DỰ ÁN VỚI KHO
// Trả lời câu hỏi: trong danh sách thiết bị của POM này,
// cái nào kho đang có, cái nào phải mua, ở kho nào.
// ============================================================
export const getProjectMatch = asyncHandler(async (req: Request, res: Response) => {
  const pomId = int(req.params.id)
  if (!pomId) throw new AppError(400, 'Thiếu mã dự án')

  const [pom] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT p.id, p.pom_code, p.project_name, p.customer_name, p.status::text AS status
       FROM public.poms p WHERE p.id = $1`, pomId)
  if (!pom) throw new AppError(404, 'Không tìm thấy dự án')

  // Nhu cầu của POM gộp theo sản phẩm, ghép sang wh_items qua product_id
  const lines = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pr.id                         AS product_id,
            pr.name                       AS product_name,
            pr.part_number,
            SUM(pi.quantity)::float8      AS need_qty,
            av.item_id,
            av.sku,
            av.item_name,
            av.unit,
            COALESCE(av.on_hand,   0)::float8 AS on_hand,
            COALESCE(av.reserved,  0)::float8 AS reserved,
            COALESCE(av.available, 0)::float8 AS available,
            COALESCE(av.incoming,  0)::float8 AS incoming,
            COALESCE(av.avg_cost,  0)::float8 AS avg_cost,
            av.main_warehouse_id,
            av.main_warehouse_name,
            COALESCE(mine.qty, 0)::float8     AS reserved_for_this,
            COALESCE(iss.qty,  0)::float8     AS issued_qty
       FROM public.pom_items pi
       JOIN public.products pr ON pr.id = pi.product_id
       LEFT JOIN public.wh_item_availability av ON av.product_id = pr.id
       LEFT JOIN LATERAL (
         SELECT SUM(r.quantity) AS qty FROM public.wh_reservations r
          WHERE r.pom_id = $1 AND r.item_id = av.item_id AND r.status = 'active'
       ) mine ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(ii.quantity) AS qty
           FROM public.wh_issues s
           JOIN public.wh_issue_items ii ON ii.issue_id = s.id
          WHERE s.pom_id = $1 AND s.status = 'posted' AND ii.item_id = av.item_id
       ) iss ON TRUE
      WHERE pi.pom_id = $1
      GROUP BY pr.id, pr.name, pr.part_number, av.item_id, av.sku, av.item_name, av.unit,
               av.on_hand, av.reserved, av.available, av.incoming, av.avg_cost,
               av.main_warehouse_id, av.main_warehouse_name, mine.qty, iss.qty
      ORDER BY pr.name`, pomId)

  const result = lines.map(l => {
    const need      = num(l.need_qty)
    const issued    = num(l.issued_qty)
    const reservedM = num(l.reserved_for_this)
    const remaining = Math.max(need - issued - reservedM, 0)          // còn phải lo
    const canCover  = Math.min(remaining, num(l.available))            // kho đáp ứng được
    const shortage  = Math.max(remaining - num(l.available), 0)        // phải mua
    const covered   = shortage <= 0
    return {
      ...l,
      need_qty: need,
      remaining,
      can_cover: canCover,
      shortage,
      short_after_incoming: Math.max(shortage - num(l.incoming), 0),
      in_warehouse: !!l.item_id,
      status: !l.item_id ? 'unmapped' : covered ? 'ok' : canCover > 0 ? 'partial' : 'missing',
    }
  })

  const summary = {
    total_lines:    result.length,
    ok_lines:       result.filter(r => r.status === 'ok').length,
    partial_lines:  result.filter(r => r.status === 'partial').length,
    missing_lines:  result.filter(r => r.status === 'missing').length,
    unmapped_lines: result.filter(r => r.status === 'unmapped').length,
    covered_value:  result.reduce((s, r) => s + r.can_cover * num(r.avg_cost), 0),
    shortage_value: result.reduce((s, r) => s + r.shortage  * num(r.avg_cost), 0),
  }

  res.json(successResponse({ pom, lines: result, summary }))
})

// ============================================================
// QUYẾT TOÁN VẬT TƯ THEO DỰ ÁN
// ============================================================
export const getProjectUsage = asyncHandler(async (req: Request, res: Response) => {
  const pomId = int(req.params.id)
  if (!pomId) throw new AppError(400, 'Thiếu mã dự án')

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT item_id, sku, item_name, unit,
            issued_qty::float8   AS issued_qty,
            returned_qty::float8 AS returned_qty,
            used_qty::float8     AS used_qty,
            cost::float8         AS cost
       FROM public.wh_project_usage
      WHERE pom_id = $1
      ORDER BY item_name`, pomId)

  const docs = await prisma.$queryRawUnsafe<any[]>(
    `SELECT 'issue' AS kind, i.id, i.code, i.issue_date AS doc_date, i.status,
            i.total_amount::float8 AS total_amount, w.name AS warehouse_name
       FROM public.wh_issues i JOIN public.wh_warehouses w ON w.id = i.warehouse_id
      WHERE i.pom_id = $1
      UNION ALL
     SELECT 'return', r.id, r.code, r.receipt_date, r.status,
            r.total_amount::float8, w.name
       FROM public.wh_receipts r JOIN public.wh_warehouses w ON w.id = r.warehouse_id
      WHERE r.pom_id = $1 AND r.receipt_type IN ('site_return','crew_return')
      ORDER BY doc_date DESC`, pomId)

  res.json(successResponse({ rows, docs }))
})

// ============================================================
// GIỮ HÀNG CHO DỰ ÁN
// ============================================================
export const getReservations = asyncHandler(async (req: Request, res: Response) => {
  const pomId       = int(req.query.pom_id)
  const warehouseId = int(req.query.warehouse_id)
  const status      = str(req.query.status) ?? 'active'

  const rows = await prisma.$queryRaw<any[]>`
    SELECT r.id, r.pom_id, r.project_name, r.warehouse_id, r.item_id,
           r.quantity::float8 AS quantity, r.status, r.expire_date, r.note, r.created_at,
           i.sku, i.name AS item_name, i.unit,
           w.name AS warehouse_name,
           p.pom_code, p.project_name AS pom_project_name, p.customer_name,
           u.full_name AS created_by_name,
           s.quantity::float8 AS stock_qty
      FROM public.wh_reservations r
      JOIN public.wh_items i      ON i.id = r.item_id
      JOIN public.wh_warehouses w ON w.id = r.warehouse_id
      LEFT JOIN public.poms p     ON p.id = r.pom_id
      LEFT JOIN public.users u    ON u.id = r.created_by
      LEFT JOIN public.wh_stocks s ON s.warehouse_id = r.warehouse_id AND s.item_id = r.item_id
     WHERE ${pomId ? Prisma.sql`r.pom_id = ${pomId}` : Prisma.sql`TRUE`}
       AND ${warehouseId ? Prisma.sql`r.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${status === 'all' ? Prisma.sql`TRUE` : Prisma.sql`r.status = ${status}`}
     ORDER BY r.created_at DESC
     LIMIT 500
  `
  res.json(successResponse(rows))
})

/** Giữ hàng: nhận nhiều dòng { item_id, warehouse_id, quantity } */
export const createReservations = asyncHandler(async (req: Request, res: Response) => {
  const { pom_id, project_name, expire_date, note, items } = req.body
  const pomId = int(pom_id)
  if (!pomId && !str(project_name))
    throw new AppError(400, 'Phải chọn dự án hoặc nhập tên công việc cần giữ hàng')
  if (!Array.isArray(items) || !items.length)
    throw new AppError(400, 'Chưa chọn mặt hàng nào để giữ')
  const uid = userId(req)

  const created = await prisma.$transaction(async tx => {
    const out: any[] = []
    for (const [idx, raw] of items.entries()) {
      const itemId = int(raw.item_id)
      const whId   = int(raw.warehouse_id)
      const qty    = num(raw.quantity)
      if (!itemId || !whId) throw new AppError(400, `Dòng ${idx + 1}: thiếu mặt hàng hoặc kho`)
      if (!(qty > 0))       throw new AppError(400, `Dòng ${idx + 1}: số lượng giữ phải lớn hơn 0`)

      const [st] = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.quantity::float8 AS quantity, s.reserved_qty::float8 AS reserved,
                i.sku, i.name, i.unit
           FROM public.wh_items i
           LEFT JOIN public.wh_stocks s ON s.item_id = i.id AND s.warehouse_id = $2
          WHERE i.id = $1 FOR UPDATE OF s`, itemId, whId)

      const free = num(st?.quantity) - num(st?.reserved)
      if (qty > free) {
        throw new AppError(400,
          `"${st?.sku} — ${st?.name}": chỉ còn ${free < 0 ? 0 : free} ${st?.unit ?? ''} khả dụng, không giữ được ${qty}`)
      }

      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_reservations
           (pom_id, project_name, warehouse_id, item_id, quantity, expire_date, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8) RETURNING id`,
        pomId, str(project_name), whId, itemId, qty, str(expire_date), str(note), uid)
      out.push(row)
    }
    return out
  }, { timeout: 30000 })

  res.status(201).json(successResponse(created, `Đã giữ ${created.length} mặt hàng cho dự án`))
})

export const releaseReservation = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_reservations SET status='released', released_at=NOW()
      WHERE id = $1 AND status = 'active' RETURNING id`, id)
  if (!rows.length) throw new AppError(404, 'Không tìm thấy dòng giữ hàng đang hiệu lực')
  res.json(successResponse({ id }, 'Đã giải phóng hàng giữ — tồn khả dụng đã được trả lại'))
})

export const releaseProjectReservations = asyncHandler(async (req: Request, res: Response) => {
  const pomId = int(req.params.id)
  const n = await prisma.$executeRawUnsafe(
    `UPDATE public.wh_reservations SET status='released', released_at=NOW()
      WHERE pom_id = $1 AND status = 'active'`, pomId)
  res.json(successResponse({ released: n }, `Đã giải phóng ${n} dòng giữ hàng của dự án`))
})

// ============================================================
// ĐỀ XUẤT MUA HÀNG
// Cần mua = nhu cầu (định mức + dự án đang giữ thiếu) − khả dụng − đang về
// ============================================================
export const getPurchaseSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const pomId = int(req.query.pom_id)

  // 1. Thiếu so với định mức tồn tối thiểu
  const byMin = await prisma.$queryRaw<any[]>`
    SELECT av.item_id, av.sku, av.item_name, av.unit,
           av.on_hand::float8   AS on_hand,
           av.available::float8 AS available,
           av.incoming::float8  AS incoming,
           av.min_qty::float8   AS min_qty,
           av.avg_cost::float8  AS avg_cost,
           GREATEST(av.min_qty - av.available - av.incoming, 0)::float8 AS suggest_qty,
           'min_stock' AS reason
      FROM public.wh_item_availability av
     WHERE av.is_active
       AND av.min_qty > 0
       AND av.available + av.incoming < av.min_qty
     ORDER BY (av.min_qty - av.available - av.incoming) DESC
     LIMIT 300
  `

  // 2. Thiếu cho các dự án (POM cụ thể, hoặc mọi POM đang có nhu cầu)
  const byProject = await prisma.$queryRaw<any[]>`
    SELECT av.item_id, av.sku, av.item_name, av.unit,
           av.on_hand::float8   AS on_hand,
           av.available::float8 AS available,
           av.incoming::float8  AS incoming,
           av.avg_cost::float8  AS avg_cost,
           p.id   AS pom_id,
           p.pom_code,
           p.project_name,
           d.need::float8 AS need_qty,
           GREATEST(d.need - av.available - av.incoming, 0)::float8 AS suggest_qty,
           'project' AS reason
      FROM public.poms p
      JOIN LATERAL (
        SELECT pr.id AS product_id, SUM(pi.quantity) AS need
          FROM public.pom_items pi
          JOIN public.products pr ON pr.id = pi.product_id
         WHERE pi.pom_id = p.id
         GROUP BY pr.id
      ) d ON TRUE
      JOIN public.wh_item_availability av ON av.product_id = d.product_id
     WHERE ${pomId ? Prisma.sql`p.id = ${pomId}` : Prisma.sql`p.status NOT IN ('draft','closed_lost')`}
       AND d.need > av.available + av.incoming
     ORDER BY (d.need - av.available - av.incoming) DESC
     LIMIT 300
  `

  // 3. Thiết bị POM chưa có trong danh mục kho — không mua được vì chưa khai báo
  const unmapped = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT pr.id AS product_id, pr.name AS product_name, pr.part_number, pr.unit
      FROM public.pom_items pi
      JOIN public.products pr ON pr.id = pi.product_id
      JOIN public.poms p      ON p.id = pi.pom_id
     WHERE NOT EXISTS (SELECT 1 FROM public.wh_items wi WHERE wi.product_id = pr.id)
       AND ${pomId ? Prisma.sql`p.id = ${pomId}` : Prisma.sql`p.status NOT IN ('draft','closed_lost')`}
     LIMIT 200
  `

  res.json(successResponse({ by_min: byMin, by_project: byProject, unmapped }))
})

// ============================================================
// PHIẾU ĐỀ NGHỊ VẬT TƯ
// ============================================================
const REQUEST_SELECT = `
  SELECT q.id, q.code, q.status, q.purpose, q.need_date, q.note, q.project_name,
         q.warehouse_id, q.to_warehouse_id, q.pom_id, q.issue_id, q.transfer_id,
         q.reject_reason, q.approved_at, q.created_at,
         w.name  AS warehouse_name,
         tw.name AS to_warehouse_name,
         p.pom_code, p.project_name AS pom_project_name, p.customer_name,
         ru.full_name AS requester_name,
         au.full_name AS approved_by_name,
         cu.full_name AS created_by_name,
         (SELECT COUNT(*)::int FROM public.wh_request_items ri WHERE ri.request_id = q.id) AS line_count,
         (SELECT COALESCE(SUM(ri.quantity), 0)::float8 FROM public.wh_request_items ri WHERE ri.request_id = q.id) AS total_qty
    FROM public.wh_requests q
    JOIN public.wh_warehouses w   ON w.id = q.warehouse_id
    LEFT JOIN public.wh_warehouses tw ON tw.id = q.to_warehouse_id
    LEFT JOIN public.poms p       ON p.id = q.pom_id
    LEFT JOIN public.users ru     ON ru.id = q.requester_id
    LEFT JOIN public.users au     ON au.id = q.approved_by
    LEFT JOIN public.users cu     ON cu.id = q.created_by`

export const getRequests = asyncHandler(async (req: Request, res: Response) => {
  const status      = str(req.query.status)
  const warehouseId = int(req.query.warehouse_id)
  const search      = str(req.query.search)
  const mine        = str(req.query.mine)

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `${REQUEST_SELECT}
      WHERE ($1::text IS NULL OR q.status = $1)
        AND ($2::int  IS NULL OR q.warehouse_id = $2)
        AND ($3::text IS NULL OR q.code ILIKE '%' || $3 || '%'
             OR p.pom_code ILIKE '%' || $3 || '%'
             OR q.project_name ILIKE '%' || $3 || '%')
        AND ($4::int  IS NULL OR q.requester_id = $4)
      ORDER BY q.created_at DESC
      LIMIT 300`,
    status, warehouseId, search, mine ? userId(req) : null)
  res.json(successResponse(rows))
})

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(`${REQUEST_SELECT} WHERE q.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy phiếu đề nghị')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ri.id, ri.item_id, ri.quantity::float8 AS quantity,
            ri.approved_qty::float8 AS approved_qty, ri.note,
            i.sku, i.name AS item_name, i.unit, i.track_serial,
            COALESCE(s.quantity, 0)::float8 AS stock_qty,
            GREATEST(COALESCE(s.quantity, 0) - COALESCE(s.reserved_qty, 0), 0)::float8 AS available
       FROM public.wh_request_items ri
       JOIN public.wh_items i ON i.id = ri.item_id
       LEFT JOIN public.wh_stocks s ON s.item_id = ri.item_id AND s.warehouse_id = $2
      WHERE ri.request_id = $1 ORDER BY ri.id`, id, doc.warehouse_id)

  res.json(successResponse({ ...doc, items }))
})

export const saveRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { warehouse_id, to_warehouse_id, pom_id, project_name, need_date,
          purpose, note, items, submit } = req.body

  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho lấy hàng')
  const p = str(purpose) ?? 'project'
  if (!['project', 'internal', 'warranty', 'other'].includes(p))
    throw new AppError(400, 'Mục đích đề nghị không hợp lệ')

  const lines = parseLines(items, { price: false })
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_requests WHERE id = $1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy phiếu đề nghị')
      if (!['draft', 'rejected'].includes(cur.status))
        throw new AppError(400, 'Phiếu đã gửi duyệt — không thể sửa')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_requests SET warehouse_id=$2, to_warehouse_id=$3, pom_id=$4,
           project_name=$5, need_date=$6::date, purpose=$7, note=$8, status='draft', reject_reason=NULL
         WHERE id=$1`,
        docId, whId, int(to_warehouse_id), int(pom_id), str(project_name),
        str(need_date), p, str(note))
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_request_items WHERE request_id = $1`, docId)
    } else {
      code = await nextCode(tx, 'wh_requests', 'DN')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_requests
           (code, warehouse_id, to_warehouse_id, pom_id, project_name, need_date,
            purpose, note, requester_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$9) RETURNING id`,
        code, whId, int(to_warehouse_id), int(pom_id), str(project_name),
        str(need_date), p, str(note), uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_request_items (request_id, item_id, quantity, note)
         VALUES ($1,$2,$3,$4)`, docId, l.item_id, l.quantity, l.note)
    }

    if (submit) {
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_requests SET status='submitted' WHERE id=$1`, docId)
    }
    return { id: docId, code }
  }, { timeout: 20000 })

  res.status(id ? 200 : 201).json(successResponse(
    result, submit ? 'Đã gửi phiếu đề nghị đi duyệt' : 'Đã lưu phiếu đề nghị'))
})

export const submitRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_requests SET status='submitted', reject_reason=NULL
      WHERE id=$1 AND status IN ('draft','rejected') RETURNING id`, id)
  if (!rows.length) throw new AppError(400, 'Chỉ gửi duyệt được phiếu ở trạng thái nháp hoặc bị từ chối')
  res.json(successResponse({ id }, 'Đã gửi phiếu đề nghị đi duyệt'))
})

/** Duyệt phiếu — có thể duyệt số lượng khác số đề nghị */
export const approveRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const { lines, note } = req.body
  const uid = userId(req)

  await prisma.$transaction(async tx => {
    const [cur] = await tx.$queryRawUnsafe<any[]>(
      `SELECT status FROM public.wh_requests WHERE id=$1 FOR UPDATE`, id)
    if (!cur) throw new AppError(404, 'Không tìm thấy phiếu đề nghị')
    if (cur.status !== 'submitted') throw new AppError(400, 'Chỉ duyệt được phiếu đang chờ duyệt')

    if (Array.isArray(lines)) {
      for (const l of lines) {
        const lineId = int(l.id)
        if (!lineId) continue
        await tx.$executeRawUnsafe(
          `UPDATE public.wh_request_items SET approved_qty=$2 WHERE id=$1 AND request_id=$3`,
          lineId, num(l.approved_qty), id)
      }
    }
    // Dòng chưa nhập số duyệt thì mặc định duyệt đúng số đề nghị
    await tx.$executeRawUnsafe(
      `UPDATE public.wh_request_items SET approved_qty = quantity
        WHERE request_id = $1 AND approved_qty IS NULL`, id)

    await tx.$executeRawUnsafe(
      `UPDATE public.wh_requests SET status='approved', approved_by=$2, approved_at=NOW(),
         note = COALESCE($3, note) WHERE id=$1`, id, uid, str(note))
  }, { timeout: 20000 })

  res.json(successResponse({ id }, 'Đã duyệt phiếu đề nghị — thủ kho có thể soạn hàng'))
})

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const reason = str(req.body?.reason)
  if (!reason) throw new AppError(400, 'Phải nhập lý do từ chối')
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_requests SET status='rejected', reject_reason=$2, approved_by=$3, approved_at=NOW()
      WHERE id=$1 AND status='submitted' RETURNING id`, id, reason, userId(req))
  if (!rows.length) throw new AppError(400, 'Chỉ từ chối được phiếu đang chờ duyệt')
  res.json(successResponse({ id }, 'Đã từ chối phiếu đề nghị'))
})

/**
 * Xuất hàng theo phiếu đề nghị đã duyệt.
 *  - Có kho nhận (to_warehouse_id) → sinh phiếu ĐIỀU CHUYỂN sang kho đội
 *    (hàng vẫn thuộc tài sản công ty, chỉ đổi vị trí)
 *  - Không có kho nhận → sinh phiếu XUẤT thẳng cho công trình
 */
export const fulfilRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    const [doc] = await tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.wh_requests WHERE id=$1 FOR UPDATE`, id)
    if (!doc) throw new AppError(404, 'Không tìm thấy phiếu đề nghị')
    if (doc.status !== 'approved') throw new AppError(400, 'Phiếu chưa được duyệt')

    const lines = await tx.$queryRawUnsafe<any[]>(
      `SELECT ri.item_id,
              COALESCE(ri.approved_qty, ri.quantity)::float8 AS quantity,
              COALESCE(s.avg_cost, 0)::float8 AS avg_cost, ri.note
         FROM public.wh_request_items ri
         LEFT JOIN public.wh_stocks s ON s.item_id = ri.item_id AND s.warehouse_id = $2
        WHERE ri.request_id = $1`, id, doc.warehouse_id)
    const usable = lines.filter(l => num(l.quantity) > 0)
    if (!usable.length) throw new AppError(400, 'Phiếu không có dòng nào được duyệt số lượng > 0')

    if (doc.to_warehouse_id) {
      // Giao cho đội → điều chuyển nội bộ
      if (doc.to_warehouse_id === doc.warehouse_id)
        throw new AppError(400, 'Kho lấy hàng và kho nhận phải khác nhau')

      const code = await nextCode(tx, 'wh_transfers', 'DC')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_transfers
           (code, from_warehouse_id, to_warehouse_id, transfer_date, note, pom_id, request_id, created_by)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8) RETURNING id`,
        code, doc.warehouse_id, doc.to_warehouse_id, todayStr(),
        `Theo phiếu đề nghị ${doc.code}`, doc.pom_id, id, uid)

      for (const l of usable) {
        await tx.$executeRawUnsafe(
          `INSERT INTO public.wh_transfer_items (transfer_id, item_id, quantity, note)
           VALUES ($1,$2,$3,$4)`, row.id, l.item_id, num(l.quantity), l.note)
      }
      await postTransferTx(tx, row.id, uid)
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_requests SET status='issued', transfer_id=$2 WHERE id=$1`, id, row.id)
      return { kind: 'transfer', id: row.id, code }
    }

    // Xuất thẳng cho công trình
    const code = await nextCode(tx, 'wh_issues', 'PX')
    const total = usable.reduce((s, l) => s + num(l.quantity) * num(l.avg_cost), 0)
    const [row] = await tx.$queryRawUnsafe<any[]>(
      `INSERT INTO public.wh_issues
         (code, warehouse_id, issue_type, pom_id, customer_name, receiver, issue_date,
          note, total_amount, request_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11) RETURNING id`,
      code, doc.warehouse_id,
      doc.purpose === 'internal' ? 'internal' : doc.purpose === 'warranty' ? 'other' : 'project',
      doc.pom_id, doc.project_name, null, todayStr(),
      `Theo phiếu đề nghị ${doc.code}`, total, id, uid)

    for (const l of usable) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_issue_items (issue_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        row.id, l.item_id, num(l.quantity), num(l.avg_cost),
        num(l.quantity) * num(l.avg_cost), l.note)
    }
    await postIssueTx(tx, row.id, uid)
    await tx.$executeRawUnsafe(
      `UPDATE public.wh_requests SET status='issued', issue_id=$2 WHERE id=$1`, id, row.id)
    return { kind: 'issue', id: row.id, code }
  }, { timeout: 30000 })

  res.json(successResponse(result,
    result.kind === 'transfer'
      ? `Đã giao hàng cho đội — phiếu điều chuyển ${result.code}`
      : `Đã xuất kho — phiếu xuất ${result.code}`))
})

export const deleteRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [cur] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT status FROM public.wh_requests WHERE id=$1`, id)
  if (!cur) throw new AppError(404, 'Không tìm thấy phiếu đề nghị')
  if (['issued'].includes(cur.status))
    throw new AppError(400, 'Phiếu đã xuất hàng — không thể xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_requests WHERE id=$1`, id)
  res.json(successResponse(null, 'Đã xoá phiếu đề nghị'))
})

// ============================================================
// SERIAL / MAC / BẢO HÀNH
// ============================================================
export const getSerials = asyncHandler(async (req: Request, res: Response) => {
  const itemId      = int(req.query.item_id)
  const warehouseId = int(req.query.warehouse_id)
  const pomId       = int(req.query.pom_id)
  const status      = str(req.query.status)
  const search      = str(req.query.search)
  const expiring    = str(req.query.expiring)

  const rows = await prisma.$queryRaw<any[]>`
    SELECT sn.id, sn.item_id, sn.serial, sn.mac, sn.status, sn.warranty_end, sn.note,
           sn.warehouse_id, sn.pom_id, sn.created_at,
           i.sku, i.name AS item_name, i.unit,
           w.name AS warehouse_name,
           p.pom_code, p.project_name, p.customer_name,
           sup.name AS supplier_name,
           (sn.warranty_end IS NOT NULL AND sn.warranty_end < CURRENT_DATE) AS warranty_expired
      FROM public.wh_serials sn
      JOIN public.wh_items i        ON i.id = sn.item_id
      LEFT JOIN public.wh_warehouses w ON w.id = sn.warehouse_id
      LEFT JOIN public.poms p          ON p.id = sn.pom_id
      LEFT JOIN public.wh_suppliers sup ON sup.id = sn.supplier_id
     WHERE ${itemId ? Prisma.sql`sn.item_id = ${itemId}` : Prisma.sql`TRUE`}
       AND ${warehouseId ? Prisma.sql`sn.warehouse_id = ${warehouseId}` : Prisma.sql`TRUE`}
       AND ${pomId ? Prisma.sql`sn.pom_id = ${pomId}` : Prisma.sql`TRUE`}
       AND ${status ? Prisma.sql`sn.status = ${status}` : Prisma.sql`TRUE`}
       AND ${expiring
        ? Prisma.sql`sn.warranty_end IS NOT NULL AND sn.warranty_end <= CURRENT_DATE + 60`
        : Prisma.sql`TRUE`}
       AND ${search
        ? Prisma.sql`(sn.serial ILIKE ${'%' + search + '%'} OR sn.mac ILIKE ${'%' + search + '%'}
                      OR i.sku ILIKE ${'%' + search + '%'} OR i.name ILIKE ${'%' + search + '%'})`
        : Prisma.sql`TRUE`}
     ORDER BY sn.created_at DESC
     LIMIT 500
  `
  res.json(successResponse(rows))
})

/** Khai báo nhiều serial một lần — dán danh sách mỗi dòng một serial */
export const createSerials = asyncHandler(async (req: Request, res: Response) => {
  const { item_id, warehouse_id, supplier_id, receipt_id, warranty_end, note, serials } = req.body
  const itemId = int(item_id)
  if (!itemId) throw new AppError(400, 'Chưa chọn mặt hàng')

  const list: Array<{ serial: string; mac: string | null }> = (Array.isArray(serials) ? serials : [])
    .map((s: any) => typeof s === 'string'
      ? { serial: s.trim(), mac: null }
      : { serial: String(s?.serial ?? '').trim(), mac: str(s?.mac) })
    .filter(s => s.serial !== '')
  if (!list.length) throw new AppError(400, 'Chưa nhập serial nào')

  // Tính hạn bảo hành từ số tháng của mặt hàng nếu không nhập tay
  let warranty = str(warranty_end)
  if (!warranty) {
    const [it] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT warranty_months FROM public.wh_items WHERE id=$1`, itemId)
    const months = num(it?.warranty_months)
    if (months > 0) {
      const d = new Date()
      d.setMonth(d.getMonth() + months)
      warranty = d.toISOString().slice(0, 10)
    }
  }

  const created = await prisma.$transaction(async tx => {
    const out: any[] = []
    for (const s of list) {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_serials
           (item_id, serial, mac, warehouse_id, supplier_id, receipt_id, warranty_end, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8)
         ON CONFLICT (item_id, serial) DO NOTHING
         RETURNING id, serial`,
        itemId, s.serial, s.mac, int(warehouse_id), int(supplier_id),
        int(receipt_id), warranty, str(note))
      if (rows.length) out.push(rows[0])
    }
    return out
  }, { timeout: 30000 })

  const skipped = list.length - created.length
  res.status(201).json(successResponse(created,
    `Đã thêm ${created.length} serial${skipped ? `, bỏ qua ${skipped} serial đã tồn tại` : ''}`))
})

export const updateSerial = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const { serial, mac, status, warehouse_id, pom_id, warranty_end, note } = req.body
  const st = str(status)
  if (st && !['in_stock', 'issued', 'installed', 'returned', 'broken', 'sold'].includes(st))
    throw new AppError(400, 'Trạng thái serial không hợp lệ')

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_serials SET
       serial = COALESCE($2, serial), mac = $3,
       status = COALESCE($4, status),
       warehouse_id = $5, pom_id = $6, warranty_end = $7::date, note = $8
     WHERE id = $1 RETURNING *`,
    id, str(serial), str(mac), st, int(warehouse_id), int(pom_id),
    str(warranty_end), str(note))
  if (!rows.length) throw new AppError(404, 'Không tìm thấy serial')
  res.json(successResponse(rows[0], 'Đã cập nhật serial'))
})

export const deleteSerial = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_serials WHERE id=$1`, id)
  res.json(successResponse(null, 'Đã xoá serial'))
})

// ============================================================
// ĐƠN MUA HÀNG
// ============================================================
const PO_SELECT = `
  SELECT po.id, po.code, po.status, po.order_date, po.expected_date, po.reference_no,
         po.note, po.total_amount::float8 AS total_amount, po.pom_id,
         po.supplier_id, po.warehouse_id, po.created_at,
         s.name AS supplier_name, w.name AS warehouse_name,
         p.pom_code, p.project_name,
         u.full_name AS created_by_name,
         (SELECT COUNT(*)::int FROM public.wh_po_items pi WHERE pi.po_id = po.id) AS line_count,
         (SELECT COALESCE(SUM(pi.quantity), 0)::float8 FROM public.wh_po_items pi WHERE pi.po_id = po.id) AS total_qty,
         (SELECT COALESCE(SUM(pi.received_qty), 0)::float8 FROM public.wh_po_items pi WHERE pi.po_id = po.id) AS received_qty
    FROM public.wh_purchase_orders po
    LEFT JOIN public.wh_suppliers s ON s.id = po.supplier_id
    JOIN public.wh_warehouses w     ON w.id = po.warehouse_id
    LEFT JOIN public.poms p         ON p.id = po.pom_id
    LEFT JOIN public.users u        ON u.id = po.created_by`

export const getPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
  const status = str(req.query.status)
  const search = str(req.query.search)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `${PO_SELECT}
      WHERE ($1::text IS NULL OR po.status = $1)
        AND ($2::text IS NULL OR po.code ILIKE '%' || $2 || '%'
             OR s.name ILIKE '%' || $2 || '%'
             OR po.reference_no ILIKE '%' || $2 || '%')
      ORDER BY po.created_at DESC
      LIMIT 300`, status, search)
  res.json(successResponse(rows))
})

export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [doc] = await prisma.$queryRawUnsafe<any[]>(`${PO_SELECT} WHERE po.id = $1`, id)
  if (!doc) throw new AppError(404, 'Không tìm thấy đơn mua hàng')

  const items = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pi.id, pi.item_id, pi.quantity::float8 AS quantity,
            pi.received_qty::float8 AS received_qty,
            pi.unit_price::float8 AS unit_price, pi.amount::float8 AS amount, pi.note,
            i.sku, i.name AS item_name, i.unit
       FROM public.wh_po_items pi
       JOIN public.wh_items i ON i.id = pi.item_id
      WHERE pi.po_id = $1 ORDER BY pi.id`, id)

  const receipts = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, code, receipt_date, status, total_amount::float8 AS total_amount
       FROM public.wh_receipts WHERE po_id = $1 ORDER BY receipt_date DESC`, id)

  res.json(successResponse({ ...doc, items, receipts }))
})

export const savePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id ? int(req.params.id) : null
  const { supplier_id, warehouse_id, pom_id, order_date, expected_date,
          reference_no, note, items, order } = req.body

  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho nhận hàng')
  const lines = parseLines(items)
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    let docId = id
    let code: string

    if (docId) {
      const [cur] = await tx.$queryRawUnsafe<any[]>(
        `SELECT status, code FROM public.wh_purchase_orders WHERE id=$1 FOR UPDATE`, docId)
      if (!cur) throw new AppError(404, 'Không tìm thấy đơn mua hàng')
      if (cur.status === 'received') throw new AppError(400, 'Đơn đã nhận đủ hàng — không thể sửa')
      if (cur.status === 'cancelled') throw new AppError(400, 'Đơn đã huỷ')
      code = cur.code
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_purchase_orders SET supplier_id=$2, warehouse_id=$3, pom_id=$4,
           order_date=$5::date, expected_date=$6::date, reference_no=$7, note=$8, total_amount=$9
         WHERE id=$1`,
        docId, int(supplier_id), whId, int(pom_id),
        str(order_date) ?? todayStr(), str(expected_date), str(reference_no), str(note), total)
      await tx.$executeRawUnsafe(`DELETE FROM public.wh_po_items WHERE po_id=$1`, docId)
    } else {
      code = await nextCode(tx, 'wh_purchase_orders', 'PO')
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO public.wh_purchase_orders
           (code, supplier_id, warehouse_id, pom_id, order_date, expected_date,
            reference_no, note, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10) RETURNING id`,
        code, int(supplier_id), whId, int(pom_id),
        str(order_date) ?? todayStr(), str(expected_date), str(reference_no), str(note), total, uid)
      docId = row.id
    }

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_po_items (po_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        docId, l.item_id, l.quantity, l.unit_price, l.quantity * l.unit_price, l.note)
    }

    if (order) {
      await tx.$executeRawUnsafe(
        `UPDATE public.wh_purchase_orders SET status='ordered' WHERE id=$1 AND status='draft'`, docId)
    }
    return { id: docId, code }
  }, { timeout: 20000 })

  res.status(id ? 200 : 201).json(successResponse(
    result, order ? 'Đã chốt đơn mua hàng — số lượng này được tính là hàng đang về' : 'Đã lưu đơn mua hàng'))
})

export const orderPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE public.wh_purchase_orders SET status='ordered'
      WHERE id=$1 AND status='draft' RETURNING id`, id)
  if (!rows.length) throw new AppError(400, 'Chỉ chốt được đơn ở trạng thái nháp')
  res.json(successResponse({ id }, 'Đã chốt đơn — hàng được tính vào "đang về"'))
})

export const cancelPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [used] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM public.wh_receipts WHERE po_id=$1 AND status='posted'`, id)
  if (num(used?.n) > 0)
    throw new AppError(400, 'Đơn đã có phiếu nhập ghi sổ — không thể huỷ. Hãy huỷ phiếu nhập trước.')
  await prisma.$executeRawUnsafe(
    `UPDATE public.wh_purchase_orders SET status='cancelled' WHERE id=$1`, id)
  res.json(successResponse({ id }, 'Đã huỷ đơn mua hàng'))
})

export const deletePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)
  const [used] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM public.wh_receipts WHERE po_id=$1`, id)
  if (num(used?.n) > 0) throw new AppError(400, 'Đơn đã gắn phiếu nhập — không thể xoá')
  await prisma.$executeRawUnsafe(`DELETE FROM public.wh_purchase_orders WHERE id=$1`, id)
  res.json(successResponse(null, 'Đã xoá đơn mua hàng'))
})

/** Tạo sẵn phiếu nhập nháp từ phần hàng còn thiếu của đơn mua */
export const receivePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = int(req.params.id)!
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    const [po] = await tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.wh_purchase_orders WHERE id=$1 FOR UPDATE`, id)
    if (!po) throw new AppError(404, 'Không tìm thấy đơn mua hàng')
    if (po.status === 'cancelled') throw new AppError(400, 'Đơn đã huỷ')
    if (po.status === 'draft') throw new AppError(400, 'Đơn chưa chốt — hãy chốt đơn trước khi nhận hàng')

    const lines = await tx.$queryRawUnsafe<any[]>(
      `SELECT item_id,
              (quantity - received_qty)::float8 AS quantity,
              unit_price::float8 AS unit_price, note
         FROM public.wh_po_items
        WHERE po_id=$1 AND quantity > received_qty`, id)
    if (!lines.length) throw new AppError(400, 'Đơn đã nhận đủ hàng')

    const code = await nextCode(tx, 'wh_receipts', 'PN')
    const total = lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_price), 0)
    const [row] = await tx.$queryRawUnsafe<any[]>(
      `INSERT INTO public.wh_receipts
         (code, warehouse_id, supplier_id, receipt_date, reference_no, note,
          total_amount, receipt_type, pom_id, po_id, created_by)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,'purchase',$8,$9,$10) RETURNING id`,
      code, po.warehouse_id, po.supplier_id, todayStr(), po.reference_no,
      `Nhận hàng theo đơn mua ${po.code}`, total, po.pom_id, id, uid)

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_receipt_items (receipt_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        row.id, l.item_id, num(l.quantity), num(l.unit_price),
        num(l.quantity) * num(l.unit_price), l.note)
    }
    return { receipt_id: row.id, code }
  }, { timeout: 30000 })

  res.json(successResponse(result,
    `Đã tạo phiếu nhập nháp ${result.code} — kiểm hàng thực tế rồi ghi sổ`))
})

/** Tạo nhanh đơn mua hàng từ danh sách đề xuất */
export const createPOFromSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const { supplier_id, warehouse_id, pom_id, expected_date, note, items } = req.body
  const whId = int(warehouse_id)
  if (!whId) throw new AppError(400, 'Chưa chọn kho nhận hàng')
  const lines = parseLines(items)
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const uid = userId(req)

  const result = await prisma.$transaction(async tx => {
    const code = await nextCode(tx, 'wh_purchase_orders', 'PO')
    const [row] = await tx.$queryRawUnsafe<any[]>(
      `INSERT INTO public.wh_purchase_orders
         (code, supplier_id, warehouse_id, pom_id, order_date, expected_date, note, total_amount, created_by)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9) RETURNING id`,
      code, int(supplier_id), whId, int(pom_id), todayStr(),
      str(expected_date), str(note) ?? 'Tạo từ đề xuất mua hàng', total, uid)

    for (const l of lines) {
      await tx.$executeRawUnsafe(
        `INSERT INTO public.wh_po_items (po_id, item_id, quantity, unit_price, amount, note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        row.id, l.item_id, l.quantity, l.unit_price, l.quantity * l.unit_price, l.note)
    }
    return { id: row.id, code }
  }, { timeout: 20000 })

  res.status(201).json(successResponse(result, `Đã tạo đơn mua hàng nháp ${result.code}`))
})

// ============================================================
// TRA CỨU NHANH — dùng cho app mobile ngoài công trường
// Trả lời gọn: mặt hàng này còn bao nhiêu, ở kho nào
// ============================================================
export const quickLookup = asyncHandler(async (req: Request, res: Response) => {
  const search = str(req.query.search) ?? str(req.query.q)
  if (!search) throw new AppError(400, 'Nhập mã SKU, tên hàng, barcode hoặc serial để tra cứu')

  const items = await prisma.$queryRaw<any[]>`
    SELECT i.id AS item_id, i.sku, i.name AS item_name, i.unit, i.spec,
           i.pack_unit, i.pack_size::float8 AS pack_size, i.track_serial,
           COALESCE(av.on_hand, 0)::float8   AS on_hand,
           COALESCE(av.reserved, 0)::float8  AS reserved,
           COALESCE(av.available, 0)::float8 AS available,
           COALESCE(av.incoming, 0)::float8  AS incoming
      FROM public.wh_items i
      LEFT JOIN public.wh_item_availability av ON av.item_id = i.id
     WHERE i.is_active
       AND (i.sku ILIKE ${'%' + search + '%'}
            OR i.name ILIKE ${'%' + search + '%'}
            OR i.barcode ILIKE ${'%' + search + '%'}
            OR EXISTS (SELECT 1 FROM public.wh_serials sn
                        WHERE sn.item_id = i.id AND sn.serial ILIKE ${'%' + search + '%'}))
     ORDER BY i.name
     LIMIT 30
  `

  const ids = items.map(i => i.item_id)
  const stocks = ids.length
    ? await prisma.$queryRaw<any[]>`
        SELECT s.item_id, s.warehouse_id, w.name AS warehouse_name, w.kind,
               s.quantity::float8 AS quantity,
               GREATEST(s.quantity - s.reserved_qty, 0)::float8 AS available
          FROM public.wh_stocks s
          JOIN public.wh_warehouses w ON w.id = s.warehouse_id
         WHERE s.item_id = ANY(${ids}::int[]) AND s.quantity > 0
         ORDER BY s.quantity DESC`
    : []

  res.json(successResponse({
    items: items.map(i => ({ ...i, stocks: stocks.filter(s => s.item_id === i.item_id) })),
  }))
})

// Giữ tham chiếu để tránh cảnh báo unused khi build
export const _internals = { syncPurchaseOrderTx }
