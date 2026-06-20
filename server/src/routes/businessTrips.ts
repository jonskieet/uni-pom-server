// src/routes/businessTrips.ts
import { Router } from 'express'
import { authMiddleware, keToansAndAdmin, tripCreators, anyRole } from '../middleware/auth'
import {
  getAllowance, setAllowance,
  getMyTrips, getAllTrips, getTripById,
  createTrip, updateTrip, deleteTrip,
  approveTrip, rejectTrip, markTripPaid,
} from '../controllers/businessTrips'

const router = Router()

router.use(authMiddleware)

// Mức trợ cấp
router.get ('/allowance',        anyRole,           getAllowance)
router.put ('/allowance',        keToansAndAdmin,   setAllowance)

// CRUD của chính nhân viên
router.get ('/my',               tripCreators,      getMyTrips)
router.post('/',                 tripCreators,      createTrip)

// Quản lý (ke_toan + admin)
// Đặt route danh sách trước /:id để /business-trips?month=... không bị route động nuốt.
router.get ('/',                 keToansAndAdmin,   getAllTrips)

// Chi tiết (chủ sở hữu hoặc ke_toan/admin)
router.get ('/:id',              anyRole,           getTripById)
router.put ('/:id',              anyRole,           updateTrip)
router.delete('/:id',            anyRole,           deleteTrip)

router.put ('/:id/approve',      keToansAndAdmin,   approveTrip)
router.put ('/:id/reject',       keToansAndAdmin,   rejectTrip)
router.put ('/:id/mark-paid',    keToansAndAdmin,   markTripPaid)

export default router
