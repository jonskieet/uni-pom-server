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
  getSurveySyncDiff,
  syncSurveyItems,
} from '../controllers/surveys'
import { exportSurveyWord } from '../controllers/surveyExport'
import {
  uploadSurveyWordFile,
  downloadSurveyWordFile,
  previewSurveyWordFile,
  deleteSurveyWordFile,
} from '../controllers/surveyWordFile'
import { authMiddleware, technicalRoles, adminTechnicalOrSales } from '../middleware/auth'
import { uploadWordSingle } from '../middleware/uploadWord'

const router = Router()

router.use(authMiddleware)

router.get('/', getSurveys)
router.get('/:id/export-word', exportSurveyWord)   // ← THÊM MỚI — phải đặt trước /:id

// File Word upload (.docx) — thay thế/bổ sung cho form online ────────────
// Upload: technical/technical_lead/admin (người tạo & quản lý nội dung khảo sát)
// Xem/Xuất: + sales_admin, sales (đúng yêu cầu: trưởng phòng KT, sale admin, sale)
router.post('/:id/word-file',         technicalRoles,      uploadWordSingle, uploadSurveyWordFile)
router.get('/:id/word-file',          adminTechnicalOrSales, downloadSurveyWordFile)
router.get('/:id/word-file/preview',  adminTechnicalOrSales, previewSurveyWordFile)
router.delete('/:id/word-file',       technicalRoles,      deleteSurveyWordFile)

router.get('/:id', getSurveyById)
router.post('/', createSurvey)
router.put('/:id', updateSurvey)
router.delete('/:id', deleteSurvey)

// Survey Items — routes cụ thể phải đặt TRƯỚC route động /:id/items
router.put('/items/:itemId', updateSurveyItem)
router.delete('/items/:itemId', deleteSurveyItem)
router.post('/:id/items', addSurveyItem)
router.put('/:id/items', upsertSurveyItems)

// Đồng bộ danh sách thiết bị với POM ─────────────────────────────
router.get('/:id/sync-diff', getSurveySyncDiff)
router.post('/:id/sync',     syncSurveyItems)

export default router