// ============================================================
// src/routes/formTemplates.ts
// ============================================================

import { Router } from 'express'
import {
  getFormTemplates,
  getFormTemplateByType,
  createFormTemplate,
  updateFormTemplate,
  deleteFormTemplate,
  seedDefaultTemplates,
} from '../controllers/formTemplates'
import { authMiddleware, adminOrTechLead } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

// Đọc: tất cả role được xem
router.get('/', getFormTemplates)
router.get('/:type', getFormTemplateByType)

// Write: chỉ admin hoặc technical_lead
router.post('/seed/defaults', adminOrTechLead, seedDefaultTemplates)
router.post('/', adminOrTechLead, createFormTemplate)
router.put('/:id', adminOrTechLead, updateFormTemplate)
router.delete('/:id', adminOrTechLead, deleteFormTemplate)

export default router
