// src/routes/attendance.ts
import { Router } from 'express'
import { authMiddleware, anyRole, keToansAndAdmin } from '../middleware/auth'
import {
  getMyAttendance,
  getAllAttendance,
  checkIn,
  checkOut,
  getTodayStatus,
  getStats,
  getWorkWeek,
  setWorkWeek,
  getWorkHours,
  setWorkHours,
} from '../controllers/attendance'

const router = Router()

router.use(authMiddleware)

// Nhân viên (mọi role trừ admin)
router.get('/my',    anyRole,           getMyAttendance)
router.get('/today', anyRole,           getTodayStatus)
router.post('/check-in',  anyRole,      checkIn)
router.post('/check-out', anyRole,      checkOut)
router.get('/work-week',  anyRole,      getWorkWeek)   // xem để hiển thị ngày nghỉ trong lịch chọn ngày
router.get('/work-hours', anyRole,      getWorkHours)  // xem khung giờ làm việc chuẩn (chỉ thông tin)

// Kế toán + Admin
router.get('/',       keToansAndAdmin,  getAllAttendance)
router.get('/stats',  keToansAndAdmin,  getStats)
router.put('/work-week',  keToansAndAdmin, setWorkWeek)
router.put('/work-hours', keToansAndAdmin, setWorkHours)

export default router
