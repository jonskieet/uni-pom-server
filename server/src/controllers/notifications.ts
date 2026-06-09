// ============================================================
// src/controllers/notifications.ts — Hệ thống thông báo nội bộ
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── Kiểu thông báo
export type NotifType =
  | 'submitted'        // KT nộp BOM → TP KT
  | 'tp_approved'      // TP KT duyệt → Sale Admin
  | 'tp_returned'      // TP KT trả về → KT
  | 'pricing_done'     // Sale Admin định giá xong → Sale
  | 'sent_to_client'   // Sale gửi KH → (log)
  | 'client_feedback'  // KH phản hồi → Sale Admin + KT (nếu cần)
  | 'return_to_price'  // Sale yêu cầu Sale Admin sửa giá
  | 'return_to_tech'   // Sale yêu cầu KT sửa phương án
  | 'closed_won'       // Chốt thành công → tất cả liên quan
  | 'closed_lost'      // Không chốt → tất cả liên quan
  | 'tp_reapproved'    // TP duyệt lại

// ── Helper tạo notification hàng loạt
export async function createNotifications(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  notifications: Array<{
    user_id: number
    pom_id: number
    type: string
    title: string
    message: string
  }>
) {
  if (!notifications.length) return
  await tx.notification.createMany({ data: notifications })
}

// ── GET /notifications — Lấy thông báo của user hiện tại
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const unreadOnly = req.query.unread === 'true'
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20)

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        user_id: userId,
        ...(unreadOnly && { is_read: false }),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { user_id: userId, is_read: false },
    }),
  ])

  res.json(successResponse({ notifications, unreadCount }))
})

// ── PUT /notifications/:id/read — Đánh dấu đã đọc
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const notifId = parseInt(req.params.id)

  const notif = await prisma.notification.findFirst({
    where: { id: notifId, user_id: userId },
  })
  if (!notif) throw new AppError(404, 'Thông báo không tồn tại')

  await prisma.notification.update({
    where: { id: notifId },
    data: { is_read: true },
  })

  res.json(successResponse(null, 'Đã đánh dấu đã đọc'))
})

// ── PUT /notifications/read-all — Đánh dấu tất cả đã đọc
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id

  await prisma.notification.updateMany({
    where: { user_id: userId, is_read: false },
    data: { is_read: true },
  })

  res.json(successResponse(null, 'Đã đánh dấu tất cả đã đọc'))
})

// ── GET /notifications/unread-count — Chỉ lấy số chưa đọc (polling nhanh)
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const count = await prisma.notification.count({
    where: { user_id: userId, is_read: false },
  })
  res.json(successResponse({ count }))
})

// ── DELETE /notifications/:id — Xóa một thông báo
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const notifId = parseInt(req.params.id)

  await prisma.notification.deleteMany({
    where: { id: notifId, user_id: userId },
  })

  res.json(successResponse(null, 'Đã xóa thông báo'))
})