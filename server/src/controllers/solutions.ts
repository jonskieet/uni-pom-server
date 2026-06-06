// ============================================================
// src/controllers/solutions.ts — Solutions controller
// ============================================================

import { Request, Response } from 'express'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { prisma } from '../lib/prisma'


/**
 * GET /solutions — Get all solutions
 */
export const getSolutions = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined
  const is_active = req.query.is_active ? req.query.is_active === 'true' : undefined

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { code: { contains: search, mode: 'insensitive' as const } }
      ]
    }),
    ...(is_active !== undefined && { is_active })
  }

  const solutions = await prisma.solution.findMany({
    where,
    orderBy: { name: 'asc' }
  })

  res.json(successResponse(solutions))
})

/**
 * GET /solutions/:id — Get solution by ID
 */
export const getSolutionById = asyncHandler(async (req: Request, res: Response) => {
  const solution = await prisma.solution.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(solution))
})

/**
 * POST /solutions — Create solution (admin only)
 */
export const createSolution = asyncHandler(async (req: Request, res: Response) => {
  const { name, code, description } = req.body

  if (!name || !code) {
    throw new AppError(400, 'name and code are required')
  }

  const solution = await prisma.solution.create({
    data: {
      name,
      code,
      description
    }
  })

  res.status(201).json(successResponse(solution))
})

/**
 * PUT /solutions/:id — Update solution
 */
export const updateSolution = asyncHandler(async (req: Request, res: Response) => {
  const { name, code, description, is_active } = req.body

  const solution = await prisma.solution.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name && { name }),
      ...(code && { code }),
      ...(description !== undefined && { description }),
      ...(is_active !== undefined && { is_active })
    }
  })

  res.json(successResponse(solution))
})

/**
 * DELETE /solutions/:id — Delete solution
 */
export const deleteSolution = asyncHandler(async (req: Request, res: Response) => {
  await prisma.solution.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'Solution deleted successfully'))
})