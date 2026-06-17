// ============================================================
// src/routes/attendance.ts — Chấm công
// ============================================================

import { Router } from 'express'
import {
  checkIn, checkOut, getTodayStatus,
  getMyHistory, getAll, updateRecord
} from '../controllers/attendance'
import { authMiddleware, adminOnly, checkRoles } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

// Nhân viên tự chấm
router.post('/checkin',  checkIn)
router.put('/checkout',  checkOut)
router.get('/today',     getTodayStatus)
router.get('/my',        getMyHistory)

// Kế toán / Admin xem tất cả + sửa
const accountingOrAdmin = checkRoles(['admin', 'accounting'])
router.get('/all',       accountingOrAdmin, getAll)
router.put('/:id',       accountingOrAdmin, updateRecord)

export default router
