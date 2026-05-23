// ============================================================
// src/routes/brands.ts — Brands routes
// FIX: sales được phép tạo & sửa hãng (adminTechnicalOrSales)
// ============================================================
import { Router } from 'express'
import { getBrands, getBrandById, createBrand, updateBrand, deleteBrand } from '../controllers/brands'
import { authMiddleware, adminOnly, adminTechnicalOrSales } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/',    getBrands)
router.get('/:id', getBrandById)
router.post('/',    adminTechnicalOrSales, createBrand)
router.put('/:id',  adminTechnicalOrSales, updateBrand)
router.delete('/:id', adminOnly, deleteBrand)

export default router
