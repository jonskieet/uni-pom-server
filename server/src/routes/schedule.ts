// ============================================================
// server/src/routes/schedule.ts — Lịch tuần routes
// Base path: /api/schedule (đăng ký trong app.ts)
// ============================================================

import { Router } from 'express'
import { authMiddleware, anyRole } from '../middleware/auth'
import {
  getScheduleEvents,
  createScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
} from '../controllers/schedule'

const router = Router()
router.use(authMiddleware)

// Mọi user đã đăng nhập đều được xem/tạo/sửa/xoá lịch
router.get('/',     anyRole, getScheduleEvents)
router.post('/',    anyRole, createScheduleEvent)
router.put('/:id',  anyRole, updateScheduleEvent)
router.delete('/:id', anyRole, deleteScheduleEvent)

export default router
