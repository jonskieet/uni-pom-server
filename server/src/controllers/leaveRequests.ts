// ============================================================
// src/controllers/leaveRequests.ts — Xin nghỉ phép & duyệt nghỉ phép
// - Nhân viên: tạo / xem / sửa / hủy đơn của mình, xem quỹ phép còn lại
// - Kế toán / Admin: xem tất cả, duyệt / từ chối, cấu hình quỹ phép năm
//
// v2 — Số ngày nghỉ phép tính theo CẤU HÌNH NGÀY LÀM VIỆC TRONG TUẦN
//      (workWeek) thay vì hard-code loại Chủ nhật. Khi đơn được DUYỆT,
//      hệ thống tự trừ vào QUỸ NGHỈ PHÉP CÓ LƯƠNG của user trong năm đó
//      (leave_balances) — nếu vượt quỹ, phần vượt được ghi nhận là nghỉ
//      KHÔNG LƯƠNG (paid_days < total_days).
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { getWorkWeekConfig, dayWeight, workingHalf, WEEKDAY_LABEL } from '../utils/workWeek'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

const DAY_TYPES = ['full', 'half_morning', 'half_afternoon']
const DEFAULT_ANNUAL_LEAVE_DAYS = 12

function parseDateOnly(value: string): Date {
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) throw new AppError(400, 'Ngày không hợp lệ')
  return d
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tổng số ngày làm việc (đã áp trọng số nửa ngày) trong khoảng [start, end] */
function countWorkDays(start: Date, end: Date, cfg: Record<number, any>): number {
  let total = 0
  const cur = new Date(start)
  while (cur <= end) {
    total += dayWeight(cfg, cur.getDay())
    cur.setDate(cur.getDate() + 1)
  }
  return Math.round(total * 2) / 2 // chặn sai số float, giữ tối đa 1 chữ số thập phân .5
}

/** Liệt kê các ngày làm việc (trọng số > 0) trong khoảng [start, end] dạng 'YYYY-MM-DD' */
function listWorkDates(start: Date, end: Date, cfg: Record<number, any>): string[] {
  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    if (dayWeight(cfg, cur.getDay()) > 0) dates.push(ymd(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const DAY_TYPE_NOTE: Record<string, string> = {
  full: 'Nghỉ phép',
  half_morning: 'Nghỉ phép (nửa ngày sáng)',
  half_afternoon: 'Nghỉ phép (nửa ngày chiều)',
}

/** Đánh dấu status='leave' cho các ngày làm việc trong đơn đã duyệt */
async function applyLeaveToAttendance(userId: number, startDate: Date, endDate: Date, dayType: string, cfg: Record<number, any>, unpaidNote: string) {
  const dates = listWorkDates(startDate, endDate, cfg)
  const note = (DAY_TYPE_NOTE[dayType] ?? 'Nghỉ phép') + unpaidNote
  for (const date of dates) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO attendance (user_id, date, status, note)
       VALUES ($1, $2::date, 'leave', $3)
       ON CONFLICT (user_id, date) DO UPDATE
         SET status = 'leave', note = $3, updated_at = NOW()`,
      userId, date, note
    )
  }
}

/** Gỡ status='leave' khỏi các ngày của đơn (khi admin từ chối một đơn đã từng được duyệt) */
async function revertLeaveFromAttendance(userId: number, startDate: Date, endDate: Date, cfg: Record<number, any>) {
  const dates = listWorkDates(startDate, endDate, cfg)
  for (const date of dates) {
    await prisma.$executeRawUnsafe(
      `UPDATE attendance SET status = 'absent', note = NULL, updated_at = NOW()
       WHERE user_id = $1 AND date = $2::date AND status = 'leave' AND check_in IS NULL`,
      userId, date
    )
  }
}

/** Quỹ phép năm của 1 user: tổng được cấp, đã dùng (paid_days của đơn đã duyệt), còn lại */
async function getUserBalance(userId: number, year: number, excludeLeaveId?: number) {
  const balRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT total_days FROM leave_balances WHERE user_id = $1 AND year = $2`, userId, year
  )
  const total = balRows.length ? Number(balRows[0].total_days) : DEFAULT_ANNUAL_LEAVE_DAYS

  const usedRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COALESCE(SUM(paid_days), 0) AS used FROM leave_requests
     WHERE user_id = $1 AND status = 'approved' AND EXTRACT(YEAR FROM start_date) = $2` +
      (excludeLeaveId ? ` AND id != $3` : ''),
    ...(excludeLeaveId ? [userId, year, excludeLeaveId] : [userId, year])
  )
  const used = Number(usedRows[0]?.used ?? 0)
  return { total, used, remaining: Math.max(0, total - used) }
}

// ── POST /leave-requests — Tạo đơn xin nghỉ phép ─────────────────────────────
export const createLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { start_date, end_date, day_type = 'full', reason } = req.body ?? {}

  if (!start_date) throw new AppError(400, 'Thiếu ngày bắt đầu nghỉ')
  if (!DAY_TYPES.includes(day_type)) throw new AppError(400, 'Loại nghỉ không hợp lệ')

  const cfg = await getWorkWeekConfig(prisma)
  const isHalf = day_type !== 'full'
  const startDate = parseDateOnly(start_date)
  const endDate = isHalf ? startDate : parseDateOnly(end_date || start_date)

  if (endDate < startDate) throw new AppError(400, 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu')

  if (isHalf) {
    const half = workingHalf(cfg, startDate.getDay())
    const weight = dayWeight(cfg, startDate.getDay())
    if (weight <= 0) throw new AppError(400, `${WEEKDAY_LABEL[startDate.getDay()]} là ngày nghỉ, không thể xin nghỉ phép`)
    if (weight === 1) {
      // Ngày làm cả ngày → cả 2 buổi đều hợp lệ để xin nghỉ nửa buổi
    } else if (half && day_type !== `half_${half}`) {
      throw new AppError(400, `${WEEKDAY_LABEL[startDate.getDay()]} công ty chỉ làm buổi ${half === 'morning' ? 'sáng' : 'chiều'}, không thể xin nghỉ nửa buổi còn lại`)
    }
  }

  const total_days = isHalf ? 0.5 : countWorkDays(startDate, endDate, cfg)
  if (total_days <= 0) throw new AppError(400, 'Khoảng thời gian nghỉ không hợp lệ (toàn bộ rơi vào ngày nghỉ)')

  // Chặn trùng lịch với đơn đang chờ duyệt / đã duyệt khác của chính người này
  const overlap = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM leave_requests
     WHERE user_id = $1 AND status IN ('pending','approved')
       AND start_date <= $3::date AND end_date >= $2::date`,
    userId, start_date, end_date || start_date
  )
  if (overlap.length) throw new AppError(400, 'Đã có đơn nghỉ phép khác trùng khoảng thời gian này')

  await prisma.$executeRawUnsafe(
    `INSERT INTO leave_requests (user_id, start_date, end_date, day_type, total_days, reason)
     VALUES ($1, $2::date, $3::date, $4, $5, $6)`,
    userId, start_date, end_date || start_date, day_type, total_days, reason ?? null
  )

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, userId
  )

  res.status(201).json(successResponse(rows[0], 'Đã gửi đơn xin nghỉ phép'))
})

// ── GET /leave-requests/my ────────────────────────────────────────────────────
export const getMyLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { month, year, status } = req.query as Record<string, string>

  let where = `lr.user_id = $1`
  const params: any[] = [userId]
  let idx = 2

  if (month && year) {
    where += ` AND EXTRACT(MONTH FROM lr.start_date) = $${idx++} AND EXTRACT(YEAR FROM lr.start_date) = $${idx++}`
    params.push(Number(month), Number(year))
  }
  if (status) {
    where += ` AND lr.status = $${idx++}`
    params.push(status)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT lr.*, u.full_name, ab.full_name AS approved_by_name
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     LEFT JOIN users ab ON ab.id = lr.approved_by
     WHERE ${where}
     ORDER BY lr.start_date DESC, lr.id DESC`,
    ...params
  )

  res.json(successResponse(rows))
})

// ── GET /leave-requests (ke_toan + admin) ─────────────────────────────────────
export const getAllLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const { month, year, status, user_id } = req.query as Record<string, string>

  let where = `1=1`
  const params: any[] = []
  let idx = 1

  if (month && year) {
    where += ` AND EXTRACT(MONTH FROM lr.start_date) = $${idx++} AND EXTRACT(YEAR FROM lr.start_date) = $${idx++}`
    params.push(Number(month), Number(year))
  }
  if (status) {
    where += ` AND lr.status = $${idx++}`
    params.push(status)
  }
  if (user_id) {
    where += ` AND lr.user_id = $${idx++}`
    params.push(Number(user_id))
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT lr.*, u.full_name, u.username, u.role, u.avatar_url, ab.full_name AS approved_by_name
     FROM leave_requests lr
     JOIN users u ON u.id = lr.user_id
     LEFT JOIN users ab ON ab.id = lr.approved_by
     WHERE ${where}
     ORDER BY lr.status = 'pending' DESC, lr.start_date DESC, lr.id DESC`,
    ...params
  )

  res.json(successResponse(rows))
})

// ── PUT /leave-requests/:id — Sửa đơn (chỉ khi còn pending, chỉ chủ đơn) ─────
export const updateLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id
  const role = req.user!.role
  const { start_date, end_date, day_type = 'full', reason } = req.body ?? {}

  const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM leave_requests WHERE id = $1`, Number(id))
  if (!existing.length) throw new AppError(404, 'Không tìm thấy đơn xin nghỉ phép')
  if (existing[0].user_id !== userId && role !== 'admin') throw new AppError(403, 'Không có quyền sửa đơn này')
  if (existing[0].status !== 'pending') throw new AppError(400, 'Chỉ có thể sửa đơn đang chờ duyệt')

  if (!DAY_TYPES.includes(day_type)) throw new AppError(400, 'Loại nghỉ không hợp lệ')

  const cfg = await getWorkWeekConfig(prisma)
  const isHalf = day_type !== 'full'
  const startDate = parseDateOnly(start_date)
  const endDate = isHalf ? startDate : parseDateOnly(end_date || start_date)
  if (endDate < startDate) throw new AppError(400, 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu')

  const total_days = isHalf ? 0.5 : countWorkDays(startDate, endDate, cfg)
  if (total_days <= 0) throw new AppError(400, 'Khoảng thời gian nghỉ không hợp lệ')

  await prisma.$executeRawUnsafe(
    `UPDATE leave_requests
     SET start_date = $1::date, end_date = $2::date, day_type = $3, total_days = $4, reason = $5, updated_at = NOW()
     WHERE id = $6`,
    start_date, end_date || start_date, day_type, total_days, reason ?? null, Number(id)
  )

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM leave_requests WHERE id = $1`, Number(id))
  res.json(successResponse(rows[0], 'Đã cập nhật đơn xin nghỉ phép'))
})

// ── DELETE /leave-requests/:id — Hủy đơn (chỉ khi còn pending) ───────────────
export const cancelLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id
  const role = req.user!.role

  const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM leave_requests WHERE id = $1`, Number(id))
  if (!existing.length) throw new AppError(404, 'Không tìm thấy đơn xin nghỉ phép')
  if (existing[0].user_id !== userId && role !== 'admin') throw new AppError(403, 'Không có quyền hủy đơn này')
  if (existing[0].status === 'approved') throw new AppError(400, 'Đơn đã được duyệt, không thể hủy. Vui lòng liên hệ kế toán/admin')

  await prisma.$executeRawUnsafe(`UPDATE leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, Number(id))
  res.json(successResponse(null, 'Đã hủy đơn xin nghỉ phép'))
})

// ── PUT /leave-requests/:id/approve ──────────────────────────────────────────
export const approveLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const approverId = req.user!.id

  const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM leave_requests WHERE id = $1`, Number(id))
  if (!existing.length) throw new AppError(404, 'Không tìm thấy đơn xin nghỉ phép')
  const lr = existing[0]
  if (lr.status !== 'pending') throw new AppError(400, 'Đơn này đã được xử lý')

  const cfg = await getWorkWeekConfig(prisma)
  const startDate = new Date(lr.start_date)
  const year = startDate.getFullYear()
  const totalDays = Number(lr.total_days)

  // Trừ vào quỹ nghỉ phép có lương của user trong năm — phần vượt quỹ tính là không lương
  const balance = await getUserBalance(lr.user_id, year, Number(id))
  const paidDays = Math.max(0, Math.min(totalDays, balance.remaining))
  const unpaidDays = Math.round((totalDays - paidDays) * 2) / 2

  await prisma.$executeRawUnsafe(
    `UPDATE leave_requests SET status = 'approved', approved_by = $1, approved_at = NOW(), paid_days = $2, updated_at = NOW() WHERE id = $3`,
    approverId, paidDays, Number(id)
  )

  const unpaidNote = unpaidDays > 0 ? ` — ${unpaidDays} ngày không lương (vượt quỹ phép năm ${year})` : ''
  await applyLeaveToAttendance(lr.user_id, startDate, new Date(lr.end_date), lr.day_type, cfg, unpaidNote)

  res.json(successResponse(
    { paid_days: paidDays, unpaid_days: unpaidDays },
    unpaidDays > 0
      ? `Đã duyệt đơn. Lưu ý: ${unpaidDays} ngày vượt quỹ phép năm, tính là nghỉ không lương`
      : 'Đã duyệt đơn xin nghỉ phép'
  ))
})

// ── PUT /leave-requests/:id/reject ───────────────────────────────────────────
export const rejectLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { note } = req.body ?? {}

  const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM leave_requests WHERE id = $1`, Number(id))
  if (!existing.length) throw new AppError(404, 'Không tìm thấy đơn xin nghỉ phép')
  const lr = existing[0]
  if (lr.status === 'rejected') throw new AppError(400, 'Đơn này đã bị từ chối trước đó')

  const wasApproved = lr.status === 'approved'

  await prisma.$executeRawUnsafe(
    `UPDATE leave_requests SET status = 'rejected', reject_note = $1, paid_days = 0, updated_at = NOW() WHERE id = $2`,
    note ?? null, Number(id)
  )

  if (wasApproved) {
    const cfg = await getWorkWeekConfig(prisma)
    await revertLeaveFromAttendance(lr.user_id, new Date(lr.start_date), new Date(lr.end_date), cfg)
  }

  res.json(successResponse(null, 'Đã từ chối đơn xin nghỉ phép'))
})

// ── GET /leave-requests/balances/my?year=YYYY — Quỹ phép của chính tôi ─────
export const getMyBalance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const year = Number((req.query as any).year) || new Date().getFullYear()
  const balance = await getUserBalance(userId, year)
  res.json(successResponse({ year, ...balance }))
})

// ── GET /leave-requests/balances?year=YYYY — Quỹ phép toàn bộ user (ke_toan/admin) ─
export const getAllBalances = asyncHandler(async (req: Request, res: Response) => {
  const year = Number((req.query as any).year) || new Date().getFullYear()

  const users = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, full_name, role FROM users WHERE role != 'admin' AND is_active = true ORDER BY full_name`
  )

  const rows = await Promise.all(users.map(async (u: any) => {
    const balance = await getUserBalance(u.id, year)
    return { user_id: u.id, full_name: u.full_name, role: u.role, year, ...balance }
  }))

  res.json(successResponse(rows))
})

// ── PUT /leave-requests/balances/:userId — Cấu hình quỹ phép năm (ke_toan/admin) ─
export const setBalance = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params
  const { year, total_days } = req.body ?? {}

  const y = Number(year) || new Date().getFullYear()
  if (total_days === undefined || isNaN(Number(total_days)) || Number(total_days) < 0) {
    throw new AppError(400, 'Số ngày nghỉ phép có lương không hợp lệ')
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO leave_balances (user_id, year, total_days)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, year) DO UPDATE SET total_days = $3, updated_at = NOW()`,
    Number(userId), y, Number(total_days)
  )

  const balance = await getUserBalance(Number(userId), y)
  res.json(successResponse({ user_id: Number(userId), year: y, ...balance }, 'Đã cập nhật quỹ nghỉ phép năm'))
})

// ── PUT /leave-requests/recalculate-balances?year=YYYY — Tính lại paid_days
// cho TOÀN BỘ đơn đã duyệt trong năm (ke_toan/admin). Dùng để đồng bộ lại quỹ
// phép cho các đơn đã được duyệt TRƯỚC KHI tính năng quỹ phép có lương được
// thêm vào (paid_days của các đơn đó vẫn đang là 0 do chưa từng được tính) ──
export const recalculateBalances = asyncHandler(async (req: Request, res: Response) => {
  const year = Number((req.query as any).year) || new Date().getFullYear()

  const users = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT user_id FROM leave_requests WHERE status = 'approved' AND EXTRACT(YEAR FROM start_date) = $1`,
    year
  )

  for (const u of users) {
    const balRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT total_days FROM leave_balances WHERE user_id = $1 AND year = $2`, u.user_id, year
    )
    const quota = balRows.length ? Number(balRows[0].total_days) : DEFAULT_ANNUAL_LEAVE_DAYS

    // Duyệt theo thứ tự thời gian duyệt (đơn duyệt trước được ưu tiên trừ quỹ trước)
    const reqs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, total_days FROM leave_requests
       WHERE user_id = $1 AND status = 'approved' AND EXTRACT(YEAR FROM start_date) = $2
       ORDER BY approved_at ASC NULLS LAST, id ASC`,
      u.user_id, year
    )

    let used = 0
    for (const r of reqs) {
      const remaining = Math.max(0, quota - used)
      const paid = Math.max(0, Math.min(Number(r.total_days), remaining))
      used += paid
      await prisma.$executeRawUnsafe(`UPDATE leave_requests SET paid_days = $1 WHERE id = $2`, paid, r.id)
    }
  }

  res.json(successResponse(null, `Đã đồng bộ lại quỹ nghỉ phép năm ${year} cho ${users.length} người`))
})
