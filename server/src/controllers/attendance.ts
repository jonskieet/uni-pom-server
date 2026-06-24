// ============================================================
// src/controllers/attendance.ts — Chấm công
// - Nhân viên: checkIn, checkOut, getMyAttendance
// - Kế toán / Admin: getAll, getStats, getWorkWeek, setWorkWeek
//
// v5 — Tính "ngày làm việc" / "ngày vắng" dựa trên cấu hình NGÀY LÀM VIỆC
//      TRONG TUẦN (thay cho khung giờ làm + đi trễ đã bị loại bỏ ở v4).
//      Ví dụ cấu hình: Thứ 2 → Thứ 6 làm cả ngày, Thứ 7 chỉ làm buổi sáng
//      (trọng số 0.5 ngày), Chủ nhật nghỉ (trọng số 0).
//      Toàn bộ phép tính ngày làm/vắng được dựng ở phía JS (duyệt từng
//      ngày trong tháng + áp trọng số) rồi mới ghép với dữ liệu chấm công
//      thật trong DB — tránh phải viết SQL động phức tạp theo cấu hình.
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { getWorkWeekConfig, invalidateWorkWeekCache, dayWeight, DAY_MODE_LABEL, WEEKDAY_LABEL, DayMode } from '../utils/workWeek'

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
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Danh sách các ngày làm việc (trọng số > 0) từ from đến to (cả 2 đầu), không vượt quá hôm nay */
function buildWorkDays(from: string, to: string, cfg: Record<number, DayMode>): { date: string; weight: number }[] {
  const today = toVietnamDateOnly(new Date())
  const out: { date: string; weight: number }[] = []
  const cur = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cur <= end) {
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dateStr > today) break
    const w = dayWeight(cfg, cur.getDay())
    if (w > 0) out.push({ date: dateStr, weight: w })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function monthRange(month?: string, year?: string) {
  const now = new Date()
  const y = Number(year) || now.getFullYear()
  const m = Number(month) || now.getMonth() + 1
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to = toVietnamDateOnly(new Date(y, m, 0, 23, 59, 59))
  return { from, to }
}

// ── GET /attendance/work-hours — Khung giờ làm việc chuẩn (chỉ mang tính
// thông tin/hiển thị, KHÔNG dùng để tính đi trễ — tính năng đó đã bị loại bỏ) ─
export const getWorkHours = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT value FROM public.system_settings WHERE key = 'attendance_work_hours'`
  )
  const value = rows[0]?.value ?? {}
  res.json(successResponse({
    work_start: value.work_start ?? '08:00',
    work_end: value.work_end ?? '17:30',
  }))
})

// ── PUT /attendance/work-hours — Cập nhật khung giờ làm việc (ke_toan + admin) ─
export const setWorkHours = asyncHandler(async (req: Request, res: Response) => {
  const { work_start, work_end } = req.body ?? {}
  const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!timeRe.test(work_start) || !timeRe.test(work_end)) {
    throw new AppError(400, 'Giờ làm việc không hợp lệ (định dạng HH:mm)')
  }
  if (work_end <= work_start) throw new AppError(400, 'Giờ ra phải sau giờ vào')

  const value = { work_start, work_end }
  await prisma.$executeRawUnsafe(
    `INSERT INTO public.system_settings (key, value)
     VALUES ('attendance_work_hours', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    JSON.stringify(value)
  )

  res.json(successResponse(value, 'Đã cập nhật khung giờ làm việc'))
})

// ── GET /attendance/work-week — Cấu hình ngày làm việc trong tuần ───────────
export const getWorkWeek = asyncHandler(async (_req: Request, res: Response) => {
  const cfg = await getWorkWeekConfig(prisma)
  const days = Object.keys(WEEKDAY_LABEL).map(k => ({
    dow: Number(k), label: WEEKDAY_LABEL[Number(k)], mode: cfg[Number(k)], mode_label: DAY_MODE_LABEL[cfg[Number(k)]],
  }))
  res.json(successResponse({ config: cfg, days }))
})

// ── PUT /attendance/work-week — Cập nhật cấu hình (ke_toan + admin) ─────────
export const setWorkWeek = asyncHandler(async (req: Request, res: Response) => {
  const { config } = req.body ?? {}
  if (!config || typeof config !== 'object') throw new AppError(400, 'Thiếu cấu hình ngày làm việc')

  const valid: DayMode[] = ['off', 'full', 'half_morning', 'half_afternoon']
  const clean: Record<string, DayMode> = {}
  for (let dow = 0; dow <= 6; dow++) {
    const mode = config[dow] ?? config[String(dow)]
    if (!valid.includes(mode)) throw new AppError(400, `Cấu hình ngày ${WEEKDAY_LABEL[dow]} không hợp lệ`)
    clean[String(dow)] = mode
  }
  if (Object.values(clean).every(m => m === 'off')) throw new AppError(400, 'Phải có ít nhất 1 ngày làm việc trong tuần')

  await prisma.$executeRawUnsafe(
    `INSERT INTO public.system_settings (key, value)
     VALUES ('attendance_work_week', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    JSON.stringify(clean)
  )
  invalidateWorkWeekCache()

  res.json(successResponse({ config: clean }, 'Đã cập nhật cấu hình ngày làm việc trong tuần'))
})

// ── GET /attendance/my ───────────────────────────────────────────────────────
export const getMyAttendance = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId = req.user!.id
  const { month, year } = req.query as Record<string, string>
  const { from, to } = monthRange(month, year)

  const [cfg, attRows, userRows] = await Promise.all([
    getWorkWeekConfig(prisma),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM attendance WHERE user_id = $1 AND date >= $2::date AND date <= $3::date`,
      userId, from, to
    ),
    prisma.$queryRawUnsafe<any[]>(`SELECT id, full_name, username, role FROM users WHERE id = $1`, userId),
  ])

  const user = userRows[0]
  const attByDate = new Map(attRows.map((a: any) => [toVietnamDateOnly(new Date(a.date)), a]))
  const workDays = buildWorkDays(from, to, cfg)

  const rows = workDays.map(({ date, weight }) => {
    const a = attByDate.get(date)
    const status = a?.check_in ? 'present' : a?.status === 'leave' ? 'leave' : 'absent'
    return {
      id: a?.id ?? 0, user_id: userId, date, weight,
      check_in: a?.check_in ?? null, check_out: a?.check_out ?? null, note: a?.note ?? null, status,
      full_name: user?.full_name, username: user?.username, role: user?.role,
    }
  }).sort((a, b) => (a.date < b.date ? 1 : -1))

  res.json(successResponse(rows))
})

// ── GET /attendance (ke_toan + admin) ────────────────────────────────────────
export const getAllAttendance = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const { month, year, user_id, status } = req.query as Record<string, string>
  const { from, to } = monthRange(month, year)

  let userWhere = `role != 'admin' AND is_active = true`
  const userParams: any[] = []
  if (user_id) { userWhere += ` AND id = $1`; userParams.push(Number(user_id)) }

  const [cfg, users, attRows] = await Promise.all([
    getWorkWeekConfig(prisma),
    prisma.$queryRawUnsafe<any[]>(`SELECT id, full_name, username, role, avatar_url FROM users WHERE ${userWhere} ORDER BY full_name`, ...userParams),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM attendance WHERE date >= $1::date AND date <= $2::date` + (user_id ? ` AND user_id = $3` : ''),
      ...(user_id ? [from, to, Number(user_id)] : [from, to])
    ),
  ])

  const attByUserDate = new Map<string, any>()
  attRows.forEach((a: any) => attByUserDate.set(`${a.user_id}|${toVietnamDateOnly(new Date(a.date))}`, a))

  const workDays = buildWorkDays(from, to, cfg)

  const rows: any[] = []
  users.forEach((u: any) => {
    workDays.forEach(({ date, weight }) => {
      const a = attByUserDate.get(`${u.id}|${date}`)
      const rowStatus = a?.check_in ? 'present' : a?.status === 'leave' ? 'leave' : 'absent'
      if (status && status !== rowStatus) return
      rows.push({
        id: a?.id ?? 0, user_id: u.id, full_name: u.full_name, username: u.username, role: u.role, avatar_url: u.avatar_url,
        date, weight, check_in: a?.check_in ?? null, check_out: a?.check_out ?? null, note: a?.note ?? null, status: rowStatus,
      })
    })
  })
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.full_name.localeCompare(b.full_name)))

  res.json(successResponse(rows))
})

// ── POST /attendance/check-in ─────────────────────────────────────────────────
export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  await ensureAttendanceSchema()
  const userId  = req.user!.id
  const { note } = req.body ?? {}

  const now     = new Date()
  const today   = toVietnamDateOnly(now)

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
  const { from, to } = monthRange(month, year)

  const [cfg, users, attRows] = await Promise.all([
    getWorkWeekConfig(prisma),
    prisma.$queryRawUnsafe<any[]>(`SELECT id, full_name, role FROM users WHERE role != 'admin' AND is_active = true ORDER BY full_name`),
    prisma.$queryRawUnsafe<any[]>(`SELECT user_id, date, check_in, status FROM attendance WHERE date >= $1::date AND date <= $2::date`, from, to),
  ])

  const attByUserDate = new Map<string, any>()
  attRows.forEach((a: any) => attByUserDate.set(`${a.user_id}|${toVietnamDateOnly(new Date(a.date))}`, a))

  const workDays = buildWorkDays(from, to, cfg)

  const rows = users.map((u: any) => {
    let present = 0, leave = 0, absent = 0, total = 0
    workDays.forEach(({ date, weight }) => {
      const a = attByUserDate.get(`${u.id}|${date}`)
      total += weight
      if (a?.check_in) present += weight
      else if (a?.status === 'leave') leave += weight
      else absent += weight
    })
    return {
      id: u.id, full_name: u.full_name, role: u.role,
      present_count: present, leave_count: leave, absent_count: absent, total_days: total,
    }
  })

  res.json(successResponse(rows))
})
