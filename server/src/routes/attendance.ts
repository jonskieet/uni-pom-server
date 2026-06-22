// src/routes/attendance.ts
import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { anyRole, keToansAndAdmin } from '../middleware/auth'
import {
  getMyAttendance,
  getAllAttendance,
  checkIn,
  checkOut,
  getTodayStatus,
  getStats,
} from '../controllers/attendance'

const router = Router()

router.use(authMiddleware)

// Nhân viên (mọi role trừ admin)
router.get('/my',    anyRole,           getMyAttendance)
router.get('/today', anyRole,           getTodayStatus)
router.post('/check-in',  anyRole,      checkIn)
router.post('/check-out', anyRole,      checkOut)

// Kế toán + Admin
router.get('/',       keToansAndAdmin,  getAllAttendance)
router.get('/stats',  keToansAndAdmin,  getStats)

export default router
