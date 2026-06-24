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
  getMyBalance,
  getAllBalances,
  setBalance,
  recalculateBalances,
} from '../controllers/leaveRequests'

const router = Router()

router.use(authMiddleware)

// Quỹ nghỉ phép năm — đặt TRƯỚC '/:id' để không bị nuốt route
router.get('/balances/my',      anyRole,          getMyBalance)
router.get('/balances',         keToansAndAdmin,  getAllBalances)
router.put('/balances/:userId', keToansAndAdmin,  setBalance)
router.put('/recalculate-balances', keToansAndAdmin, recalculateBalances)

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
