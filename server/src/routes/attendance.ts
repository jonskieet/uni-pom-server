// ============================================================
// src/controllers/attendance.ts — Chấm công
// - Nhân viên: checkIn, checkOut, getMyAttendance
// - Kế toán / Admin: getAll, getStats
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── helpers ─────────────────────────────────────────────────────────────────
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

/** Phân loại đi trễ: giờ check-in > 08:30 → late */
function computeStatus(checkIn: Date | null): string {
  if (!checkIn) return 'absent'
  const h = checkIn.getHours()
  const m = checkIn.getMinutes()
  return h > 8 || (h === 8 && m > 30) ? 'late' : 'present'
}

// ── GET /attendance/my ───────────────────────────────────────────────────────
export const getMyAttendance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { month, year } = req.query as Record<string, string>

  const now   = new Date()
  const y     = Number(year)  || now.getFullYear()
  const m     = Number(month) || now.getMonth() + 1   // 1-based

  const from = new Date(y, m - 1, 1)
  const to   = new Date(y, m, 0, 23, 59, 59) // last day of month

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.*, u.full_name, u.username, u.role
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.user_id = $1 AND a.date >= $2 AND a.date <= $3
     ORDER BY a.date DESC`,
    userId, from, to
  )

  res.json(successResponse(rows))
})

// ── GET /attendance (ke_toan + admin) ────────────────────────────────────────
export const getAllAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { month, year, user_id, status } = req.query as Record<string, string>

  const now = new Date()
  const y   = Number(year)  || now.getFullYear()
  const m   = Number(month) || now.getMonth() + 1

  const from = new Date(y, m - 1, 1)
  const to   = new Date(y, m, 0, 23, 59, 59)

  let where = `a.date >= $1 AND a.date <= $2`
  const params: any[] = [from, to]
  let idx = 3

  if (user_id) {
    where += ` AND a.user_id = $${idx++}`
    params.push(Number(user_id))
  }
  if (status) {
    where += ` AND a.status = $${idx++}`
    params.push(status)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.*, u.full_name, u.username, u.role, u.avatar_url
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE ${where}
     ORDER BY a.date DESC, u.full_name ASC`,
    ...params
  )

  res.json(successResponse(rows))
})

// ── POST /attendance/check-in ─────────────────────────────────────────────────
export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const userId  = req.user!.id
  const { note } = req.body ?? {}

  const now     = new Date()
  const today   = toDateOnly(now)
  const status  = computeStatus(now)

  // Upsert: nếu đã chấm công hôm nay thì không cho check-in lại
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2`,
    userId, today
  )

  if (existing.length > 0 && existing[0].check_in) {
    throw new AppError(400, 'Bạn đã chấm công vào hôm nay rồi!')
  }

  let row: any
  if (existing.length > 0) {
    // Update bản ghi đã có (check_in bị null) → set check_in
    await prisma.$executeRawUnsafe(
      `UPDATE attendance SET check_in = $1, status = $2, note = $3, updated_at = NOW()
       WHERE user_id = $4 AND date = $5`,
      now, status, note ?? null, userId, today
    )
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance (user_id, date, check_in, status, note)
       VALUES ($1, $2, $3, $4, $5)`,
      userId, today, now, status, note ?? null
    )
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2`, userId, today
  )
  row = rows[0]

  res.json(successResponse(row, 'Chấm công vào thành công'))
})

// ── POST /attendance/check-out ─────────────────────────────────────────────────
export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { note } = req.body ?? {}

  const now   = new Date()
  const today = toDateOnly(now)

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, check_in, check_out FROM attendance WHERE user_id = $1 AND date = $2`,
    userId, today
  )

  if (!existing.length || !existing[0].check_in) {
    throw new AppError(400, 'Bạn chưa chấm công vào hôm nay!')
  }
  if (existing[0].check_out) {
    throw new AppError(400, 'Bạn đã chấm công ra rồi!')
  }

  await prisma.$executeRawUnsafe(
    `UPDATE attendance SET check_out = $1, note = COALESCE($2, note), updated_at = NOW()
     WHERE user_id = $3 AND date = $4`,
    now, note ?? null, userId, today
  )

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2`, userId, today
  )

  res.json(successResponse(rows[0], 'Chấm công ra thành công'))
})

// ── GET /attendance/today — Trạng thái hôm nay của user hiện tại ─────────────
export const getTodayStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const today  = toDateOnly(new Date())

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2`, userId, today
  )

  res.json(successResponse(rows[0] ?? null))
})

// ── GET /attendance/stats ─────────────────────────────────────────────────────
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const { month, year } = req.query as Record<string, string>

  const now = new Date()
  const y   = Number(year)  || now.getFullYear()
  const m   = Number(month) || now.getMonth() + 1

  const from = new Date(y, m - 1, 1)
  const to   = new Date(y, m, 0, 23, 59, 59)

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT u.id, u.full_name, u.role,
            COUNT(*) FILTER (WHERE a.status = 'present') AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'late')    AS late_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')  AS absent_count,
            COUNT(*) FILTER (WHERE a.status = 'leave')   AS leave_count,
            COUNT(*)                                      AS total_days
     FROM users u
     LEFT JOIN attendance a ON a.user_id = u.id AND a.date >= $1 AND a.date <= $2
     WHERE u.role != 'admin' AND u.is_active = true
     GROUP BY u.id, u.full_name, u.role
     ORDER BY u.full_name`,
    from, to
  )

  res.json(successResponse(rows))
})
