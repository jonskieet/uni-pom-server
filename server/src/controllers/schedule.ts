// ============================================================
// src/controllers/schedule.ts — Weekly Schedule controller
// Dùng $queryRawUnsafe / $executeRawUnsafe để hoạt động ngay
// mà không cần regenerate Prisma client trên server
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── GET /schedule?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD ──
export const getScheduleEvents = asyncHandler(async (req: Request, res: Response) => {
  const { week_start, week_end } = req.query

  if (!week_start || !week_end) {
    throw new AppError(400, 'week_start và week_end là bắt buộc (YYYY-MM-DD)')
  }

  const events = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       e.id, e.title, e.description,
       TO_CHAR(e.date, 'YYYY-MM-DD') AS date,
       e.start_time, e.end_time,
       e.category, e.priority, e.location,
       e.created_by, e.created_at, e.updated_at,
       COALESCE(
         (SELECT json_agg(eu.user_id)
          FROM schedule_event_users eu
          WHERE eu.event_id = e.id),
         '[]'
       ) AS assigned_users
     FROM schedule_events e
     WHERE e.date >= $1::date
       AND e.date <= $2::date
     ORDER BY e.date ASC, e.start_time ASC NULLS LAST`,
    week_start as string,
    week_end as string
  )

  res.json(successResponse(events))
})

// ── POST /schedule ────────────────────────────────────────────
export const createScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user
  const { title, description, date, start_time, end_time, category, priority, location, assigned_users } = req.body

  if (!title?.trim()) throw new AppError(400, 'title là bắt buộc')
  if (!date)          throw new AppError(400, 'date là bắt buộc (YYYY-MM-DD)')

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO schedule_events
       (title, description, date, start_time, end_time, category, priority, location, created_by)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
     RETURNING id, title, description,
       TO_CHAR(date, 'YYYY-MM-DD') AS date,
       start_time, end_time, category, priority, location,
       created_by, created_at, updated_at`,
    title.trim(),
    description?.trim() || null,
    date,
    start_time || null,
    end_time   || null,
    category   || 'other',
    priority   || 'medium',
    location?.trim() || null,
    user.id
  )

  const event = rows[0]

  // Assign users nếu có
  if (Array.isArray(assigned_users) && assigned_users.length > 0) {
    for (const uid of assigned_users) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO schedule_event_users (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        event.id, uid
      )
    }
  }

  res.status(201).json(successResponse({ ...event, assigned_users: assigned_users ?? [] }))
})

// ── PUT /schedule/:id ─────────────────────────────────────────
export const updateScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, created_by FROM schedule_events WHERE id = $1`, id
  )
  if (!existing.length) throw new AppError(404, 'Không tìm thấy sự kiện')
  if (existing[0].created_by !== user.id && user.role !== 'admin') {
    throw new AppError(403, 'Bạn không có quyền sửa sự kiện này')
  }

  const { title, description, date, start_time, end_time, category, priority, location, assigned_users } = req.body

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE schedule_events SET
       title       = COALESCE($1, title),
       description = COALESCE($2, description),
       date        = COALESCE($3::date, date),
       start_time  = COALESCE($4, start_time),
       end_time    = COALESCE($5, end_time),
       category    = COALESCE($6, category),
       priority    = COALESCE($7, priority),
       location    = COALESCE($8, location),
       updated_at  = NOW()
     WHERE id = $9
     RETURNING id, title, description,
       TO_CHAR(date, 'YYYY-MM-DD') AS date,
       start_time, end_time, category, priority, location,
       created_by, created_at, updated_at`,
    title?.trim()        || null,
    description?.trim()  || null,
    date                 || null,
    start_time           || null,
    end_time             || null,
    category             || null,
    priority             || null,
    location?.trim()     || null,
    id
  )

  // Re-sync assigned users nếu có gửi lên
  if (Array.isArray(assigned_users)) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM schedule_event_users WHERE event_id = $1`, id
    )
    for (const uid of assigned_users) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO schedule_event_users (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        id, uid
      )
    }
  }

  res.json(successResponse(rows[0]))
})

// ── DELETE /schedule/:id ──────────────────────────────────────
export const deleteScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, created_by FROM schedule_events WHERE id = $1`, id
  )
  if (!existing.length) throw new AppError(404, 'Không tìm thấy sự kiện')
  if (existing[0].created_by !== user.id && user.role !== 'admin') {
    throw new AppError(403, 'Bạn không có quyền xoá sự kiện này')
  }

  // Cascade: schedule_event_users tự xoá nhờ ON DELETE CASCADE
  await prisma.$executeRawUnsafe(
    `DELETE FROM schedule_events WHERE id = $1`, id
  )

  res.json(successResponse({ deleted: true, id }))
})
