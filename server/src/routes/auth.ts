// ============================================================
// src/routes/auth.ts — Auth routes
// ============================================================

import { Router } from 'express'
import { login, changePassword, getMe, refreshToken } from '../controllers/auth'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/login', login)
router.post('/refresh', authMiddleware, refreshToken)
router.post('/change-password', authMiddleware, changePassword)
router.get('/me', authMiddleware, getMe)

export default router
