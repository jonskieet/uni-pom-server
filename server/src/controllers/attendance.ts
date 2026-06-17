// ============================================================
// src/controllers/attendance.ts — Chấm công
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── POST /attendance/checkin — Chấm công vào ─────────────────
export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.attendance.findUnique({
    where: { user_id_date: { user_id: userId, date: today } }
  })
  if (existing) {
    return res.status(400).json({ error: 'Hôm nay bạn đã chấm công vào rồi' })
  }

  const checkInTime = new Date()
  // Nếu chấm sau 8:30 → trễ
  const isLate = checkInTime.getHours() > 8 || (checkInTime.getHours() === 8 && checkInTime.getMinutes() > 30)

  const record = await prisma.attendance.create({
    data: {
      user_id: userId,
      date: today,
      check_in: checkInTime,
      status: isLate ? 'late' : 'present',
      note: req.body.note || null
    },
    include: { user: { select: { id: true, full_name: true, role: true } } }
  })
  res.json(successResponse(record))
})

// ── PUT /attendance/checkout — Chấm công ra ─────────────────
export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existing = await prisma.attendance.findUnique({
    where: { user_id_date: { user_id: userId, date: today } }
  })
  if (!existing) {
    return res.status(400).json({ error: 'Bạn chưa chấm công vào hôm nay' })
  }
  if (existing.check_out) {
    return res.status(400).json({ error: 'Bạn đã chấm công ra rồi' })
  }

  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { check_out: new Date() },
    include: { user: { select: { id: true, full_name: true, role: true } } }
  })
  res.json(successResponse(record))
})

// ── GET /attendance/today — Xem trạng thái hôm nay của bản thân ──
export const getTodayStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const record = await prisma.attendance.findUnique({
    where: { user_id_date: { user_id: userId, date: today } },
    include: { user: { select: { id: true, full_name: true, role: true } } }
  })
  res.json(successResponse(record))
})

// ── GET /attendance/my?month=&year= — Lịch sử chấm công cá nhân ─
export const getMyHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const year  = parseInt(req.query.year  as string) || new Date().getFullYear()
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1

  const from = new Date(year, month - 1, 1)
  const to   = new Date(year, month, 0, 23, 59, 59)

  const records = await prisma.attendance.findMany({
    where: { user_id: userId, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' }
  })
  res.json(successResponse(records))
})

// ── GET /attendance/all — Kế toán / Admin xem tất cả nhân viên ──
export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const { year, month, user_id, status } = req.query

  const y = parseInt(year  as string) || new Date().getFullYear()
  const m = parseInt(month as string) || new Date().getMonth() + 1

  const from = new Date(y, m - 1, 1)
  const to   = new Date(y, m, 0, 23, 59, 59)

  const where: any = { date: { gte: from, lte: to } }
  if (user_id) where.user_id = parseInt(user_id as string)
  if (status)  where.status  = status

  const records = await prisma.attendance.findMany({
    where,
    include: { user: { select: { id: true, full_name: true, role: true } } },
    orderBy: [{ date: 'desc' }, { user_id: 'asc' }]
  })

  // Tổng hợp theo user
  const summary: Record<number, any> = {}
  for (const r of records) {
    const uid = r.user_id
    if (!summary[uid]) {
      summary[uid] = {
        user: r.user,
        present: 0, late: 0, absent: 0, half_day: 0, total: 0
      }
    }
    summary[uid][r.status]++
    summary[uid].total++
  }

  res.json(successResponse({ records, summary: Object.values(summary) }))
})

// ── PUT /attendance/:id — Admin/Kế toán sửa bản ghi ──────────
export const updateRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { status, check_in, check_out, note } = req.body

  const record = await prisma.attendance.update({
    where: { id },
    data: {
      ...(status    && { status }),
      ...(check_in  && { check_in: new Date(check_in) }),
      ...(check_out && { check_out: new Date(check_out) }),
      ...(note !== undefined && { note })
    },
    include: { user: { select: { id: true, full_name: true } } }
  })
  res.json(successResponse(record))
})
