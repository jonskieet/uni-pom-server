// ============================================================
// src/controllers/categories.ts — Categories controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

// ── Prisma singleton (shared connection pool) ────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

/**
 * GET /categories — Lấy tất cả danh mục
 * ?search=... → tìm theo tên
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined

  const where: any = {}

  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const categories = await prisma.category.findMany({
    where,
    include: {
      _count: { select: { products: true } },
      children: true
    },
    orderBy: { name: 'asc' }
  })

  res.json(successResponse(categories))
})

/**
 * GET /categories/:id
 */
export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: {
      _count: { select: { products: true } }
    }
  })

  res.json(successResponse(category))
})

/**
 * POST /categories — Tạo danh mục (admin)
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, parent_id } = req.body

  if (!name?.trim()) throw new AppError(400, 'name is required')

  let parentId: number | null = null
  if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
    parentId = parseInt(parent_id)
    if (Number.isNaN(parentId)) throw new AppError(400, 'parent_id không hợp lệ')

    const parent = await prisma.category.findUnique({ where: { id: parentId } })
    if (!parent) throw new AppError(400, 'Danh mục cha không tồn tại')
  }

  const category = await prisma.category.create({
    data: { name: name.trim(), description, parent_id: parentId },
    include: {
      _count: { select: { products: true } },
      children: true
    }
  })

  res.status(201).json(successResponse(category))
})

/**
 * PUT /categories/:id — Sửa danh mục (admin)
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, parent_id } = req.body
  const id = parseInt(req.params.id)

  let parentUpdate: { parent_id: number | null } | Record<string, never> = {}

  if (parent_id !== undefined) {
    if (parent_id === null || parent_id === '') {
      parentUpdate = { parent_id: null }
    } else {
      const parentId = parseInt(parent_id)
      if (Number.isNaN(parentId)) throw new AppError(400, 'parent_id không hợp lệ')
      if (parentId === id) throw new AppError(400, 'Danh mục không thể là cha của chính nó')

      const parent = await prisma.category.findUnique({ where: { id: parentId } })
      if (!parent) throw new AppError(400, 'Danh mục cha không tồn tại')

      // Chặn tạo vòng lặp: không cho set cha là một trong các con/cháu của chính nó
      let cursor: number | null = parent.parent_id
      while (cursor !== null) {
        if (cursor === id) throw new AppError(400, 'Không thể chọn danh mục con của chính nó làm danh mục cha')
        const cursorCat: { parent_id: number | null } | null = await prisma.category.findUnique({
          where: { id: cursor },
          select: { parent_id: true }
        })
        cursor = cursorCat?.parent_id ?? null
      }

      parentUpdate = { parent_id: parentId }
    }
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...parentUpdate
    },
    include: {
      _count: { select: { products: true } },
      children: true
    }
  })

  res.json(successResponse(category))
})

/**
 * DELETE /categories/:id — Xóa danh mục (admin)
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

  // Không xóa nếu còn sản phẩm
  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } }
    }
  })
  if (!cat) throw new AppError(404, 'Không tìm thấy danh mục')
  if (cat._count.products > 0)
    throw new AppError(400, `Không thể xóa: còn ${cat._count.products} sản phẩm thuộc danh mục này`)

  await prisma.category.delete({ where: { id } })

  res.json(successResponse(null, 'Đã xóa danh mục'))
})
