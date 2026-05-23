// ============================================================
// src/routes/surveys.ts — Survey routes
// ============================================================

import { Router } from 'express'
import {
  getSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  upsertSurveyItems,
  addSurveyItem,
  updateSurveyItem,
  deleteSurveyItem,
  deleteSurvey
} from '../controllers/surveys'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

router.get('/', getSurveys)
router.get('/:id', getSurveyById)
router.post('/', createSurvey)
router.put('/:id', updateSurvey)
router.delete('/:id', deleteSurvey)

// Survey Items — routes cụ thể phải đặt TRƯỚC route động /:id/items
router.put('/items/:itemId', updateSurveyItem)      // ← cụ thể, đặt trước
router.delete('/items/:itemId', deleteSurveyItem)   // ← cụ thể, đặt trước
router.post('/:id/items', addSurveyItem)
router.put('/:id/items', upsertSurveyItems)         // ← động, đặt sau

export default router
