// ============================================================
// src/routes/surveys.ts — PATCH: thêm route export Word
// ============================================================
// Thêm 2 dòng import + 1 route vào file surveys.ts hiện có:
//
//   import { exportSurveyWord } from '../controllers/surveyExport'
//
//   // Đặt TRƯỚC route /:id để tránh bị override
//   router.get('/:id/export-word', exportSurveyWord)
//
// File surveys.ts đầy đủ sau khi patch:
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
  deleteSurvey,
} from '../controllers/surveys'
import { exportSurveyWord } from '../controllers/surveyExport'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

router.get('/', getSurveys)
router.get('/:id/export-word', exportSurveyWord)   // ← THÊM MỚI — phải đặt trước /:id
router.get('/:id', getSurveyById)
router.post('/', createSurvey)
router.put('/:id', updateSurvey)
router.delete('/:id', deleteSurvey)

// Survey Items — routes cụ thể phải đặt TRƯỚC route động /:id/items
router.put('/items/:itemId', updateSurveyItem)
router.delete('/items/:itemId', deleteSurveyItem)
router.post('/:id/items', addSurveyItem)
router.put('/:id/items', upsertSurveyItems)

export default router