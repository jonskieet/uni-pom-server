// ============================================================
// src/controllers/businessTrip.ts — Chi phí công tác
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── Helper: tính tổng days và subsidy ─────────────────────────
function calcDays(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime()
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1)
}

async function getSubsidyRate(): Promise<number> {
  try {
    const setting = await prisma.appConfig.findUnique({ where: { key: 'subsidy_per_day' } })
    return setting ? parseFloat(setting.value) : 150000
  } catch { return 150000 }
}

// ── POST /business-trips — Tạo chuyến công tác ───────────────
export const createTrip = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const { title, destination, province, start_date, end_date, advance_amount, note, expenses } = req.body

  const start = new Date(start_date)
  const end   = new Date(end_date)
  const totalDays = calcDays(start, end)
  const subsidyRate = await getSubsidyRate()
  const totalSubsidy = totalDays * subsidyRate

  // Tạo trip_code: CT-YYYYMMDD-USERID
  const dateStr = start.toISOString().slice(0, 10).replace(/-/g, '')
  const tripCode = `CT-${dateStr}-${userId}-${Date.now().toString().slice(-4)}`

  // Tính tổng expense nếu có
  let totalExpense = 0
  if (expenses?.length) {
    totalExpense = expenses.reduce((s: number, e: any) => s + (parseFloat(e.total) || 0), 0)
  }

  const trip = await prisma.businessTrip.create({
    data: {
      user_id: userId,
      trip_code: tripCode,
      title,
      destination,
      province: province || null,
      start_date: start,
      end_date: end,
      total_days: totalDays,
      subsidy_per_day: subsidyRate,
      total_subsidy: totalSubsidy,
      total_expense: totalExpense,
      advance_amount: parseFloat(advance_amount) || 0,
      note: note || null,
      status: 'draft',
      expenses: expenses?.length ? {
        create: expenses.map((e: any, idx: number) => ({
          expense_date: new Date(e.expense_date),
          ward_name:    e.ward_name   || null,
          province:     e.province    || null,
          content:      e.content,
          location:     e.location    || null,
          description:  e.description,
          note:         e.note        || null,
          has_invoice:  e.has_invoice || false,
          department:   e.department  || null,
          unit:         e.unit        || 'Ngày',
          quantity:     parseFloat(e.quantity)   || 1,
          unit_price:   parseFloat(e.unit_price) || 0,
          total:        parseFloat(e.total)       || 0,
          sort_order:   idx
        }))
      } : undefined
    },
    include: { expenses: true, user: { select: { id: true, full_name: true, role: true } } }
  })
  res.json(successResponse(trip))
})

// ── GET /business-trips — Danh sách (own / all by accounting) ─
export const getTrips = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user
  const { status, user_id, from, to, all } = req.query

  const isAccounting = user.role === 'accounting' || user.role === 'admin'

  const where: any = {}
  if (!isAccounting || !all) where.user_id = parseInt(user_id as string) || user.id
  if (isAccounting && all)   delete where.user_id
  if (isAccounting && user_id) where.user_id = parseInt(user_id as string)
  if (status)  where.status = status
  if (from)    where.start_date = { ...where.start_date, gte: new Date(from as string) }
  if (to)      where.end_date   = { ...where.end_date,   lte: new Date(to   as string) }

  const trips = await prisma.businessTrip.findMany({
    where,
    include: { user: { select: { id: true, full_name: true, role: true } }, expenses: true },
    orderBy: { created_at: 'desc' }
  })
  res.json(successResponse(trips))
})

// ── GET /business-trips/:id ──────────────────────────────────
export const getTripById = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params.id)
  const user = (req as any).user

  const trip = await prisma.businessTrip.findUnique({
    where: { id },
    include: { user: { select: { id: true, full_name: true, role: true } }, expenses: { orderBy: { sort_order: 'asc' } } }
  })
  if (!trip) return res.status(404).json({ error: 'Không tìm thấy chuyến công tác' })
  if (user.role !== 'accounting' && user.role !== 'admin' && trip.user_id !== user.id)
    return res.status(403).json({ error: 'Không có quyền xem' })

  res.json(successResponse(trip))
})

// ── PUT /business-trips/:id — Cập nhật ──────────────────────
export const updateTrip = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params.id)
  const user = (req as any).user
  const { title, destination, province, start_date, end_date, advance_amount, note, expenses } = req.body

  const existing = await prisma.businessTrip.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' })
  if (existing.user_id !== user.id && user.role !== 'accounting' && user.role !== 'admin')
    return res.status(403).json({ error: 'Không có quyền sửa' })
  if (existing.status === 'approved')
    return res.status(400).json({ error: 'Không thể sửa chuyến đã được duyệt' })

  const start = start_date ? new Date(start_date) : existing.start_date
  const end   = end_date   ? new Date(end_date)   : existing.end_date
  const totalDays    = calcDays(start, end)
  const subsidyRate  = Number(existing.subsidy_per_day)
  const totalSubsidy = totalDays * subsidyRate

  let totalExpense = 0
  if (expenses?.length) {
    totalExpense = expenses.reduce((s: number, e: any) => s + (parseFloat(e.total) || 0), 0)
    // Xoá expenses cũ rồi tạo lại
    await prisma.tripExpense.deleteMany({ where: { trip_id: id } })
    await prisma.tripExpense.createMany({
      data: expenses.map((e: any, idx: number) => ({
        trip_id: id,
        expense_date: new Date(e.expense_date),
        ward_name:    e.ward_name   || null,
        province:     e.province    || null,
        content:      e.content,
        location:     e.location    || null,
        description:  e.description,
        note:         e.note        || null,
        has_invoice:  e.has_invoice || false,
        department:   e.department  || null,
        unit:         e.unit        || 'Ngày',
        quantity:     parseFloat(e.quantity)   || 1,
        unit_price:   parseFloat(e.unit_price) || 0,
        total:        parseFloat(e.total)       || 0,
        sort_order:   idx
      }))
    })
  } else {
    const existingExpenses = await prisma.tripExpense.findMany({ where: { trip_id: id } })
    totalExpense = existingExpenses.reduce((s: number, e: any) => s + Number(e.total), 0)
  }

  const trip = await prisma.businessTrip.update({
    where: { id },
    data: {
      ...(title        && { title }),
      ...(destination  && { destination }),
      province: province || null,
      start_date: start,
      end_date:   end,
      total_days: totalDays,
      total_subsidy: totalSubsidy,
      total_expense: totalExpense,
      ...(advance_amount !== undefined && { advance_amount: parseFloat(advance_amount) }),
      ...(note !== undefined && { note })
    },
    include: { expenses: { orderBy: { sort_order: 'asc' } }, user: { select: { id: true, full_name: true } } }
  })
  res.json(successResponse(trip))
})

// ── PUT /business-trips/:id/submit — Nộp để kế toán xét ─────
export const submitTrip = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await prisma.businessTrip.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' })
  if (existing.user_id !== user.id) return res.status(403).json({ error: 'Không có quyền' })
  if (existing.status !== 'draft' && existing.status !== 'rejected')
    return res.status(400).json({ error: 'Chỉ có thể nộp khi đang ở trạng thái nháp hoặc bị từ chối' })

  const trip = await prisma.businessTrip.update({
    where: { id },
    data:  { status: 'submitted' }
  })
  res.json(successResponse(trip))
})

// ── PUT /business-trips/:id/approve — Kế toán duyệt ─────────
export const approveTrip = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const trip = await prisma.businessTrip.update({
    where: { id },
    data:  { status: 'approved' }
  })
  res.json(successResponse(trip))
})

// ── PUT /business-trips/:id/reject — Kế toán từ chối ────────
export const rejectTrip = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params.id)
  const { note } = req.body
  const trip = await prisma.businessTrip.update({
    where: { id },
    data:  { status: 'rejected', note: note || null }
  })
  res.json(successResponse(trip))
})

// ── DELETE /business-trips/:id ───────────────────────────────
export const deleteTrip = asyncHandler(async (req: Request, res: Response) => {
  const id   = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await prisma.businessTrip.findUnique({ where: { id } })
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy' })
  if (existing.user_id !== user.id && user.role !== 'admin')
    return res.status(403).json({ error: 'Không có quyền xoá' })

  await prisma.businessTrip.delete({ where: { id } })
  res.json(successResponse({ id }))
})

// ── GET /business-trips/settings — Lấy cài đặt trợ cấp ──────
export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await prisma.appConfig.findMany()
  res.json(successResponse(settings))
})

// ── PUT /business-trips/settings — Cập nhật trợ cấp (admin/kế toán) ─
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { subsidy_per_day } = req.body
  const setting = await prisma.appConfig.upsert({
    where:  { key: 'subsidy_per_day' },
    update: { value: String(subsidy_per_day), updated_at: new Date() },
    create: { key: 'subsidy_per_day', value: String(subsidy_per_day), label: 'Trợ cấp công tác mỗi ngày (VNĐ)' }
  })
  res.json(successResponse(setting))
})

// ── GET /business-trips/report — Báo cáo tổng cho admin ──────
export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const { year, month } = req.query
  const y = parseInt(year as string) || new Date().getFullYear()
  const m = month ? parseInt(month as string) : null

  const from = m ? new Date(y, m - 1, 1) : new Date(y, 0, 1)
  const to   = m ? new Date(y, m, 0, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59)

  const trips = await prisma.businessTrip.findMany({
    where: { start_date: { gte: from, lte: to } },
    include: { user: { select: { id: true, full_name: true, role: true } }, expenses: true }
  })

  const byUser: Record<number, any> = {}
  for (const t of trips) {
    const uid = t.user_id
    if (!byUser[uid]) byUser[uid] = { user: t.user, trips: 0, total_days: 0, total_subsidy: 0, total_expense: 0 }
    byUser[uid].trips++
    byUser[uid].total_days    += t.total_days
    byUser[uid].total_subsidy += Number(t.total_subsidy)
    byUser[uid].total_expense += Number(t.total_expense)
  }

  res.json(successResponse({
    trips,
    by_user:       Object.values(byUser),
    total_trips:   trips.length,
    total_subsidy: trips.reduce((s: number, t: any) => s + Number(t.total_subsidy), 0),
    total_expense: trips.reduce((s: number, t: any) => s + Number(t.total_expense), 0)
  }))
})
