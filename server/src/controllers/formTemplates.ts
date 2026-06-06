// server/src/controllers/formTemplates.ts
import { Request, Response } from 'express'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { prisma } from '../lib/prisma'


/** GET /form-templates?solution_id=X */
export const getFormTemplates = asyncHandler(async (req: Request, res: Response) => {
  const solution_id = req.query.solution_id
    ? parseInt(req.query.solution_id as string)
    : undefined

  const templates = await (prisma as any).formTemplate.findMany({
    where: solution_id ? { solution_id } : {},
    include: { solution: { select: { id: true, name: true, code: true } } },
    orderBy: { updated_at: 'desc' },
  })
  res.json(successResponse(templates))
})

/** GET /form-templates/:id */
export const getFormTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const t = await (prisma as any).formTemplate.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { solution: { select: { id: true, name: true, code: true } } },
  })
  if (!t) throw new AppError(404, 'Form template không tồn tại')
  res.json(successResponse(t))
})

/** POST /form-templates */
export const createFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, name, description, schema, is_active } = req.body
  if (!solution_id || !name) throw new AppError(400, 'Thiếu solution_id hoặc name')

  const t = await (prisma as any).formTemplate.create({
    data: {
      solution_id: parseInt(String(solution_id)),
      name:        String(name),
      description: description ?? null,
      schema:      schema ?? [],
      is_active:   is_active ?? true,
      version:     1,
      created_by:  (req as any).user?.id ?? null,
    },
  })
  res.status(201).json(successResponse(t, 'Tạo form template thành công'))
})

/** PUT /form-templates/:id */
export const updateFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name, description, schema, is_active } = req.body

  const existing = await (prisma as any).formTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Form template không tồn tại')

  const t = await (prisma as any).formTemplate.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(schema      !== undefined && { schema, version: existing.version + 1 }),
      ...(is_active   !== undefined && { is_active }),
    },
  })
  res.json(successResponse(t, 'Cập nhật form template thành công'))
})

/** DELETE /form-templates/:id */
export const deleteFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const existing = await (prisma as any).formTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Form template không tồn tại')
  await (prisma as any).formTemplate.delete({ where: { id } })
  res.json(successResponse(null, 'Đã xoá form template'))
})