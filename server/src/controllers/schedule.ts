// ============================================================
// src/controllers/schedule.ts — Weekly Schedule controller
// Module Lịch tuần — thay thế bảng trắng thủ công
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

// ── Prisma singleton ─────────────────────────────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

/**
 * GET /schedule?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
 * Lấy tất cả sự kiện trong một khoảng ngày (1 tuần)
 */
export const getScheduleEvents = asyncHandler(async (req: Request, res: Response) => {
  const { week_start, week_end } = req.query

  if (!week_start || !week_end) {
    throw new AppError(400, 'week_start và week_end là bắt buộc (YYYY-MM-DD)')
  }

  const events = await (prisma as any).scheduleEvent.findMany({
    where: {
      date: {
        gte: new Date(week_start as string),
        lte: new Date(week_end as string),
      },
    },
    include: {
      creator: { select: { id: true, full_name: true, avatar_url: true } },
      assignedUsers: {
        include: {
          user: { select: { id: true, full_name: true, avatar_url: true } }
        }
      },
    },
    orderBy: [
      { date: 'asc' },
      { start_time: 'asc' },
    ],
  })

  // Flatten assignedUsers → assigned_users: number[]
  const result = events.map((e: any) => ({
    ...e,
    date: e.date.toISOString().slice(0, 10),
    start_time: e.start_time ?? undefined,
    end_time:   e.end_time   ?? undefined,
    assigned_users: e.assignedUsers?.map((au: any) => au.user_id) ?? [],
    assignedUsers: undefined,
  }))

  res.json(successResponse(result))
})

/**
 * POST /schedule — Tạo sự kiện mới
 */
export const createScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user
  const {
    title, description, date, start_time, end_time,
    category, priority, location, assigned_users,
  } = req.body

  if (!title?.trim()) throw new AppError(400, 'title là bắt buộc')
  if (!date)          throw new AppError(400, 'date là bắt buộc (YYYY-MM-DD)')

  const event = await (prisma as any).scheduleEvent.create({
    data: {
      title:       title.trim(),
      description: description?.trim() || null,
      date:        new Date(date),
      start_time:  start_time || null,
      end_time:    end_time   || null,
      category:    category   || 'other',
      priority:    priority   || 'medium',
      location:    location?.trim() || null,
      created_by:  user.id,
      // Many-to-many với users
      ...(Array.isArray(assigned_users) && assigned_users.length > 0 ? {
        assignedUsers: {
          create: assigned_users.map((uid: number) => ({ user_id: uid })),
        }
      } : {}),
    },
  })

  res.status(201).json(successResponse({
    ...event,
    date: event.date.toISOString().slice(0, 10),
  }))
})

/**
 * PUT /schedule/:id — Cập nhật sự kiện
 */
export const updateScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await (prisma as any).scheduleEvent.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Không tìm thấy sự kiện')

  // Chỉ người tạo hoặc admin mới được sửa
  if (existing.created_by !== user.id && user.role !== 'admin') {
    throw new AppError(403, 'Bạn không có quyền sửa sự kiện này')
  }

  const {
    title, description, date, start_time, end_time,
    category, priority, location, assigned_users,
  } = req.body

  const updated = await (prisma as any).scheduleEvent.update({
    where: { id },
    data: {
      ...(title       !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(date        !== undefined && { date: new Date(date) }),
      ...(start_time  !== undefined && { start_time: start_time || null }),
      ...(end_time    !== undefined && { end_time:   end_time   || null }),
      ...(category    !== undefined && { category }),
      ...(priority    !== undefined && { priority }),
      ...(location    !== undefined && { location: location?.trim() || null }),
    },
  })

  // Re-sync assigned users nếu có gửi lên
  if (Array.isArray(assigned_users)) {
    await (prisma as any).scheduleEventUser.deleteMany({ where: { event_id: id } })
    if (assigned_users.length > 0) {
      await (prisma as any).scheduleEventUser.createMany({
        data: assigned_users.map((uid: number) => ({ event_id: id, user_id: uid })),
        skipDuplicates: true,
      })
    }
  }

  res.json(successResponse({
    ...updated,
    date: updated.date.toISOString().slice(0, 10),
  }))
})

/**
 * DELETE /schedule/:id — Xoá sự kiện
 */
export const deleteScheduleEvent = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const user = (req as any).user

  const existing = await (prisma as any).scheduleEvent.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Không tìm thấy sự kiện')

  if (existing.created_by !== user.id && user.role !== 'admin') {
    throw new AppError(403, 'Bạn không có quyền xoá sự kiện này')
  }

  // assignedUsers cascade xoá nhờ ON DELETE CASCADE trong DB
  await (prisma as any).scheduleEvent.delete({ where: { id } })

  res.json(successResponse({ deleted: true, id }))
})
