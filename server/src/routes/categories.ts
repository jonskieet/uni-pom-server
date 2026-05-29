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
import { authMiddleware, adminOnly, adminOrSales } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/',    getCategories)
router.get('/:id', getCategoryById)
router.post('/',   adminOrSales, createCategory)   // admin + sales được thêm danh mục
router.put('/:id', adminOrSales, updateCategory)   // admin + sales được sửa danh mục
router.delete('/:id', adminOnly, deleteCategory)   // chỉ admin được xóa danh mục

export default router
