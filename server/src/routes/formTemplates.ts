// server/src/routes/formTemplates.ts
import { Router } from 'express'
import {
  getFormTemplates, getFormTemplateById,
  createFormTemplate, updateFormTemplate, deleteFormTemplate
} from '../controllers/formTemplates'
import { authMiddleware, adminOnly, adminOrTechLead } from '../middleware/auth'
import { uploadWordSingle } from '../middleware/uploadWord'
import {
  deleteFormTemplateWord, downloadFormTemplateWord, uploadFormTemplateWord,
} from '../controllers/formTemplateWord'

const router = Router()
router.use(authMiddleware)

router.get('/',     getFormTemplates)
router.post('/:id/word-template', adminOrTechLead, uploadWordSingle, uploadFormTemplateWord)
router.get('/:id/word-template', downloadFormTemplateWord)
router.delete('/:id/word-template', adminOrTechLead, deleteFormTemplateWord)
router.get('/:id',  getFormTemplateById)
router.post('/',    adminOrTechLead, createFormTemplate)
router.put('/:id',  adminOrTechLead, updateFormTemplate)
router.delete('/:id', adminOnly, deleteFormTemplate)

export default router
