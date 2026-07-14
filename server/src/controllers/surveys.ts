// ============================================================
// src/controllers/surveys.ts — Survey Reports controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, SurveyStatus } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

// ── Prisma singleton (shared connection pool) ────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

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

// Include dùng chung khi trả về items — luôn kèm pomItem.product để FE đọc
// tên/số lượng đề xuất LIVE từ POM, không đọc từ cột lưu trùng nữa.
const SURVEY_ITEMS_INCLUDE = {
  items: {
    include: { product: true, pomItem: { include: { product: true } } },
    orderBy: { sort_order: 'asc' as const },
  },
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
      include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE },
      orderBy: { created_at: 'desc' }
    })
    return res.json(successResponse(surveys))
  }

  const [surveys, total] = await Promise.all([
    prisma.surveyReport.findMany({
      where,
      include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE },
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
    include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE }
  })

  // BUG FIX: Include form template schema để frontend có thể map field key → label.
  // getSurveyById không có relation tới FormTemplate nên phải query riêng.
  let formTemplate = null
  if (survey.form_template_id) {
    formTemplate = await prisma.formTemplate.findUnique({
      where: { id: survey.form_template_id },
      select: { id: true, name: true, schema: true },
    })
  }

  res.json(successResponse({ ...survey, formTemplate }))
})

/**
 * POST /surveys — Create survey report
 *
 * Tự động snapshot danh sách thiết bị từ POM ngay lúc tạo phiếu (nếu POM
 * đã có item) — đây là bước "đồng bộ lần đầu". Sau đó nếu kỹ thuật sửa
 * thiết bị trong POM, phiếu sẽ hiện banner lệch dữ liệu (so items_updated_at
 * của POM với items_synced_at của phiếu) và có nút "Đồng bộ lại từ POM"
 * — không tự động ghi đè để không mất dữ liệu khảo sát thực tế đã nhập.
 */
export const createSurvey = asyncHandler(async (req: Request, res: Response) => {
  const {
    pom_id, report_type, project_name, customer_name,
    site_address, surveyor_name, survey_date, general_note,
    form_template_id, form_data, image_url,
  } = req.body
  const userId = req.user?.id

  if (!userId) throw new AppError(401, 'Unauthorized')
  if (!pom_id || !project_name) throw new AppError(400, 'pom_id and project_name are required')

  const report_code = generateReportCode()
  const pomIdNum = Number(pom_id)

  const pomItems = await prisma.pomItem.findMany({
    where: { pom_id: pomIdNum },
    orderBy: { sort_order: 'asc' },
  })

  const survey = await prisma.$transaction(async (tx) => {
    const created = await tx.surveyReport.create({
      data: {
        report_code,
        report_type:      report_type || 'site_survey',
        pom_id:            pomIdNum,
        project_name,
        customer_name:    customer_name    ?? null,
        site_address:     site_address     ?? null,
        survey_date:      survey_date      ?? null,
        surveyor_name:    surveyor_name    ?? null,
        general_note:     general_note     ?? null,
        image_url:        image_url        ?? null,
        form_template_id: form_template_id ? parseInt(form_template_id) : null,
        form_data:        form_data        ?? null,
        created_by: userId,
        status: 'draft',
        // POM chưa có item nào vẫn cho tạo phiếu bình thường — kỹ thuật
        // có thể thêm thiết bị thủ công sau, hoặc đồng bộ khi POM có item.
        items_synced_at: pomItems.length > 0 ? new Date() : null,
      },
    })

    if (pomItems.length > 0) {
      await tx.surveyItem.createMany({
        data: pomItems.map((pi, idx) => ({
          report_id: created.id,
          pom_item_id: pi.id,
          product_id: pi.product_id,
          quantity_actual: pi.quantity,
          unit: 'Cái',
          sort_order: idx,
        })),
      })
    }

    return tx.surveyReport.findUniqueOrThrow({
      where: { id: created.id },
      include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE },
    })
  })

  res.status(201).json(successResponse(survey))
})

/**
 * PUT /surveys/:id — Update survey report
 */
export const updateSurvey = asyncHandler(async (req: Request, res: Response) => {
  const {
    report_type, project_name, customer_name, site_address,
    survey_date, surveyor_name, status, general_note, image_url,
    form_data,  // ← FIX: field này bị thiếu trước đây, khiến ảnh và dữ liệu form không bao giờ được lưu
  } = req.body

  const survey = await prisma.surveyReport.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(report_type    && { report_type }),
      ...(project_name   && { project_name }),
      ...(customer_name  !== undefined && { customer_name }),
      ...(site_address   !== undefined && { site_address }),
      ...(survey_date    !== undefined && { survey_date }),
      ...(surveyor_name  !== undefined && { surveyor_name }),
      ...(status         && { status }),
      ...(general_note   !== undefined && { general_note }),
      ...(image_url      !== undefined && { image_url }),
      ...(form_data      !== undefined && { form_data }),  // ← FIX: lưu form_data (bao gồm URL ảnh)
    },
    include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE }
  })

  res.json(successResponse(survey))
})

/**
 * GET /surveys/:id/sync-diff — Xem trước phần lệch dữ liệu giữa phiếu và POM
 *
 * So khớp bằng product_id (KHÔNG dùng pom_item_id để so khớp) vì POM item
 * có thể bị xoá/tạo lại id mới khi kỹ thuật lưu danh sách thiết bị (upsert
 * kiểu xoá-toàn-bộ-tạo-lại) — product_id mới là định danh ổn định.
 */
export const getSurveySyncDiff = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)

  const survey = await prisma.surveyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { pom: true, items: true },
  })

  const pomItems = await prisma.pomItem.findMany({
    where: { pom_id: survey.pom_id },
    include: { product: true },
    orderBy: { sort_order: 'asc' },
  })

  const activeItems = survey.items.filter(i => !i.is_removed_from_pom)
  const linkedProductIds = new Set(activeItems.filter(i => i.product_id != null).map(i => i.product_id))
  const pomProductIds    = new Set(pomItems.map(pi => pi.product_id))

  const added = pomItems
    .filter(pi => !linkedProductIds.has(pi.product_id))
    .map(pi => ({
      pom_item_id: pi.id,
      product_id: pi.product_id,
      product_name: pi.product.name,
      quantity: pi.quantity,
    }))

  const removed = activeItems
    .filter(i => i.product_id != null && !pomProductIds.has(i.product_id))
    .map(i => ({
      survey_item_id: i.id,
      product_id: i.product_id,
    }))

  res.json(successResponse({
    has_changes: added.length > 0 || removed.length > 0,
    added,
    removed,
    pom_items_updated_at: survey.pom.items_updated_at,
    items_synced_at: survey.items_synced_at,
  }))
})

/**
 * POST /surveys/:id/sync — Đồng bộ danh sách thiết bị từ POM
 *
 * Mặc định (accept_all=true, không truyền gì khác) áp dụng toàn bộ thay đổi
 * phát hiện được từ /sync-diff. Có thể truyền add_product_ids /
 * remove_survey_item_ids để áp dụng chọn lọc sau khi kỹ thuật xem trước diff.
 * Thiết bị bị "xoá" chỉ đánh dấu is_removed_from_pom (không xoá cứng) để
 * giữ lại số liệu khảo sát thực tế đã ghi nhận trước đó.
 */
export const syncSurveyItems = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const { accept_all, add_product_ids, remove_survey_item_ids } = req.body
  const acceptAll = accept_all !== false && !add_product_ids && !remove_survey_item_ids

  const survey = await prisma.surveyReport.findUniqueOrThrow({ where: { id: reportId } })
  const pomItems = await prisma.pomItem.findMany({ where: { pom_id: survey.pom_id } })
  const surveyItems = await prisma.surveyItem.findMany({ where: { report_id: reportId } })

  const linkedProductIds = new Set(
    surveyItems.filter(i => !i.is_removed_from_pom && i.product_id != null).map(i => i.product_id)
  )
  const pomProductIds = new Set(pomItems.map(pi => pi.product_id))

  const addProductIdSet = add_product_ids ? new Set<number>(add_product_ids.map(Number)) : null
  const removeItemIdSet = remove_survey_item_ids ? new Set<number>(remove_survey_item_ids.map(Number)) : null

  const toAdd = pomItems.filter(pi =>
    !linkedProductIds.has(pi.product_id) && (acceptAll || addProductIdSet?.has(pi.product_id))
  )

  const toRemove = surveyItems.filter(i =>
    !i.is_removed_from_pom && i.product_id != null && !pomProductIds.has(i.product_id) &&
    (acceptAll || removeItemIdSet?.has(i.id))
  )

  // Trỏ lại pom_item_id cho các item vẫn còn sản phẩm trong POM nhưng id POM
  // item đã đổi (do lưu POM bằng cơ chế xoá-toàn-bộ-tạo-lại)
  const stillPresent = surveyItems.filter(i =>
    !i.is_removed_from_pom && i.product_id != null && pomProductIds.has(i.product_id)
  )

  const maxSortOrder = surveyItems.reduce((m, i) => Math.max(m, i.sort_order), -1)

  await prisma.$transaction([
    ...toAdd.map((pi, idx) => prisma.surveyItem.create({
      data: {
        report_id: reportId,
        pom_item_id: pi.id,
        product_id: pi.product_id,
        quantity_actual: pi.quantity,
        unit: 'Cái',
        sort_order: maxSortOrder + 1 + idx,
      },
    })),
    ...toRemove.map(i => prisma.surveyItem.update({
      where: { id: i.id },
      data: { is_removed_from_pom: true },
    })),
    ...stillPresent.map(i => {
      const match = pomItems.find(pi => pi.product_id === i.product_id)
      return prisma.surveyItem.update({
        where: { id: i.id },
        data: { pom_item_id: match?.id ?? null },
      })
    }),
    prisma.surveyReport.update({ where: { id: reportId }, data: { items_synced_at: new Date() } }),
  ])

  const updated = await prisma.surveyReport.findUnique({
    where: { id: reportId },
    include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE },
  })

  res.json(successResponse(updated, `Đã đồng bộ: +${toAdd.length} thiết bị mới, -${toRemove.length} thiết bị đã gỡ khỏi POM`))
})

/**
 * POST /surveys/:id/items — Add item to survey
 *
 * CHỈ dùng để thêm thiết bị KHÔNG có trong POM (phát sinh thực tế ngoài dự
 * trù). Thiết bị lấy từ POM phải qua /sync — không thêm tay ở đây để tránh
 * tạo ra 2 dòng cho cùng 1 sản phẩm.
 */
export const addSurveyItem = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const { product_id, product_name, quantity_actual, unit, location, condition_note } = req.body

  if (!product_name && !product_id) {
    throw new AppError(400, 'product_name or product_id is required')
  }

  const item = await prisma.surveyItem.create({
    data: {
      report_id: reportId,
      pom_item_id: null,
      product_id: product_id ?? null,
      product_name: product_name ?? null,
      quantity_actual: quantity_actual || 0,
      unit: unit || 'Cái',
      location,
      condition_note,
    },
    include: { product: true, pomItem: { include: { product: true } } },
  })

  res.status(201).json(successResponse(item))
})

/**
 * PUT /surveys/items/:itemId — Update survey item
 *
 * Chỉ cho sửa các trường thuộc về khảo sát thực tế (số lượng thực tế, vị
 * trí, tình trạng). Tên/số lượng đề xuất của thiết bị lấy từ POM là read-only
 * ở đây — phải sửa trong POM rồi bấm "Đồng bộ" chứ không sửa trực tiếp.
 */
export const updateSurveyItem = asyncHandler(async (req: Request, res: Response) => {
  const itemId = parseInt(req.params.itemId)
  const { quantity_actual, unit, location, condition_note } = req.body

  const item = await prisma.surveyItem.update({
    where: { id: itemId },
    data: {
      ...(quantity_actual !== undefined && { quantity_actual }),
      ...(unit && { unit }),
      ...(location !== undefined && { location }),
      ...(condition_note !== undefined && { condition_note })
    },
    include: { product: true, pomItem: { include: { product: true } } },
  })

  res.json(successResponse(item))
})

/**
 * DELETE /surveys/items/:itemId — Delete survey item
 *
 * Xoá cứng khỏi phiếu (dùng cho item thêm tay). Với item liên kết POM, xoá
 * cứng vẫn được phép (VD: thiết bị đề xuất nhưng khảo sát thấy không cần
 * khảo sát) — nhưng lưu ý lần "Đồng bộ" sau có thể thêm lại nếu sản phẩm
 * đó vẫn còn trong POM. Muốn loại vĩnh viễn, sửa trong POM rồi đồng bộ.
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
 *
 * Giữ lại cho phiếu kiểu cũ (LAN form nhập tay) — CHỈ nên dùng cho thiết bị
 * KHÔNG liên kết POM (pom_item_id luôn null qua đường này). Phiếu mới nên
 * dùng /sync + /items (POST) thay vì bulk-replace để không xoá mất liên kết
 * pom_item_id của các dòng đã đồng bộ.
 */
export const upsertSurveyItems = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const { items } = req.body

  if (!Array.isArray(items)) {
    throw new AppError(400, 'items must be an array')
  }

  await prisma.$transaction([
    // Chỉ xoá các item KHÔNG liên kết POM — không đụng tới item đã đồng bộ
    // từ POM (pom_item_id != null) để tránh mất liên kết khi bulk-replace.
    prisma.surveyItem.deleteMany({ where: { report_id: reportId, pom_item_id: null } }),
    prisma.surveyItem.createMany({
      data: items.map((item: any) => ({
        report_id:         reportId,
        pom_item_id:       null,
        product_id:        item.product_id ?? null,
        product_name:      item.product_name ?? '',
        quantity_actual:   Number(item.quantity_actual ?? item.quantity) || 0,
        unit:              item.unit ?? 'Cái',
        location:          item.location      ?? null,
        condition_note:    item.condition_note ?? null,
        sort_order:        Number(item.sort_order) || 0,
      })),
    }),
  ])

  const survey = await prisma.surveyReport.findUnique({
    where: { id: reportId },
    include: { pom: true, creator: true, ...SURVEY_ITEMS_INCLUDE },
  })

  res.json(successResponse(survey, `Đã cập nhật items`))
})
