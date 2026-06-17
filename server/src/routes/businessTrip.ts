// ============================================================
// src/routes/businessTrip.ts — Chi phí công tác
// ============================================================

import { Router } from 'express'
import {
  createTrip, getTrips, getTripById,
  updateTrip, submitTrip, approveTrip,
  rejectTrip, deleteTrip,
  getSettings, updateSettings, getReport
} from '../controllers/businessTrip'
import { authMiddleware, checkRoles } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

const accountingOrAdmin = checkRoles(['admin', 'accounting'])

// Settings (trợ cấp/ngày)
router.get('/settings',        getSettings)
router.put('/settings',        accountingOrAdmin, updateSettings)

// Report
router.get('/report',          accountingOrAdmin, getReport)

// CRUD chuyến công tác
router.post('/',               createTrip)
router.get('/',                getTrips)
router.get('/:id',             getTripById)
router.put('/:id',             updateTrip)
router.put('/:id/submit',      submitTrip)
router.put('/:id/approve',     accountingOrAdmin, approveTrip)
router.put('/:id/reject',      accountingOrAdmin, rejectTrip)
router.delete('/:id',          deleteTrip)

export default router
