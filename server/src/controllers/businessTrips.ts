// ============================================================
// src/controllers/businessTrips.ts — Chi phí công tác
// Roles tạo/xem của mình: mọi role trừ admin, ke_toan, sales_admin
// Roles quản lý: ke_toan, admin
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── GET /business-trips/allowance — Mức trợ cấp hiện tại ────────────────────
export const getAllowance = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT value FROM public.system_settings WHERE key = 'daily_allowance'`
  )
  const amount = rows.length ? Number(rows[0].value) : 150000
  res.json(successResponse({ daily_allowance: amount }))
})

// ── PUT /business-trips/allowance — Cập nhật mức trợ cấp (admin only) ────────
export const setAllowance = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = req.body
  if (!amount || isNaN(Number(amount))) throw new AppError(400, 'Thiếu hoặc sai field "amount"')

  await prisma.$executeRawUnsafe(
    `INSERT INTO public.system_settings (key, value)
     VALUES ('daily_allowance', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    String(amount)
  )
  res.json(successResponse({ daily_allowance: Number(amount) }, 'Cập nhật mức trợ cấp thành công'))
})

// ── GET /business-trips/my ────────────────────────────────────────────────────
export const getMyTrips = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { month, year, status } = req.query as Record<string, string>

  let where = `bt.user_id = $1`
  const params: any[] = [userId]
  let idx = 2

  if (month && year) {
    where += ` AND EXTRACT(MONTH FROM bt.report_date) = $${idx++} AND EXTRACT(YEAR FROM bt.report_date) = $${idx++}`
    params.push(Number(month), Number(year))
  }
  if (status) {
    where += ` AND bt.status = $${idx++}`
    params.push(status)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bt.*,
            u.full_name, u.username, u.role,
            (SELECT json_agg(i ORDER BY i.sort_order)
             FROM business_trip_items i WHERE i.trip_id = bt.id) AS items
     FROM business_trips bt
     JOIN users u ON u.id = bt.user_id
     WHERE ${where}
     ORDER BY bt.report_date DESC`,
    ...params
  )

  res.json(successResponse(rows))
})

// ── GET /business-trips (ke_toan + admin) ────────────────────────────────────
export const getAllTrips = asyncHandler(async (req: Request, res: Response) => {
  const { month, year, user_id, status } = req.query as Record<string, string>

  let where = `1=1`
  const params: any[] = []
  let idx = 1

  if (month && year) {
    where += ` AND EXTRACT(MONTH FROM bt.report_date) = $${idx++} AND EXTRACT(YEAR FROM bt.report_date) = $${idx++}`
    params.push(Number(month), Number(year))
  }
  if (user_id) {
    where += ` AND bt.user_id = $${idx++}`
    params.push(Number(user_id))
  }
  if (status) {
    where += ` AND bt.status = $${idx++}`
    params.push(status)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bt.*,
            u.full_name, u.username, u.role, u.avatar_url,
            (SELECT json_agg(i ORDER BY i.sort_order)
             FROM business_trip_items i WHERE i.trip_id = bt.id) AS items
     FROM business_trips bt
     JOIN users u ON u.id = bt.user_id
     WHERE ${where}
     ORDER BY bt.report_date DESC, bt.created_at DESC`,
    ...params
  )

  res.json(successResponse(rows))
})

// ── GET /business-trips/:id ───────────────────────────────────────────────────
export const getTripById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id
  const role   = req.user!.role

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bt.*,
            u.full_name, u.username, u.role,
            (SELECT json_agg(i ORDER BY i.sort_order)
             FROM business_trip_items i WHERE i.trip_id = bt.id) AS items
     FROM business_trips bt
     JOIN users u ON u.id = bt.user_id
     WHERE bt.id = $1`,
    Number(id)
  )

  if (!rows.length) throw new AppError(404, 'Không tìm thấy báo cáo công tác')

  const trip = rows[0]
  // Chỉ cho xem của mình trừ ke_toan / admin
  if (role !== 'ke_toan' && role !== 'admin' && trip.user_id !== userId) {
    throw new AppError(403, 'Bạn không có quyền xem báo cáo này')
  }

  res.json(successResponse(trip))
})

// ── POST /business-trips ──────────────────────────────────────────────────────
export const createTrip = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const {
    report_date, time_period, advance_amount, note, payment_method, items = []
  } = req.body

  if (!report_date) throw new AppError(400, 'Thiếu ngày báo cáo')

  // Tính tổng chi phí: mỗi "item" (ngày công tác) chứa mảng expenses (các khoản chi trong ngày)
  const dayTotal = (i: any) =>
    Array.isArray(i.expenses) ? i.expenses.reduce((s: number, e: any) => s + Number(e.total_price ?? 0), 0) : Number(i.total_price ?? 0)
  const total_amount  = (items as any[]).reduce((s: number, i: any) => s + dayTotal(i), 0)
  const return_amount = Number(advance_amount ?? 0) - total_amount

  // Tạo header
  await prisma.$executeRawUnsafe(
    `INSERT INTO business_trips
       (user_id, report_date, time_period, advance_amount, total_amount, return_amount, note, payment_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    userId,
    new Date(report_date),
    time_period ?? null,
    Number(advance_amount ?? 0),
    total_amount,
    return_amount,
    note ?? null,
    payment_method === 'transfer' ? 'transfer' : 'cash'
  )

  // Lấy id vừa tạo
  const tripRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM business_trips WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, userId
  )
  const tripId = tripRows[0].id

  // Tạo items (mỗi item = 1 ngày công tác, chứa mảng expenses)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const expenses = Array.isArray(item.expenses) ? item.expenses : []
    const itemTotal = expenses.reduce((s: number, e: any) => s + Number(e.total_price ?? Number(e.quantity ?? 1) * Number(e.unit_price ?? 0)), 0)
    await prisma.$executeRawUnsafe(
      `INSERT INTO business_trip_items
         (trip_id, date, ward, province, content, location,
          note, sale_person, tech_person, total_price, expenses, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      tripId,
      item.date ? new Date(item.date) : null,
      item.ward        ?? null,
      item.province    ?? null,
      item.content     ?? null,
      item.location    ?? null,
      item.note        ?? null,
      item.sale_person ?? null,
      item.tech_person ?? null,
      itemTotal,
      JSON.stringify(expenses),
      i
    )
  }

  const result = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bt.*, (SELECT json_agg(i ORDER BY i.sort_order)
     FROM business_trip_items i WHERE i.trip_id = bt.id) AS items
     FROM business_trips bt WHERE bt.id = $1`, tripId
  )

  res.status(201).json(successResponse(result[0], 'Tạo báo cáo công tác thành công'))
})

// ── PUT /business-trips/:id ───────────────────────────────────────────────────
export const updateTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id
  const role   = req.user!.role
  const { report_date, time_period, advance_amount, note, payment_method, items = [] } = req.body

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM business_trips WHERE id = $1`, Number(id)
  )
  if (!existing.length) throw new AppError(404, 'Không tìm thấy báo cáo')
  if (existing[0].user_id !== userId && role !== 'ke_toan' && role !== 'admin') {
    throw new AppError(403, 'Không có quyền cập nhật')
  }
  if (existing[0].status === 'approved') throw new AppError(400, 'Không thể sửa báo cáo đã duyệt')

  const dayTotal = (i: any) =>
    Array.isArray(i.expenses) ? i.expenses.reduce((s: number, e: any) => s + Number(e.total_price ?? 0), 0) : Number(i.total_price ?? 0)
  const total_amount  = (items as any[]).reduce((s: number, i: any) => s + dayTotal(i), 0)
  const return_amount = Number(advance_amount ?? existing[0].advance_amount) - total_amount

  await prisma.$executeRawUnsafe(
    `UPDATE business_trips
     SET report_date = $1, time_period = $2, advance_amount = $3,
         total_amount = $4, return_amount = $5, note = $6, payment_method = $7, updated_at = NOW()
     WHERE id = $8`,
    report_date ? new Date(report_date) : existing[0].report_date,
    time_period ?? existing[0].time_period,
    Number(advance_amount ?? existing[0].advance_amount),
    total_amount,
    return_amount,
    note ?? existing[0].note,
    payment_method === 'transfer' || payment_method === 'cash' ? payment_method : existing[0].payment_method,
    Number(id)
  )

  // Xoá và tạo lại items
  await prisma.$executeRawUnsafe(`DELETE FROM business_trip_items WHERE trip_id = $1`, Number(id))
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const expenses = Array.isArray(item.expenses) ? item.expenses : []
    const itemTotal = expenses.reduce((s: number, e: any) => s + Number(e.total_price ?? Number(e.quantity ?? 1) * Number(e.unit_price ?? 0)), 0)
    await prisma.$executeRawUnsafe(
      `INSERT INTO business_trip_items
         (trip_id, date, ward, province, content, location,
          note, sale_person, tech_person, total_price, expenses, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      Number(id),
      item.date ? new Date(item.date) : null,
      item.ward ?? null, item.province ?? null, item.content ?? null,
      item.location ?? null, item.note ?? null,
      item.sale_person ?? null, item.tech_person ?? null,
      itemTotal,
      JSON.stringify(expenses),
      i
    )
  }

  const result = await prisma.$queryRawUnsafe<any[]>(
    `SELECT bt.*, (SELECT json_agg(i ORDER BY i.sort_order)
     FROM business_trip_items i WHERE i.trip_id = bt.id) AS items
     FROM business_trips bt WHERE bt.id = $1`, Number(id)
  )
  res.json(successResponse(result[0], 'Cập nhật thành công'))
})

// ── DELETE /business-trips/:id ────────────────────────────────────────────────
export const deleteTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id
  const role   = req.user!.role

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM business_trips WHERE id = $1`, Number(id)
  )
  if (!existing.length) throw new AppError(404, 'Không tìm thấy báo cáo')
  if (existing[0].user_id !== userId && role !== 'ke_toan' && role !== 'admin') {
    throw new AppError(403, 'Không có quyền xoá')
  }
  if (existing[0].status === 'approved') throw new AppError(400, 'Không thể xoá báo cáo đã duyệt')

  await prisma.$executeRawUnsafe(`DELETE FROM business_trips WHERE id = $1`, Number(id))
  res.json(successResponse(null, 'Xoá thành công'))
})

// ── PUT /business-trips/:id/approve ──────────────────────────────────────────
export const approveTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.$executeRawUnsafe(
    `UPDATE business_trips SET status = 'approved', updated_at = NOW() WHERE id = $1`, Number(id)
  )
  res.json(successResponse(null, 'Đã phê duyệt báo cáo'))
})

// ── PUT /business-trips/:id/reject ───────────────────────────────────────────
export const rejectTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { note } = req.body ?? {}
  await prisma.$executeRawUnsafe(
    `UPDATE business_trips SET status = 'rejected', note = COALESCE($1, note), updated_at = NOW() WHERE id = $2`,
    note ?? null, Number(id)
  )
  res.json(successResponse(null, 'Đã từ chối báo cáo'))
})

// ── PUT /business-trips/:id/mark-paid — Xác nhận đã chuyển khoản ─────────────
export const markTripPaid = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, is_paid FROM business_trips WHERE id = $1`, Number(id)
  )
  if (!existing.length) throw new AppError(404, 'Không tìm thấy báo cáo')
  if (existing[0].status !== 'approved') throw new AppError(400, 'Chỉ có thể xác nhận chuyển khoản cho báo cáo đã duyệt')
  if (existing[0].is_paid) throw new AppError(400, 'Báo cáo này đã được xác nhận chuyển khoản trước đó')

  await prisma.$executeRawUnsafe(
    `UPDATE business_trips SET is_paid = TRUE, paid_at = NOW(), paid_by = $1, updated_at = NOW() WHERE id = $2`,
    userId, Number(id)
  )
  res.json(successResponse(null, 'Đã xác nhận chuyển khoản'))
})