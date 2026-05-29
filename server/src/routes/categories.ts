// ============================================================
// src/routes/categories.ts — Categories routes
// ============================================================

import { Router } from 'express'
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categories'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getCategories)
router.get('/:id', getCategoryById)
router.post('/', adminOnly, createCategory)
router.put('/:id', adminOnly, updateCategory)
router.delete('/:id', adminOnly, deleteCategory)

export default router
