// ============================================================
// src/controllers/brands.ts — Brands controller
// ============================================================

import { Request, Response } from 'express'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { prisma } from '../lib/prisma'


/**
 * GET /brands — Get all brands
 */
export const getBrands = asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined
  const is_active = req.query.is_active ? req.query.is_active === 'true' : undefined

  const where = {
    ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
    ...(is_active !== undefined && { is_active })
  }

  const brands = await prisma.brand.findMany({
    where,
    orderBy: { name: 'asc' }
  })

  res.json(successResponse(brands))
})

/**
 * GET /brands/:id — Get brand by ID
 */
export const getBrandById = asyncHandler(async (req: Request, res: Response) => {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(brand))
})

/**
 * POST /brands — Create brand (admin only)
 */
export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  const { name, short_name, country, website, is_active, logo_path } = req.body

  if (!name) {
    throw new AppError(400, 'name is required')
  }

  const brand = await prisma.brand.create({
    data: {
      name,
      short_name,
      country,
      website,
      logo_path,
      is_active: is_active !== undefined ? is_active : true
    }
  })

  res.status(201).json(successResponse(brand))
})

/**
 * PUT /brands/:id — Update brand
 */
export const updateBrand = asyncHandler(async (req: Request, res: Response) => {
  const { name, short_name, country, website, is_active, logo_path } = req.body

  const brand = await prisma.brand.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name       && { name }),
      ...(short_name !== undefined && { short_name }),
      ...(country    !== undefined && { country }),
      ...(website    !== undefined && { website }),
      ...(logo_path  !== undefined && { logo_path }),
      ...(is_active  !== undefined && { is_active })
    }
  })

  res.json(successResponse(brand))
})

/**
 * DELETE /brands/:id — Delete brand
 */
export const deleteBrand = asyncHandler(async (req: Request, res: Response) => {
  await prisma.brand.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'Brand deleted successfully'))
})