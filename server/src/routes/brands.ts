// ============================================================
// src/routes/brands.ts — Brands routes
// FIX: sales được phép tạo & sửa hãng (adminTechnicalOrSales)
//      chỉ admin mới được xóa hãng (tránh xóa nhầm ảnh hưởng sản phẩm)
// ============================================================

import { Router } from 'express'
import {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand
} from '../controllers/brands'
import { authMiddleware, adminOnly, adminTechnicalOrSales } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/',    getBrands)
router.get('/:id', getBrandById)
router.post('/',    adminTechnicalOrSales, createBrand)  // ← đổi từ adminOnly
router.put('/:id',  adminTechnicalOrSales, updateBrand)  // ← đổi từ adminOnly
router.delete('/:id', adminOnly, deleteBrand)            // ← giữ adminOnly (an toàn hơn)

export default router
