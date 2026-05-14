// ============================================================
// src/controllers/products.ts — Products controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, Prisma, ProductStatus } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * GET /products — Get all products with pagination & filters
 */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const search = req.query.search as string | undefined
  const brandId = req.query.brand_id ? parseInt(req.query.brand_id as string) : undefined
  const categoryId = req.query.category_id ? parseInt(req.query.category_id as string) : undefined
  const statusParam = req.query.status as string | undefined
  const status = (statusParam && Object.values(ProductStatus).includes(statusParam as ProductStatus))
    ? (statusParam as ProductStatus)
    : undefined

  const where: Prisma.ProductWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { part_number: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(brandId && { brand_id: brandId }),
    ...(categoryId && { category_id: categoryId }),
    ...(status && { status })
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: true },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    prisma.product.count({ where })
  ])

  res.json(
    successResponse({
      data: products,
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
 * GET /products/:id — Get product by ID
 */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: { brand: true, category: true }
  })

  res.json(successResponse(product))
})

/**
 * POST /products — Create product (admin/technical only)
 */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const { brand_id, category_id, name, part_number, unit, price, vat_rate, status, description, spec } = req.body

  if (!brand_id || !category_id || !name) {
    throw new AppError(400, 'brand_id, category_id, and name are required')
  }

  const product = await prisma.product.create({
    data: {
      brand_id,
      category_id,
      name,
      part_number,
      unit: unit || 'Cái',
      price: price || 0,
      vat_rate: vat_rate || 0.1,
      status: status || 'active',
      description,
      spec,
      created_by: req.user?.id
    },
    include: { brand: true, category: true }
  })

  res.status(201).json(successResponse(product))
})

/**
 * PUT /products/:id — Update product
 */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { brand_id, category_id, name, part_number, unit, price, vat_rate, status, description, spec } = req.body

  const product = await prisma.product.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(brand_id && { brand_id }),
      ...(category_id && { category_id }),
      ...(name && { name }),
      ...(part_number !== undefined && { part_number }),
      ...(unit && { unit }),
      ...(price !== undefined && { price }),
      ...(vat_rate !== undefined && { vat_rate }),
      ...(status && { status }),
      ...(description !== undefined && { description }),
      ...(spec !== undefined && { spec })
    },
    include: { brand: true, category: true }
  })

  res.json(successResponse(product))
})

/**
 * DELETE /products/:id — Delete product
 */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await prisma.product.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'Product deleted successfully'))
})
