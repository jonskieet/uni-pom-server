// ============================================================
// src/controllers/surveys.ts — Survey Reports controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, SurveyStatus } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

/**
 * Generate Survey Report code: SR-YYYYMMDD-XXXX
 */
function generateReportCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
  return `SR-${date}-${random}`
}

/**
 * GET /surveys — Get all survey reports
 */
export const getSurveys = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const statusParam = req.query.status as string | undefined
  const status = (statusParam && Object.values(SurveyStatus).includes(statusParam as SurveyStatus))
    ? (statusParam as SurveyStatus)
    : undefined
  const pomId = req.query.pom_id ? parseInt(req.query.pom_id as string) : undefined

  const where = {
    ...(status && { status }),
    ...(pomId   && { pom_id: pomId }),
  }

  // Khi filter theo pom_id: trả về array thẳng (không cần pagination)
  if (pomId) {
    const surveys = await prisma.surveyReport.findMany({
      where,
      include: { pom: true, creator: true, items: true },
      orderBy: { created_at: 'desc' }
    })
    return res.json(successResponse(surveys))
  }

  const [surveys, total] = await Promise.all([
    prisma.surveyReport.findMany({
      where,
      include: { pom: true, creator: true, items: true },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    prisma.surveyReport.count({ where })
  ])

  res.json(
    successResponse({
      data: surveys,
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
 * GET /surveys/:id — Get survey report by ID
 */
export const getSurveyById = asyncHandler(async (req: Request, res: Response) => {
  const survey = await prisma.surveyReport.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: { pom: true, creator: true, items: { include: { product: true } } }
  })

  res.json(successResponse(survey))
})

/**
 * POST /surveys — Create survey report
 */
export const createSurvey = asyncHandler(async (req: Request, res: Response) => {
  const { pom_id, report_type, project_name, customer_name, site_address, surveyor_name, survey_date, general_note } = req.body
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(401, 'Unauthorized')
  }

  if (!pom_id || !project_name) {
    throw new AppError(400, 'pom_id and project_name are required')
  }

  const report_code = generateReportCode()

  const survey = await prisma.surveyReport.create({
    data: {
      report_code,
      report_type: report_type || 'LAN',
      pom_id,
      project_name,
      customer_name,
      site_address,
      survey_date:  survey_date  ?? null,
      surveyor_name,
      general_note: general_note ?? null,
      created_by: userId,
      status: 'draft'
    },
    include: { pom: true, creator: true, items: true }
  })

  res.status(201).json(successResponse(survey))
})

/**
 * PUT /surveys/:id — Update survey report
 */
export const updateSurvey = asyncHandler(async (req: Request, res: Response) => {
  const { report_type, project_name, customer_name, site_address, survey_date, surveyor_name, status, general_note } =
    req.body

  const survey = await prisma.surveyReport.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(report_type && { report_type }),
      ...(project_name && { project_name }),
      ...(customer_name !== undefined && { customer_name }),
      ...(site_address !== undefined && { site_address }),
      ...(survey_date !== undefined && { survey_date }),
      ...(surveyor_name !== undefined && { surveyor_name }),
      ...(status && { status }),
      ...(general_note !== undefined && { general_note })
    },
    include: { pom: true, creator: true, items: true }
  })

  res.json(successResponse(survey))
})

/**
 * POST /surveys/:id/items — Add item to survey
 */
export const addSurveyItem = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const { product_id, product_name, quantity_proposed, quantity_actual, unit, location, condition_note } = req.body

  if (!product_name) {
    throw new AppError(400, 'product_name is required')
  }

  const item = await prisma.surveyItem.create({
    data: {
      report_id: reportId,
      product_id,
      product_name,
      quantity_proposed: quantity_proposed || 0,
      quantity_actual: quantity_actual || 0,
      unit: unit || 'Cái',
      location,
      condition_note
    },
    include: { product: true }
  })

  res.status(201).json(successResponse(item))
})

/**
 * PUT /surveys/items/:itemId — Update survey item
 */
export const updateSurveyItem = asyncHandler(async (req: Request, res: Response) => {
  const itemId = parseInt(req.params.itemId)
  const { quantity_proposed, quantity_actual, unit, location, condition_note } = req.body

  const item = await prisma.surveyItem.update({
    where: { id: itemId },
    data: {
      ...(quantity_proposed !== undefined && { quantity_proposed }),
      ...(quantity_actual !== undefined && { quantity_actual }),
      ...(unit && { unit }),
      ...(location !== undefined && { location }),
      ...(condition_note !== undefined && { condition_note })
    },
    include: { product: true }
  })

  res.json(successResponse(item))
})

/**
 * DELETE /surveys/items/:itemId — Delete survey item
 */
export const deleteSurveyItem = asyncHandler(async (req: Request, res: Response) => {
  const itemId = parseInt(req.params.itemId)

  await prisma.surveyItem.delete({ where: { id: itemId } })

  res.json(successResponse(null, 'Survey item deleted successfully'))
})

/**
 * DELETE /surveys/:id — Delete survey report
 */
export const deleteSurvey = asyncHandler(async (req: Request, res: Response) => {
  await prisma.surveyReport.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'Survey deleted successfully'))
})

/**
 * PUT /surveys/:id/items — Bulk upsert items (replace all)
 */
export const upsertSurveyItems = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const { items } = req.body

  if (!Array.isArray(items)) {
    throw new AppError(400, 'items must be an array')
  }

  await prisma.$transaction([
    prisma.surveyItem.deleteMany({ where: { report_id: reportId } }),
    prisma.surveyItem.createMany({
      data: items.map((item: any, idx: number) => ({
        report_id:         reportId,
        product_id:        item.product_id ?? null,
        product_name:      item.product_name ?? '',
        quantity_proposed: Number(item.quantity_proposed) || 0,
        quantity_actual:   Number(item.quantity_actual) || 0,
        unit:              item.unit ?? 'Cái',
        location:          item.location ?? null,
        condition_note:    item.condition_note ?? null,
      })),
    }),
  ])

  const survey = await prisma.surveyReport.findUnique({
    where: { id: reportId },
    include: { pom: true, creator: true, items: { include: { product: true } } },
  })

  res.json(successResponse(survey, `Đã cập nhật items`))
})
