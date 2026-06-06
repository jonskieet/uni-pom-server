// ============================================================
// src/routes/settings.ts -- System settings routes
// ============================================================

import { Router } from 'express'
import { getSetting, setSetting, getAllSettings } from '../controllers/settings'
import { authMiddleware, adminOnly } from '../middleware/auth'

const router = Router()

router.use(authMiddleware)

// GET /settings           -- tat ca settings (moi role da auth deu doc duoc)
router.get('/',       getAllSettings)

// GET /settings/:key      -- lay 1 setting
router.get('/:key',   getSetting)

// PUT /settings/:key      -- ghi 1 setting (admin only)
router.put('/:key',   adminOnly, setSetting)

export default router