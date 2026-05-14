// ============================================================
// src/routes/brands.ts — Brands routes
// ============================================================

import { Router } from 'express'
import {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand
} from '../controllers/brands'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getBrands)
router.get('/:id', getBrandById)
router.post('/', adminOnly, createBrand)
router.put('/:id', adminOnly, updateBrand)
router.delete('/:id', adminOnly, deleteBrand)

export default router
