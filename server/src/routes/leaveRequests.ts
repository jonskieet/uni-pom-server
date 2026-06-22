// src/routes/leaveRequests.ts
import { Router } from 'express'
import { authMiddleware, anyRole, keToansAndAdmin } from '../middleware/auth'
import {
  createLeaveRequest,
  getMyLeaveRequests,
  getAllLeaveRequests,
  updateLeaveRequest,
  cancelLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../controllers/leaveRequests'

const router = Router()

router.use(authMiddleware)

// Nhân viên: tạo / xem / sửa / hủy đơn của mình
router.get('/my',        anyRole,          getMyLeaveRequests)
router.post('/',         anyRole,          createLeaveRequest)
router.put('/:id',       anyRole,          updateLeaveRequest)
router.delete('/:id',    anyRole,          cancelLeaveRequest)

// Kế toán + Admin: xem tất cả & duyệt
router.get('/',                keToansAndAdmin, getAllLeaveRequests)
router.put('/:id/approve',     keToansAndAdmin, approveLeaveRequest)
router.put('/:id/reject',      keToansAndAdmin, rejectLeaveRequest)

export default router
