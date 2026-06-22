// ============================================================
// src/controllers/leaveRequests.ts — Xin nghỉ phép & duyệt nghỉ phép
// - Nhân viên: tạo / xem / sửa / hủy đơn của mình (khi còn pending)
// - Kế toán / Admin: xem tất cả, duyệt / từ chối
//
// Khi đơn được DUYỆT → tự động ghi đè bảng `attendance` cho từng ngày
// làm việc trong khoảng [start_date, end_date] (loại Chủ nhật) với
// status = 'leave', để khớp với phần tính "ngày vắng" ở module chấm công
// (ngày đã được duyệt nghỉ sẽ KHÔNG bị tính là vắng).
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

const DAY_TYPES = ['full', 'half_morning', 'half_afternoon']

function parseDateOnly(value: string): Date {
  const d = new Date(`${value}T00:00:00`)
  if (isNaN(d.getTime())) throw new AppError(400, 'Ngày không hợp lệ')
  return d
}

/** Đếm số ngày làm việc (loại Chủ nhật) trong khoảng [start, end] — dùng để tính total_days */
function countWorkDays(start: Date, end: Date): number {
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (cur.getDay() !== 0) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/** Liệt kê các ngày làm việc (loại Chủ nhật) trong khoảng [start, end] dạng 'YYYY-MM-DD' */
function listWorkDates(start: Date, end: Date): string[] {
  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    if (cur.getDay() !== 0) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      dates.push(`${y}-${m}-${d}`)
    }
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
async function applyLeaveToAttendance(userId: number, startDate: Date, endDate: Date, dayType: string) {
  const dates = listWorkDates(startDate, endDate)
  const note = DAY_TYPE_NOTE[dayType] ?? 'Nghỉ phép'
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
async function revertLeaveFromAttendance(userId: number, startDate: Date, endDate: Date) {
  const dates = listWorkDates(startDate, endDate)
  for (const date of dates) {
    await prisma.$executeRawUnsafe(
      `UPDATE attendance SET status = 'absent', note = NULL, updated_at = NOW()
       WHERE user_id = $1 AND date = $2::date AND status = 'leave' AND check_in IS NULL`,
      userId, date
    )
  }
}

// ── POST /leave-requests — Tạo đơn xin nghỉ phép ─────────────────────────────
export const createLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { start_date, end_date, day_type = 'full', reason } = req.body ?? {}

  if (!start_date) throw new AppError(400, 'Thiếu ngày bắt đầu nghỉ')
  if (!DAY_TYPES.includes(day_type)) throw new AppError(400, 'Loại nghỉ không hợp lệ')

  const isHalf = day_type !== 'full'
  const startDate = parseDateOnly(start_date)
  const endDate = isHalf ? startDate : parseDateOnly(end_date || start_date)

  if (endDate < startDate) throw new AppError(400, 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu')
  if (isHalf && startDate.getDay() === 0) throw new AppError(400, 'Không thể xin nghỉ nửa ngày vào Chủ nhật')

  const total_days = isHalf ? 0.5 : countWorkDays(startDate, endDate)
  if (total_days <= 0) throw new AppError(400, 'Khoảng thời gian nghỉ không hợp lệ (toàn bộ rơi vào Chủ nhật)')

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
  const isHalf = day_type !== 'full'
  const startDate = parseDateOnly(start_date)
  const endDate = isHalf ? startDate : parseDateOnly(end_date || start_date)
  if (endDate < startDate) throw new AppError(400, 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu')

  const total_days = isHalf ? 0.5 : countWorkDays(startDate, endDate)
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

  await prisma.$executeRawUnsafe(
    `UPDATE leave_requests SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
    approverId, Number(id)
  )

  await applyLeaveToAttendance(lr.user_id, new Date(lr.start_date), new Date(lr.end_date), lr.day_type)

  res.json(successResponse(null, 'Đã duyệt đơn xin nghỉ phép'))
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
    `UPDATE leave_requests SET status = 'rejected', reject_note = $1, updated_at = NOW() WHERE id = $2`,
    note ?? null, Number(id)
  )

  // Nếu đơn này trước đó đã được duyệt (đảo quyết định) → gỡ trạng thái 'leave' đã gán cho attendance
  if (wasApproved) {
    await revertLeaveFromAttendance(lr.user_id, new Date(lr.start_date), new Date(lr.end_date))
  }

  res.json(successResponse(null, 'Đã từ chối đơn xin nghỉ phép'))
})
