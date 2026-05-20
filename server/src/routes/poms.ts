// ============================================================
// src/routes/poms.ts — POMs routes
// ============================================================

import { Router } from 'express'
import {
  getPoms,
  getPomById,
  createPom,
  updatePom,
  upsertPomItems,
  addPomItem,
  updatePomItem,
  deletePomItem,
  changePomStatus,
  deletePom,
  returnPom,
  approvePom
} from '../controllers/poms'
import { authMiddleware, adminOrTechLead } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

router.get('/', getPoms)
router.get('/:id', getPomById)
router.post('/', createPom)
router.put('/:id', updatePom)
router.put('/:id/status', changePomStatus)
router.put('/:id/return', returnPom)    // ← Trả POM về Kỹ thuật
router.put('/:id/approve', adminOrTechLead, approvePom)  // ← Trưởng phòng KT duyệt
router.put('/:id/items', upsertPomItems)   // ← BULK upsert items
router.delete('/:id', deletePom)

// POM Items (single)
router.post('/:id/items', addPomItem)
router.put('/items/:itemId', updatePomItem)
router.delete('/items/:itemId', deletePomItem)

export default router
