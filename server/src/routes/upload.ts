// ============================================================
// src/routes/upload.ts — Generic image upload endpoint
// POST /api/upload/:folder   (folder: avatars | brands | products | surveys)
// ============================================================

import { Router, Request, Response } from 'express'
import { authMiddleware }            from '../middleware/auth'
import { upload }                    from '../middleware/upload'
import { uploadImage, deleteImage }  from '../utils/storage'
import { asyncHandler }              from '../middleware/errorHandler'

const router = Router()

const ALLOWED_FOLDERS = ['avatars', 'brands', 'products', 'surveys']

/**
 * POST /api/upload/:folder
 * Body: multipart/form-data  →  field "image"
 * Optional body field: "old_url" (string) — URL ảnh cũ cần xoá
 * Response: { url: string }
 */
router.post(
  '/:folder',
  authMiddleware,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    const { folder } = req.params

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return res.status(400).json({ error: `folder không hợp lệ. Chỉ chấp nhận: ${ALLOWED_FOLDERS.join(', ')}` })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được upload (field name: image)' })
    }

    // Xoá ảnh cũ nếu client truyền lên
    const oldUrl = req.body.old_url as string | undefined
    if (oldUrl) {
      await deleteImage(oldUrl).catch(() => {/* bỏ qua lỗi xoá */})
    }

    // Tạo tên file unique: <userId>-<timestamp>.<ext>
    const ext      = req.file.originalname.split('.').pop() || 'jpg'
    const fileName = `${req.user?.id ?? 'u'}-${Date.now()}.${ext}`

    const url = await uploadImage(
      folder,
      fileName,
      req.file.buffer,
      req.file.mimetype
    )

    res.json({ url })
  })
)

/**
 * DELETE /api/upload
 * Body: { url: string }
 * Xoá một ảnh bất kỳ theo URL (admin only hoặc owner — tự kiểm soát ở client)
 */
router.delete(
  '/',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: 'url là bắt buộc' })

    await deleteImage(url)
    res.json({ message: 'Đã xoá ảnh' })
  })
)

export default router
