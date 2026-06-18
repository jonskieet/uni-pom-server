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

// ── Cấu hình giờ làm (lưu trong system_settings, key = 'attendance_work_hours') ──
const DEFAULT_WORK_HOURS = { work_start: '08:00', work_end: '17:30', late_threshold_minutes: 30 }

type WorkHoursConfig = { work_start: string; work_end: string; late_threshold_minutes: number }

function parseHHMM(value: string): { hour: number; minute: number } {
  const [h, m] = String(value).split(':').map(Number)
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 }
}

async function getWorkHoursConfig(): Promise<WorkHoursConfig> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT value FROM public.system_settings WHERE key = 'attendance_work_hours'`
  )
  if (!rows.length) return DEFAULT_WORK_HOURS
  try {
    const raw = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value
    return {
      work_start: raw.work_start ?? DEFAULT_WORK_HOURS.work_start,
      work_end: raw.work_end ?? DEFAULT_WORK_HOURS.work_end,
      late_threshold_minutes: Number(raw.late_threshold_minutes ?? DEFAULT_WORK_HOURS.late_threshold_minutes),
    }
  } catch {
    return DEFAULT_WORK_HOURS
  }
}

/** Phân loại đi trễ: giờ check-in > (giờ vào chuẩn + ngưỡng trễ) → late */
function computeStatus(checkIn: Date | null, cfg: WorkHoursConfig): string {
  if (!checkIn) return 'absent'
  const { hour, minute } = getVietnamHourMinute(checkIn)
  const start = parseHHMM(cfg.work_start)
  const limitMinutesTotal = start.hour * 60 + start.minute + Number(cfg.late_threshold_minutes || 0)
  const checkInMinutesTotal = hour * 60 + minute
  return checkInMinutesTotal > limitMinutesTotal ? 'late' : 'present'
}

// ── GET /attendance/work-hours — Cấu hình giờ làm hiện tại ───────────────────
export const getWorkHours = asyncHandler(async (_req: Request, res: Response) => {
  const cfg = await getWorkHoursConfig()
  res.json(successResponse(cfg))
})

// ── PUT /attendance/work-hours — Cập nhật cấu hình giờ làm (admin/kế toán) ───
export const setWorkHours = asyncHandler(async (req: Request, res: Response) => {
  const { work_start, work_end, late_threshold_minutes } = req.body ?? {}

  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!timePattern.test(work_start)) throw new AppError(400, 'Giờ vào làm không hợp lệ (định dạng HH:mm)')
  if (!timePattern.test(work_end)) throw new AppError(400, 'Giờ tan làm không hợp lệ (định dạng HH:mm)')

  const threshold = Number(late_threshold_minutes)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 180) {
    throw new AppError(400, 'Ngưỡng đi trễ phải là số phút từ 0 đến 180')
  }

  const cfg: WorkHoursConfig = { work_start, work_end, late_threshold_minutes: threshold }

  await prisma.$executeRawUnsafe(
    `INSERT INTO public.system_settings (key, value)
     VALUES ('attendance_work_hours', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    JSON.stringify(cfg)
  )

  res.json(successResponse(cfg, 'Cập nhật khung giờ làm việc thành công'))
})

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
  const cfg     = await getWorkHoursConfig()
  const status  = computeStatus(now, cfg)

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
            COUNT(*) FILTER (WHERE a.status = 'present')::int AS present_count,
            COUNT(*) FILTER (WHERE a.status = 'late')::int    AS late_count,
            COUNT(*) FILTER (WHERE a.status = 'absent')::int  AS absent_count,
            COUNT(*) FILTER (WHERE a.status = 'leave')::int   AS leave_count,
            COUNT(*)::int                                      AS total_days
     FROM users u
     LEFT JOIN attendance a ON a.user_id = u.id AND a.date >= $1::date AND a.date <= $2::date
     WHERE u.role != 'admin' AND u.is_active = true
     GROUP BY u.id, u.full_name, u.role
     ORDER BY u.full_name`,
    from, to
  )

  res.json(successResponse(rows))
})