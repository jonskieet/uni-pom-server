// ============================================================
// src/routes/users.ts — Users routes
// ============================================================

import { Router } from 'express'
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/users'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getUsers)
router.get('/:id', getUserById)
router.post('/', adminOnly, createUser)
router.put('/:id', adminOnly, updateUser)
router.delete('/:id', adminOnly, deleteUser)

export default router
