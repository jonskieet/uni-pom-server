// src/routes/solutions.ts
import { Router } from 'express'
import { getSolutions, getSolutionById, createSolution, updateSolution, deleteSolution } from '../controllers/solutions'
import { authMiddleware, adminOnly, adminOrTechLead } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)
router.get('/',    getSolutions)
router.get('/:id', getSolutionById)
router.post('/',    adminOrTechLead, createSolution)   // ← technical_lead được tạo
router.put('/:id',  adminOrTechLead, updateSolution)   // ← technical_lead được sửa
router.delete('/:id', adminOnly,    deleteSolution)    // ← chỉ admin xoá
export default router
