// ============================================================
// server/src/routes/wards.ts
// ============================================================
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import {
  getProvinces, getDistricts,
  getWards, getWardById, createWard, updateWard, deleteWard,
  getWardSummary,
  getContacts, createContact, updateContact, deleteContact,
  getActivities, createActivity,
} from '../controllers/wards'

const router = Router()
router.use(authenticateToken)

router.get('/provinces',          getProvinces)
router.get('/districts',          getDistricts)
router.get('/wards/summary',      getWardSummary)
router.get('/wards',              getWards)
router.get('/wards/:id',          getWardById)
router.post('/wards',             createWard)
router.put('/wards/:id',          updateWard)
router.delete('/wards/:id',       deleteWard)
router.get('/contacts',           getContacts)
router.post('/contacts',          createContact)
router.put('/contacts/:id',       updateContact)
router.delete('/contacts/:id',    deleteContact)
router.get('/ward-activities',    getActivities)
router.post('/ward-activities',   createActivity)

export default router
