// ============================================================
// src/controllers/categories.ts — Categories controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * GET /categories — Get all categories
 */
export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined

  const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {}

  const categories = await prisma.category.findMany({
    where,
    orderBy: { name: 'asc' }
  })

  res.json(successResponse(categories))
})

/**
 * GET /categories/:id — Get category by ID
 */
export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(category))
})

/**
 * POST /categories — Create category (admin only)
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body

  if (!name) {
    throw new AppError(400, 'name is required')
  }

  const category = await prisma.category.create({
    data: {
      name,
      description
    }
  })

  res.status(201).json(successResponse(category))
})

/**
 * PUT /categories/:id — Update category
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body

  const category = await prisma.category.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description })
    }
  })

  res.json(successResponse(category))
})

/**
 * DELETE /categories/:id — Delete category
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  await prisma.category.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'Category deleted successfully'))
})
