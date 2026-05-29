// ============================================================
// src/controllers/categories.ts — Categories controller
// Hỗ trợ danh mục cha-con (parent_id)
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * GET /categories — Lấy tất cả danh mục
 * ?tree=true  → trả về cây cha-con lồng nhau
 * ?parent_id=0 → chỉ danh mục gốc (parent_id IS NULL)
 * ?parent_id=5  → danh mục con của id=5
 * ?search=...   → tìm theo tên
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const search    = req.query.search    as string | undefined
  const tree      = req.query.tree      === 'true'
  const parentIdQ = req.query.parent_id as string | undefined

  // --- Chế độ cây lồng nhau ---
  if (tree) {
    const roots = await prisma.category.findMany({
      where: { parent_id: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
          include: { children: { orderBy: { name: 'asc' } } }
        }
      },
      orderBy: { name: 'asc' }
    })
    return res.json(successResponse(roots))
  }

  // --- Chế độ phẳng với filter ---
  const where: any = {}

  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  if (parentIdQ !== undefined) {
    where.parent_id = parentIdQ === '0' || parentIdQ === 'null'
      ? null
      : parseInt(parentIdQ)
  }

  const categories = await prisma.category.findMany({
    where,
    include: {
      parent:   { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      _count:   { select: { products: true } }
    },
    orderBy: [{ parent_id: 'asc' }, { name: 'asc' }]
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
      parent:   { select: { id: true, name: true } },
      children: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      _count:   { select: { products: true } }
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

  // Kiểm tra parent tồn tại
  if (parent_id) {
    const parent = await prisma.category.findUnique({ where: { id: parent_id } })
    if (!parent) throw new AppError(400, 'parent_id không tồn tại')
    // Không cho phép danh mục con lại làm cha (chỉ hỗ trợ 2 cấp)
    if (parent.parent_id !== null) throw new AppError(400, 'Chỉ hỗ trợ 2 cấp danh mục (cha → con)')
  }

  const category = await prisma.category.create({
    data: { name: name.trim(), description, parent_id: parent_id || null },
    include: {
      parent:   { select: { id: true, name: true } },
      children: { select: { id: true, name: true } }
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

  if (parent_id) {
    if (parent_id === id) throw new AppError(400, 'Không thể đặt chính nó làm cha')
    const parent = await prisma.category.findUnique({ where: { id: parent_id } })
    if (!parent) throw new AppError(400, 'parent_id không tồn tại')
    if (parent.parent_id !== null) throw new AppError(400, 'Chỉ hỗ trợ 2 cấp danh mục')
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(parent_id !== undefined && { parent_id: parent_id || null })
    },
    include: {
      parent:   { select: { id: true, name: true } },
      children: { select: { id: true, name: true } }
    }
  })

  res.json(successResponse(category))
})

/**
 * DELETE /categories/:id — Xóa danh mục (admin)
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

  // Không xóa nếu còn sản phẩm hoặc danh mục con
  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true, children: true } }
    }
  })
  if (!cat) throw new AppError(404, 'Không tìm thấy danh mục')
  if (cat._count.products > 0)
    throw new AppError(400, `Không thể xóa: còn ${cat._count.products} sản phẩm thuộc danh mục này`)
  if (cat._count.children > 0)
    throw new AppError(400, `Không thể xóa: còn ${cat._count.children} danh mục con`)

  await prisma.category.delete({ where: { id } })

  res.json(successResponse(null, 'Đã xóa danh mục'))
})
