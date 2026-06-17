// src/routes/businessTrips.ts
import { Router } from 'express'
import { authMiddleware, keToansAndAdmin, tripCreators, anyRole } from '../middleware/auth'
import {
  getAllowance, setAllowance,
  getMyTrips, getAllTrips, getTripById,
  createTrip, updateTrip, deleteTrip,
  approveTrip, rejectTrip,
} from '../controllers/businessTrips'

const router = Router()

router.use(authMiddleware)

// Mức trợ cấp
router.get ('/allowance',        anyRole,           getAllowance)
router.put ('/allowance',        keToansAndAdmin,   setAllowance)

// CRUD của chính nhân viên
router.get ('/my',               tripCreators,      getMyTrips)
router.post('/',                 tripCreators,      createTrip)

// Chi tiết (chủ sở hữu hoặc ke_toan/admin)
router.get ('/:id',              anyRole,           getTripById)
router.put ('/:id',              anyRole,           updateTrip)
router.delete('/:id',            anyRole,           deleteTrip)

// Quản lý (ke_toan + admin)
router.get ('/',                 keToansAndAdmin,   getAllTrips)
router.put ('/:id/approve',      keToansAndAdmin,   approveTrip)
router.put ('/:id/reject',       keToansAndAdmin,   rejectTrip)

export default router
