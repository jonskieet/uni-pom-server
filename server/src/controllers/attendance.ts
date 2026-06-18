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
let attendanceSchemaReady: Promise<void> | null = null

function ensureAttendanceSchema(): Promise<void> {
  if (!attendanceSchemaReady) {
    attendanceSchemaReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS attendance (
          id         SERIAL PRIMARY KEY,
          user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date       DATE NOT NULL,
          check_in   TIMESTAMPTZ,
          check_out  TIMESTAMPTZ,
          note       TEXT,
          status     TEXT NOT NULL DEFAULT 'present',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, date)
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id)`)
    })()
  }
  return attendanceSchemaReady
}

// ── helpers ─────────────────────────────────────────────────────────────────
function toVietnamDateOnly(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function getVietnamHourMinute(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return { hour, minute }
}

/** Phân loại đi trễ: giờ check-in > 08:30 → late */
function computeStatus(checkIn: Date | null): string {
  if (!checkIn) return 'absent'
  const { hour, minute } = getVietnamHourMinute(checkIn)
  return hour > 8 || (hour === 8 && minute > 30) ? 'late' : 'present'
}

// ── GET /attendance/my ───────────────────────────────────────────────────────
export const getMyAttendance = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId = req.user!.id
  const { month, year } = req.query as Record<string, string>

  const now   = new Date()
  const y     = Number(year)  || now.getFullYear()
  const m     = Number(month) || now.getMonth() + 1   // 1-based

  // Truyền dạng chuỗi 'YYYY-MM-DD' + cast ::date — tránh lỗi
  // "operator does not exist: date = text" khi $queryRawUnsafe
  // không biết kiểu cột đích và serialize Date object thành text.
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = toVietnamDateOnly(new Date(y, m, 0, 23, 59, 59)) // ngày cuối tháng

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.*, u.full_name, u.username, u.role
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE a.user_id = $1 AND a.date >= $2::date AND a.date <= $3::date
     ORDER BY a.date DESC`,
    userId, from, to
  )

  res.json(successResponse(rows))
})

// ── GET /attendance (ke_toan + admin) ────────────────────────────────────────
export const getAllAttendance = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const { month, year, user_id, status } = req.query as Record<string, string>

  const now = new Date()
  const y   = Number(year)  || now.getFullYear()
  const m   = Number(month) || now.getMonth() + 1

  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = toVietnamDateOnly(new Date(y, m, 0, 23, 59, 59))

  let where = `a.date >= $1::date AND a.date <= $2::date`
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
  await ensureAttendanceSchema()
  const userId  = req.user!.id
  const { note } = req.body ?? {}

  const now     = new Date()
  const today   = toVietnamDateOnly(now)
  const status  = computeStatus(now)

  // Upsert: nếu đã chấm công hôm nay thì không cho check-in lại
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2::date`,
    userId, today
  )

  if (existing.length > 0 && existing[0].check_in) {
    throw new AppError(400, 'Bạn đã chấm công vào hôm nay rồi!')
  }

  let row: any
  if (existing.length > 0) {
    // Update bản ghi đã có (check_in bị null) → set check_in
    await prisma.$executeRawUnsafe(
      `UPDATE attendance SET check_in = $1::timestamptz, status = $2, note = $3, updated_at = NOW()
       WHERE user_id = $4 AND date = $5::date`,
      now.toISOString(), status, note ?? null, userId, today
    )
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance (user_id, date, check_in, status, note)
       VALUES ($1, $2::date, $3::timestamptz, $4, $5)`,
      userId, today, now.toISOString(), status, note ?? null
    )
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2::date`, userId, today
  )
  row = rows[0]

  res.json(successResponse(row, 'Chấm công vào thành công'))
})

// ── POST /attendance/check-out ─────────────────────────────────────────────────
export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId = req.user!.id
  const { note } = req.body ?? {}

  const now   = new Date()
  const today = toVietnamDateOnly(now)

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, check_in, check_out FROM attendance WHERE user_id = $1 AND date = $2::date`,
    userId, today
  )

  if (!existing.length || !existing[0].check_in) {
    throw new AppError(400, 'Bạn chưa chấm công vào hôm nay!')
  }
  if (existing[0].check_out) {
    throw new AppError(400, 'Bạn đã chấm công ra rồi!')
  }

  await prisma.$executeRawUnsafe(
    `UPDATE attendance SET check_out = $1::timestamptz, note = COALESCE($2, note), updated_at = NOW()
     WHERE user_id = $3 AND date = $4::date`,
    now.toISOString(), note ?? null, userId, today
  )

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2::date`, userId, today
  )

  res.json(successResponse(rows[0], 'Chấm công ra thành công'))
})

// ── GET /attendance/today — Trạng thái hôm nay của user hiện tại ─────────────
export const getTodayStatus = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId = req.user!.id
  const today  = toVietnamDateOnly(new Date())

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2::date`, userId, today
  )

  res.json(successResponse(rows[0] ?? null))
})

// ── GET /attendance/stats ─────────────────────────────────────────────────────
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const { month, year } = req.query as Record<string, string>

  const now = new Date()
  const y   = Number(year)  || now.getFullYear()
  const m   = Number(month) || now.getMonth() + 1

  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = toVietnamDateOnly(new Date(y, m, 0, 23, 59, 59))

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT u.id, u.full_name, u.role,
            COUNT(*) FILTER (WHERE a.status = 'present') AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'late')    AS late_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')  AS absent_count,
            COUNT(*) FILTER (WHERE a.status = 'leave')   AS leave_count,
            COUNT(*)                                      AS total_days
     FROM users u
     LEFT JOIN attendance a ON a.user_id = u.id AND a.date >= $1::date AND a.date <= $2::date
     WHERE u.role != 'admin' AND u.is_active = true
     GROUP BY u.id, u.full_name, u.role
     ORDER BY u.full_name`,
    from, to
  )

  res.json(successResponse(rows))
})
