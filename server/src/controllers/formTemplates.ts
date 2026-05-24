// server/src/controllers/formTemplates.ts
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()
const db = prisma as any

/** GET /form-templates?solution_id=X */
export const getFormTemplates = asyncHandler(async (req: Request, res: Response) => {
  const solution_id = req.query.solution_id
    ? Number(req.query.solution_id as string)
    : undefined
  const templates = await db.formTemplate.findMany({
    where: { ...(solution_id ? { solution_id } : {}) },
    include: { solution: { select: { id: true, name: true, code: true } } },
    orderBy: { updated_at: 'desc' },
  })
  res.json(successResponse(templates))
})

/** GET /form-templates/:id */
export const getFormTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const t = await db.formTemplate.findUnique({
    where: { id },
    include: { solution: { select: { id: true, name: true, code: true } } },
  })
  if (!t) throw new AppError('Form template không tồn tại', 404)
  res.json(successResponse(t))
})

/** POST /form-templates */
export const createFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, name, description, schema, is_active } = req.body
  const created_by: number | null = (req as any).user?.id ?? null
  if (!solution_id || !name) throw new AppError('Thiếu solution_id hoặc name', 400)

  const t = await db.formTemplate.create({
    data: {
      solution_id: Number(solution_id),
      name:        String(name),
      description: description ?? null,
      schema:      schema ?? [],
      is_active:   is_active ?? true,
      version:     1,
      created_by,
    },
  })
  res.status(201).json(successResponse(t, 'Tạo form template thành công'))
})

/** PUT /form-templates/:id */
export const updateFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const { name, description, schema, is_active } = req.body
  const existing = await db.formTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError('Form template không tồn tại', 404)

  const t = await db.formTemplate.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name:        String(name) }),
      ...(description !== undefined && { description: description as string | null }),
      ...(schema      !== undefined && { schema, version: (existing.version as number) + 1 }),
      ...(is_active   !== undefined && { is_active:   Boolean(is_active) }),
    },
  })
  res.json(successResponse(t, 'Cập nhật form template thành công'))
})

/** DELETE /form-templates/:id */
export const deleteFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const existing = await db.formTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError('Form template không tồn tại', 404)
  await db.formTemplate.delete({ where: { id } })
  res.json(successResponse(null, 'Đã xoá form template'))
})
