// ============================================================
// src/middleware/upload.ts — Multer middleware (memory storage)
// ============================================================
// Không lưu file xuống disk — đọc thẳng vào RAM rồi đẩy lên Supabase.
// Giới hạn 5 MB / file, chỉ chấp nhận image/*

import multer, { FileFilterCallback } from 'multer'
import { Request } from 'express'

const FILE_SIZE_LIMIT = 5 * 1024 * 1024 // 5 MB

function imageFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Chỉ chấp nhận file hình ảnh (image/*)'))
  }
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: imageFilter
})
