// ============================================================
// src/routes/admin.ts — Admin dashboard routes
// ============================================================

import { Router } from 'express'
import {
  getDashboard,
  getPomTimeline,
  getKpi,
  getAllPoms,
  getPriceHistory,
} from '../controllers/admin'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)
router.use(adminOnly) // Tất cả route admin chỉ dành cho admin

router.get('/dashboard',              getDashboard)
router.get('/poms',                   getAllPoms)
router.get('/poms/:pomId/timeline',   getPomTimeline)
router.get('/kpi',                    getKpi)
router.get('/price-history',          getPriceHistory)

export default router
