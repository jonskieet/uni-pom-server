// ============================================================
// src/routes/poms.ts — POMs routes
// ============================================================

import { Router } from 'express'
import {
  getPoms,
  getPomById,
  createPom,
  updatePom,
  addPomItem,
  updatePomItem,
  deletePomItem,
  changePomStatus,
  deletePom
} from '../controllers/poms'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

router.get('/', getPoms)
router.get('/:id', getPomById)
router.post('/', createPom)
router.put('/:id', updatePom)
router.put('/:id/status', changePomStatus)
router.delete('/:id', deletePom)

// POM Items
router.post('/:id/items', addPomItem)
router.put('/items/:itemId', updatePomItem)
router.delete('/items/:itemId', deletePomItem)

export default router
