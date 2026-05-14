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
import { authMiddleware, adminOrTechnical } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getProducts)
router.get('/:id', getProductById)
router.post('/', adminOrTechnical, createProduct)
router.put('/:id', adminOrTechnical, updateProduct)
router.delete('/:id', adminOrTechnical, deleteProduct)

export default router
