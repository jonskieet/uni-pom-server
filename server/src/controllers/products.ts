// ============================================================
// src/controllers/products.ts — Products controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, Prisma, ProductStatus } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * GET /products — Lấy danh sách sản phẩm có phân trang & filter
 * ?search=      tìm theo tên / part_number / mô tả
 * ?brand_id=    lọc theo thương hiệu
 * ?category_id= lọc theo danh mục (bao gồm cả danh mục con)
 * ?status=      active | discontinued | draft
 * ?page=        trang (mặc định 1)
 * ?limit=       số bản ghi/trang (mặc định 20, tối đa 100)
 */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const page       = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit      = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip       = (page - 1) * limit
  const search     = req.query.search      as string | undefined
  const brandId    = req.query.brand_id    ? parseInt(req.query.brand_id as string)    : undefined
  const categoryId = req.query.category_id ? parseInt(req.query.category_id as string) : undefined
  const statusParam = req.query.status as string | undefined
  const status = (statusParam && Object.values(ProductStatus).includes(statusParam as ProductStatus))
    ? (statusParam as ProductStatus)
    : undefined

  // Nếu lọc theo danh mục, bao gồm cả các danh mục con
  let categoryIds: number[] | undefined
  if (categoryId) {
    const children = await prisma.category.findMany({
      where: { parent_id: categoryId },
      select: { id: true }
    })
    categoryIds = [categoryId, ...children.map(c => c.id)]
  }

  const where: Prisma.ProductWhereInput = {
    ...(search && {
      OR: [
        { name:        { contains: search, mode: 'insensitive' } },
        { part_number: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { origin:      { contains: search, mode: 'insensitive' } }
      ]
    }),
    ...(brandId    && { brand_id: brandId }),
    ...(categoryIds ? { category_id: { in: categoryIds } } : {}),
    ...(status     && { status })
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { brand: true, category: { include: { parent: { select: { id: true, name: true } } } } },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    prisma.product.count({ where })
  ])

  res.json(successResponse({
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  }))
})

/**
 * GET /products/:id
 */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: {
      brand:    true,
      category: { include: { parent: { select: { id: true, name: true } } } },
      priceHistory: { orderBy: { changed_at: 'desc' }, take: 10 }
    }
  })

  res.json(successResponse(product))
})

/**
 * POST /products — Tạo sản phẩm (admin / technical_lead)
 */
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const {
    brand_id, category_id, name, part_number,
    unit, price, vat_rate, status,
    description, spec, origin, warranty, image_path,
    sell_price
  } = req.body

  if (!brand_id || !category_id || !name) {
    throw new AppError(400, 'brand_id, category_id và name là bắt buộc')
  }

  const product = await prisma.product.create({
    data: {
      brand_id,
      category_id,
      name,
      part_number,
      unit:       unit     || 'Cái',
      price:      price    || 0,
      sell_price: sell_price ?? null,
      vat_rate:   vat_rate || 0.1,
      status:     status   || 'active',
      description,
      spec,
      origin,
      warranty,
      image_path,
      created_by: req.user?.id
    },
    include: { brand: true, category: true }
  })

  res.status(201).json(successResponse(product))
})

/**
 * PUT /products/:id — Cập nhật sản phẩm
 */
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const {
    brand_id, category_id, name, part_number,
    unit, price, vat_rate, status,
    description, spec, origin, warranty, image_path,
    sell_price
  } = req.body

  const id = parseInt(req.params.id)

  // Nếu giá thay đổi, ghi lịch sử
  if (price !== undefined) {
    const current = await prisma.product.findUnique({ where: { id }, select: { price: true } })
    if (current && Number(current.price) !== Number(price)) {
      await prisma.priceHistory.create({
        data: {
          product_id: id,
          old_price:  current.price,
          new_price:  price,
          changed_by: req.user?.id ?? null,
          note:       req.body._price_note || 'Cập nhật giá nhập'
        }
      })
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(brand_id    !== undefined && { brand_id }),
      ...(category_id !== undefined && { category_id }),
      ...(name        && { name }),
      ...(part_number !== undefined && { part_number }),
      ...(unit        && { unit }),
      ...(price       !== undefined && { price }),
      ...(vat_rate    !== undefined && { vat_rate }),
      ...(status      && { status }),
      ...(description !== undefined && { description }),
      ...(spec        !== undefined && { spec }),
      ...(origin      !== undefined && { origin }),
      ...(warranty    !== undefined && { warranty }),
      ...(image_path  !== undefined && { image_path }),
      ...(sell_price  !== undefined && { sell_price: sell_price === null ? null : sell_price })
    },
    include: { brand: true, category: true }
  })

  res.json(successResponse(product))
})

/**
 * DELETE /products/:id
 */
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await prisma.product.delete({ where: { id: parseInt(req.params.id) } })
  res.json(successResponse(null, 'Đã xóa sản phẩm'))
})

/**
 * GET /products/:id/price-history — Lấy lịch sử thay đổi giá nhập
 */
export const getPriceHistory = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

  const history = await prisma.priceHistory.findMany({
    where: { product_id: id },
    orderBy: { changed_at: 'desc' },
    include: {
      user: { select: { id: true, full_name: true, username: true } }
    }
  })

  const mapped = history.map(h => ({
    id:              h.id,
    product_id:      h.product_id,
    old_price:       Number(h.old_price),
    new_price:       Number(h.new_price),
    changed_by:      h.changed_by,
    changed_by_name: h.user?.full_name ?? h.user?.username ?? null,
    changed_at:      h.changed_at,
    note:            h.note,
  }))

  res.json(successResponse(mapped))
})
