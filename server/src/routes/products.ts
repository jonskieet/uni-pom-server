// ============================================================
// src/routes/products.ts — Products routes
// ============================================================

import { Router } from 'express'
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/products'
import { authMiddleware, adminOrTechnical, adminTechnicalOrSales } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getProducts)
router.get('/:id', getProductById)
router.post('/', adminTechnicalOrSales, createProduct)   // sales được phép tạo sản phẩm
router.put('/:id', adminTechnicalOrSales, updateProduct) // sales được phép sửa sản phẩm
router.delete('/:id', adminOrTechnical, deleteProduct)   // chỉ admin/technical được xóa

export default router
