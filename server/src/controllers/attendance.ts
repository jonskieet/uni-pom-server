// ============================================================
// src/controllers/attendance.ts — Chấm công
// - Nhân viên: checkIn, checkOut, getMyAttendance
// - Kế toán / Admin: getAll, getStats
//
// v4 — BỎ tính năng "đi trễ" (work-hours config + late threshold).
//      THÊM tính năng "ngày vắng": so khớp các ngày làm việc đã qua
//      trong tháng (loại Chủ nhật) với dữ liệu chấm công + nghỉ phép
//      đã duyệt → ngày nào không có check-in và không được duyệt nghỉ
//      thì tính là "vắng" (absent), kể cả khi KHÔNG có dòng nào trong
//      bảng attendance cho ngày đó (trước đây hệ thống không có cơ chế
//      này, chỉ đếm status='absent' nhưng chưa từng có gì ghi status đó).
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

  // Ma trận ngày làm việc (loại Chủ nhật, không vượt quá hôm nay) GHÉP với
  // dữ liệu chấm công thật → ngày nào thiếu dữ liệu sẽ tự hiện ra là "absent".
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH work_days AS (
       SELECT d::date AS d
       FROM generate_series($2::date, $3::date, '1 day') d
       WHERE EXTRACT(DOW FROM d) != 0 AND d::date <= CURRENT_DATE
     )
     SELECT
       COALESCE(a.id, 0)                      AS id,
       $1::int                                 AS user_id,
       wd.d                                     AS date,
       a.check_in, a.check_out, a.note,
       COALESCE(a.status, 'absent')            AS status,
       u.full_name, u.username, u.role
     FROM work_days wd
     JOIN users u ON u.id = $1
     LEFT JOIN attendance a ON a.user_id = $1 AND a.date = wd.d
     ORDER BY wd.d DESC`,
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

  let userWhere = `u.role != 'admin' AND u.is_active = true`
  const params: any[] = [from, to]
  let idx = 3
  if (user_id) {
    userWhere += ` AND u.id = $${idx++}`
    params.push(Number(user_id))
  }

  // Ma trận (user × ngày làm việc đã qua trong tháng, loại Chủ nhật) ghép với
  // dữ liệu chấm công thật. Những ô trống (không check-in, không nghỉ phép)
  // sẽ tự hiện ra với status='absent' dù KHÔNG có dòng nào trong bảng attendance.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH work_days AS (
       SELECT d::date AS d
       FROM generate_series($1::date, $2::date, '1 day') d
       WHERE EXTRACT(DOW FROM d) != 0 AND d::date <= CURRENT_DATE
     ),
     target_users AS (
       SELECT u.id, u.full_name, u.username, u.role, u.avatar_url
       FROM users u WHERE ${userWhere}
     ),
     matrix AS (
       SELECT tu.id AS user_id, tu.full_name, tu.username, tu.role, tu.avatar_url, wd.d
       FROM target_users tu CROSS JOIN work_days wd
     )
     SELECT
       COALESCE(a.id, 0)                AS id,
       m.user_id, m.full_name, m.username, m.role, m.avatar_url,
       m.d                               AS date,
       a.check_in, a.check_out, a.note,
       COALESCE(a.status, 'absent')      AS status
     FROM matrix m
     LEFT JOIN attendance a ON a.user_id = m.user_id AND a.date = m.d
     ORDER BY m.d DESC, m.full_name ASC`,
    ...params
  )

  const filtered = status ? rows.filter(r => r.status === status) : rows

  res.json(successResponse(filtered))
})

// ── POST /attendance/check-in ─────────────────────────────────────────────────
export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId  = req.user!.id
  const { note } = req.body ?? {}

  const now     = new Date()
  const today   = toVietnamDateOnly(now)

  // Upsert: nếu đã chấm công hôm nay thì không cho check-in lại
  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, check_in, status FROM attendance WHERE user_id = $1 AND date = $2::date`,
    userId, today
  )

  if (existing.length > 0 && existing[0].check_in) {
    throw new AppError(400, 'Bạn đã chấm công vào hôm nay rồi!')
  }
  if (existing.length > 0 && existing[0].status === 'leave') {
    throw new AppError(400, 'Hôm nay bạn đã được duyệt nghỉ phép, không thể chấm công')
  }

  if (existing.length > 0) {
    // Update bản ghi đã có (check_in bị null) → set check_in
    await prisma.$executeRawUnsafe(
      `UPDATE attendance SET check_in = $1::timestamptz, status = 'present', note = $2, updated_at = NOW()
       WHERE user_id = $3 AND date = $4::date`,
      now.toISOString(), note ?? null, userId, today
    )
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance (user_id, date, check_in, status, note)
       VALUES ($1, $2::date, $3::timestamptz, 'present', $4)`,
      userId, today, now.toISOString(), note ?? null
    )
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM attendance WHERE user_id = $1 AND date = $2::date`, userId, today
  )

  res.json(successResponse(rows[0], 'Chấm công vào thành công'))
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

// ── GET /attendance/stats — Tổng hợp present/leave/absent theo từng người ───
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const { month, year } = req.query as Record<string, string>

  const now = new Date()
  const y   = Number(year)  || now.getFullYear()
  const m   = Number(month) || now.getMonth() + 1

  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = toVietnamDateOnly(new Date(y, m, 0, 23, 59, 59))

  // total_days = số ngày làm việc đã qua trong tháng (loại Chủ nhật, không
  // vượt hôm nay) — đây là mẫu số để tính vắng, KHÔNG còn liên quan đi trễ.
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH work_days AS (
       SELECT d::date AS d
       FROM generate_series($1::date, $2::date, '1 day') d
       WHERE EXTRACT(DOW FROM d) != 0 AND d::date <= CURRENT_DATE
     ),
     matrix AS (
       SELECT u.id, u.full_name, u.role, wd.d
       FROM users u CROSS JOIN work_days wd
       WHERE u.role != 'admin' AND u.is_active = true
     )
     SELECT
       mx.id, mx.full_name, mx.role,
       COUNT(*) FILTER (WHERE a.check_in IS NOT NULL)::int                                 AS present_count,
       COUNT(*) FILTER (WHERE a.status = 'leave')::int                                     AS leave_count,
       COUNT(*) FILTER (WHERE a.check_in IS NULL AND COALESCE(a.status,'') != 'leave')::int AS absent_count,
       COUNT(*)::int                                                                        AS total_days
     FROM matrix mx
     LEFT JOIN attendance a ON a.user_id = mx.id AND a.date = mx.d
     GROUP BY mx.id, mx.full_name, mx.role
     ORDER BY mx.full_name`,
    from, to
  )

  res.json(successResponse(rows))
})
