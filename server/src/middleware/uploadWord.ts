// ============================================================
// src/middleware/uploadWord.ts — Multer middleware (memory storage)
// Dùng riêng cho upload file Word (.docx) của phiếu khảo sát.
// Không lưu xuống disk — đọc thẳng vào RAM rồi đẩy lên Cloudflare R2.
// ============================================================

import multer, { FileFilterCallback } from 'multer'
import { Request, Response, NextFunction } from 'express'
import { AppError } from './errorHandler'

const FILE_SIZE_LIMIT = 25 * 1024 * 1024 // 25 MB — file Word có thể kèm nhiều ảnh

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function wordFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) {
  const isDocx =
    file.mimetype === DOCX_MIME ||
    file.originalname.toLowerCase().endsWith('.docx')

  if (isDocx) {
    cb(null, true)
  } else {
    cb(new Error('Chỉ chấp nhận file Word định dạng .docx (Word 2007 trở lên)'))
  }
}

export const uploadWord = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_SIZE_LIMIT },
  fileFilter: wordFilter,
})

/**
 * Wrapper quanh uploadWord.single('file') — multer mặc định đẩy lỗi
 * (sai định dạng / vượt size) thành lỗi chung 500 nếu không bắt riêng.
 * Dùng hàm này trong route thay cho uploadWord.single('file') trực tiếp
 * để trả về thông báo lỗi tiếng Việt rõ ràng (400) cho người dùng.
 */
export function uploadWordSingle(req: Request, res: Response, next: NextFunction) {
  uploadWord.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(400, 'File Word vượt quá giới hạn 25MB'))
      }
      return next(new AppError(400, err.message || 'Upload file thất bại'))
    }
    next()
  })
}
