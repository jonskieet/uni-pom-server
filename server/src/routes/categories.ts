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
import { authMiddleware, adminOrSales } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getCategories)
router.get('/:id', getCategoryById)
router.post('/', adminOrSales, createCategory)
router.put('/:id', adminOrSales, updateCategory)
router.delete('/:id', adminOrSales, deleteCategory)

export default router
