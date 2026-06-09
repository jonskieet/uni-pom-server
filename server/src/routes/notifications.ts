// ============================================================
// src/routes/notifications.ts
// ============================================================

import { Router } from 'express'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../controllers/notifications'
import { authMiddleware, anyRole } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

router.get('/',           anyRole, getNotifications)
router.get('/unread-count', anyRole, getUnreadCount)
router.put('/read-all',   anyRole, markAllAsRead)
router.put('/:id/read',   anyRole, markAsRead)
router.delete('/:id',     anyRole, deleteNotification)

export default router