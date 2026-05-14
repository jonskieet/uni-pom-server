// ============================================================
// src/routes/surveys.ts — Survey routes
// ============================================================

import { Router } from 'express'
import {
  getSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
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

// Survey Items
router.post('/:id/items', addSurveyItem)
router.put('/items/:itemId', updateSurveyItem)
router.delete('/items/:itemId', deleteSurveyItem)

export default router
