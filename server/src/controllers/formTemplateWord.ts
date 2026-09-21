import { Request, Response } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { inspectDocxTemplate } from '../utils/docxTemplate'
import {
  buildWordTemplateKey, deleteWordFile, getWordFileBuffer, uploadWordFile,
} from '../utils/storageR2'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function originalFileName(req: Request): string {
  return Buffer.from(req.file!.originalname, 'latin1').toString('utf8')
}

export const uploadFormTemplateWord = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (!req.file) throw new AppError(400, 'Chưa chọn file Word mẫu')
  const template = await prisma.formTemplate.findUnique({ where: { id } })
  if (!template) throw new AppError(404, 'Không tìm thấy mẫu biểu mẫu')

  let fields: string[]
  try {
    fields = await inspectDocxTemplate(req.file.buffer)
  } catch {
    throw new AppError(400, 'File DOCX không hợp lệ hoặc đã bị hỏng')
  }

  const name = originalFileName(req)
  const key = buildWordTemplateKey(id, name)
  await uploadWordFile(key, req.file.buffer, req.file.mimetype || DOCX_MIME)
  if (template.word_template_key) await deleteWordFile(template.word_template_key)

  const updated = await prisma.formTemplate.update({
    where: { id },
    data: {
      word_template_key: key,
      word_template_name: name,
      word_template_size: req.file.size,
      word_template_uploaded_by: req.user?.id ?? null,
      word_template_uploaded_at: new Date(),
      word_template_fields: fields,
      version: { increment: 1 },
    },
  })
  res.json(successResponse(updated, `Đã nhận diện ${fields.length} placeholder trong mẫu Word`))
})

export const downloadFormTemplateWord = asyncHandler(async (req: Request, res: Response) => {
  const template = await prisma.formTemplate.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!template?.word_template_key) throw new AppError(404, 'Biểu mẫu chưa có file Word mẫu')
  const buffer = await getWordFileBuffer(template.word_template_key)
  res.setHeader('Content-Type', DOCX_MIME)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(template.word_template_name || 'mau-khao-sat.docx')}`)
  res.send(buffer)
})

export const deleteFormTemplateWord = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const template = await prisma.formTemplate.findUnique({ where: { id } })
  if (!template?.word_template_key) throw new AppError(404, 'Biểu mẫu chưa có file Word mẫu')
  await deleteWordFile(template.word_template_key)
  await prisma.formTemplate.update({
    where: { id },
    data: {
      word_template_key: null, word_template_name: null, word_template_size: null,
      word_template_uploaded_by: null, word_template_uploaded_at: null, word_template_fields: Prisma.DbNull,
      version: { increment: 1 },
    },
  })
  res.json(successResponse(null, 'Đã gỡ file Word mẫu'))
})
