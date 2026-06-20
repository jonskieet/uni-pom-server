// ============================================================
// src/routes/users.ts — Users routes
// ============================================================

import { Router } from 'express'
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateAvatar,
  updateEmail,
  deleteUser,
  resetPassword,
  getBankInfo,
  saveBankInfo,
  getBankInfoByUserId,
} from '../controllers/users'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)
router.get('/', getUsers)

// ── Thông tin ngân hàng (QR chuyển khoản) ──────────────────────
// Đặt TRƯỚC '/:id' vì đây là route tĩnh, tránh bị '/:id' nuốt mất
router.get('/bank-info', getBankInfo)
router.put('/bank-info', saveBankInfo)
router.get('/:userId/bank-info', getBankInfoByUserId)

router.get('/:id', getUserById)
router.post('/', adminOnly, createUser)
router.put('/:id', adminOnly, updateUser)
router.put('/:id/avatar', updateAvatar)          // ← Không cần adminOnly
router.put('/:id/email', updateEmail)             // ← Không cần adminOnly — chính chủ tự sửa được
router.put('/:id/reset-password', adminOnly, resetPassword)
router.delete('/:id', adminOnly, deleteUser)

export default router
