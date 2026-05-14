// ============================================================
// src/controllers/poms.ts — POMs controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, Prisma, PomStatus } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * Generate POM code: POM-YYYYMMDD-XXXX
 */
function generatePomCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `POM-${date}-${random}`
}

/**
 * GET /poms — Get all POMs with filters
 */
export const getPoms = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const statusParam = req.query.status as string | undefined
  const createdBy = req.query.created_by ? parseInt(req.query.created_by as string) : undefined
  const status = (statusParam && Object.values(PomStatus).includes(statusParam as PomStatus))
    ? (statusParam as PomStatus)
    : undefined

  const where: Prisma.PomWhereInput = {
    ...(status && { status }),
    ...(createdBy && { created_by: createdBy })
  }

  const [poms, total] = await Promise.all([
    prisma.pom.findMany({
      where,
      include: {
        solution: true,
        creator: true,
        reviewer: true,
        items: { include: { product: true } }
      },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    prisma.pom.count({ where })
  ])

  res.json(
    successResponse({
      data: poms,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  )
})

/**
 * GET /poms/:id — Get POM by ID with items
 */
export const getPomById = asyncHandler(async (req: Request, res: Response) => {
  const pom = await prisma.pom.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: {
      solution: true,
      creator: true,
      reviewer: true,
      items: { include: { product: true }, orderBy: { sort_order: 'asc' } }
    }
  })

  res.json(successResponse(pom))
})

/**
 * POST /poms — Create new POM
 */
export const createPom = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, project_name, customer_name, note, items } = req.body
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(401, 'Unauthorized')
  }

  if (!project_name) {
    throw new AppError(400, 'project_name is required')
  }

  const pom_code = generatePomCode()

  const pom = await prisma.pom.create({
    data: {
      pom_code,
      project_name,
      customer_name,
      solution_id,
      created_by: userId,
      note,
      status: 'draft',
      items: {
        create: items || []
      }
    },
    include: {
      solution: true,
      creator: true,
      items: { include: { product: true } }
    }
  })

  res.status(201).json(successResponse(pom))
})

/**
 * PUT /poms/:id — Update POM
 */
export const updatePom = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, project_name, customer_name, status, note } = req.body
  const pomId = parseInt(req.params.id)

  const pom = await prisma.pom.update({
    where: { id: pomId },
    data: {
      ...(solution_id && { solution_id }),
      ...(project_name && { project_name }),
      ...(customer_name !== undefined && { customer_name }),
      ...(status && { status }),
      ...(note !== undefined && { note })
    },
    include: {
      solution: true,
      creator: true,
      items: { include: { product: true } }
    }
  })

  res.json(successResponse(pom))
})

/**
 * POST /poms/:id/items — Add item to POM
 */
export const addPomItem = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const { product_id, quantity, unit_price, vat_rate, note } = req.body

  if (!product_id || !quantity || unit_price === undefined) {
    throw new AppError(400, 'product_id, quantity, and unit_price are required')
  }

  const pomItem = await prisma.pomItem.create({
    data: {
      pom_id: pomId,
      product_id,
      quantity,
      unit_price,
      vat_rate: vat_rate || 0.1,
      note,
      sort_order: 0
    },
    include: { product: true }
  })

  res.status(201).json(successResponse(pomItem))
})

/**
 * PUT /poms/items/:itemId — Update POM item
 */
export const updatePomItem = asyncHandler(async (req: Request, res: Response) => {
  const itemId = parseInt(req.params.itemId)
  const { quantity, unit_price, vat_rate, note } = req.body

  const pomItem = await prisma.pomItem.update({
    where: { id: itemId },
    data: {
      ...(quantity && { quantity }),
      ...(unit_price !== undefined && { unit_price }),
      ...(vat_rate !== undefined && { vat_rate }),
      ...(note !== undefined && { note })
    },
    include: { product: true }
  })

  res.json(successResponse(pomItem))
})

/**
 * DELETE /poms/items/:itemId — Delete POM item
 */
export const deletePomItem = asyncHandler(async (req: Request, res: Response) => {
  const itemId = parseInt(req.params.itemId)

  await prisma.pomItem.delete({ where: { id: itemId } })

  res.json(successResponse(null, 'POM item deleted successfully'))
})

/**
 * PUT /poms/:id/status — Change POM status
 */
export const changePomStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body

  if (!status) {
    throw new AppError(400, 'status is required')
  }

  const pom = await prisma.pom.update({
    where: { id: parseInt(req.params.id) },
    data: { status },
    include: {
      solution: true,
      creator: true,
      items: { include: { product: true } }
    }
  })

  res.json(successResponse(pom))
})

/**
 * DELETE /poms/:id — Delete POM
 */
export const deletePom = asyncHandler(async (req: Request, res: Response) => {
  await prisma.pom.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'POM deleted successfully'))
})
