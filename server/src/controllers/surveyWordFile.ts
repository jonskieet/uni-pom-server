// ============================================================
// src/controllers/surveyWordFile.ts
// Upload / Xem nội dung / Xuất / Xóa file Word (.docx) của phiếu
// báo cáo khảo sát — lưu trên Cloudflare R2.
//
// KIẾN TRÚC: Đây là một lựa chọn THAY THẾ cho việc điền form online
// (FormRenderer + form_data) — không đụng tới luồng cũ. Kỹ thuật có
// thể soạn báo cáo trực tiếp trong Word (không bị giới hạn chỉnh sửa
// văn bản/hình ảnh như form online) rồi upload file .docx lên đây.
// Trưởng phòng kỹ thuật / Sale Admin / Sale (và Kỹ thuật, Admin) đều
// xem được nội dung (preview HTML) hoặc tải file Word gốc về.
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import mammoth from 'mammoth'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import {
  buildWordFileKey,
  uploadWordFile,
  getWordFileBuffer,
  deleteWordFile,
} from '../utils/storageR2'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * POST /surveys/:id/word-file — Upload (hoặc thay thế) file Word của phiếu
 * Field multipart: "file"
 */
export const uploadSurveyWordFile = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const userId = req.user?.id
  if (!userId) throw new AppError(401, 'Unauthorized')
  if (!req.file) throw new AppError(400, 'Không có file được upload (field name: file)')

  // FIX: multer/busboy decode tên file gốc theo latin1 mặc định, nên tên
  // file có dấu tiếng Việt (UTF-8) bị hiển thị sai (mojibake, vd "Tá»£ trÃ¬nh...").
  // Re-decode lại đúng chiều utf8 để lưu/tải về hiển thị đúng dấu.
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')

  const survey = await prisma.surveyReport.findUnique({ where: { id: reportId } })
  if (!survey) throw new AppError(404, 'Không tìm thấy phiếu khảo sát')

  // Nếu phiếu đã có file Word trước đó → xóa file cũ trên R2 (thay thế)
  if (survey.word_file_key) {
    await deleteWordFile(survey.word_file_key)
  }

  const key = buildWordFileKey(survey.report_code, originalName)
  await uploadWordFile(key, req.file.buffer, req.file.mimetype || DOCX_MIME)

  const updated = await prisma.surveyReport.update({
    where: { id: reportId },
    data: {
      word_file_key: key,
      word_file_name: originalName,
      word_file_size: req.file.size,
      word_file_uploaded_by: userId,
      word_file_uploaded_at: new Date(),
    },
    include: { pom: true, creator: true, items: true },
  })

  res.json(successResponse(updated, 'Đã tải lên file Word thành công'))
})

/**
 * GET /surveys/:id/word-file — Tải (export) file Word gốc về máy
 */
export const downloadSurveyWordFile = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)

  const survey = await prisma.surveyReport.findUnique({ where: { id: reportId } })
  if (!survey) throw new AppError(404, 'Không tìm thấy phiếu khảo sát')
  if (!survey.word_file_key) throw new AppError(404, 'Phiếu này chưa có file Word được upload')

  const buffer = await getWordFileBuffer(survey.word_file_key)
  const filename = survey.word_file_name || `BaoCaoKhaoSat_${survey.report_code}.docx`

  res.setHeader('Content-Type', DOCX_MIME)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(buffer)
})

/**
 * GET /surveys/:id/word-file/preview — Chuyển file Word → HTML để xem
 * nội dung ngay trong app, không cần mở Word / tải file về.
 */
export const previewSurveyWordFile = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)

  const survey = await prisma.surveyReport.findUnique({ where: { id: reportId } })
  if (!survey) throw new AppError(404, 'Không tìm thấy phiếu khảo sát')
  if (!survey.word_file_key) throw new AppError(404, 'Phiếu này chưa có file Word được upload')

  const buffer = await getWordFileBuffer(survey.word_file_key)

  const result = await mammoth.convertToHtml({ buffer })

  res.json(successResponse({
    html: result.value,
    file_name: survey.word_file_name,
    warnings: (result.messages ?? []).map(m => m.message),
  }))
})

/**
 * DELETE /surveys/:id/word-file — Xóa file Word khỏi phiếu (để upload lại file khác)
 */
export const deleteSurveyWordFile = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)

  const survey = await prisma.surveyReport.findUnique({ where: { id: reportId } })
  if (!survey) throw new AppError(404, 'Không tìm thấy phiếu khảo sát')
  if (!survey.word_file_key) throw new AppError(404, 'Phiếu này chưa có file Word')

  await deleteWordFile(survey.word_file_key)

  await prisma.surveyReport.update({
    where: { id: reportId },
    data: {
      word_file_key: null,
      word_file_name: null,
      word_file_size: null,
      word_file_uploaded_by: null,
      word_file_uploaded_at: null,
    },
  })

  res.json(successResponse(null, 'Đã xóa file Word'))
})