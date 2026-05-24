// server/src/routes/formTemplates.ts
import { Router } from 'express'
import {
  getFormTemplates, getFormTemplateById,
  createFormTemplate, updateFormTemplate, deleteFormTemplate
} from '../controllers/formTemplates'
import { authMiddleware, adminOnly, adminTechnicalOrSales } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

router.get('/',     getFormTemplates)
router.get('/:id',  getFormTemplateById)
router.post('/',    adminTechnicalOrSales, createFormTemplate)
router.put('/:id',  adminTechnicalOrSales, updateFormTemplate)
router.delete('/:id', adminOnly, deleteFormTemplate)

export default router
