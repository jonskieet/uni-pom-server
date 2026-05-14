// ============================================================
// src/routes/solutions.ts — Solutions routes
// ============================================================

import { Router } from 'express'
import {
  getSolutions,
  getSolutionById,
  createSolution,
  updateSolution,
  deleteSolution
} from '../controllers/solutions'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getSolutions)
router.get('/:id', getSolutionById)
router.post('/', adminOnly, createSolution)
router.put('/:id', adminOnly, updateSolution)
router.delete('/:id', adminOnly, deleteSolution)

export default router
