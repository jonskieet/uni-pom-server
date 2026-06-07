// ============================================================
// src/controllers/poms.ts — v2
// State machine đầy đủ + ghi AuditLog mỗi chuyển trạng thái
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient, Prisma, PomStatus, AuditAction } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

// ── Prisma singleton (shared connection pool) ────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── Helpers ──────────────────────────────────────────────────

function generatePomCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `POM-${date}-${random}`
}

const POM_FULL_INCLUDE = {
  solution: true,
  creator: { select: { id: true, full_name: true, role: true } },
  reviewer: { select: { id: true, full_name: true, role: true } },
  assignedSale: { select: { id: true, full_name: true, role: true } },
  saleAdmin: { select: { id: true, full_name: true, role: true } },
  items: {
    include: { product: { include: { brand: true, category: true } } },
    orderBy: { sort_order: 'asc' as const }
  },
  survey: true,
}

/** Ghi audit log — dùng trong transaction hoặc standalone */
async function writeAuditLog(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  {
    pomId,
    actorId,
    fromStatus,
    toStatus,
    action,
    note,
    metadata,
  }: {
    pomId: number
    actorId?: number | null
    fromStatus?: PomStatus | null
    toStatus: PomStatus
    action: AuditAction
    note?: string | null
    metadata?: Record<string, unknown>
  }
) {
  return tx.auditLog.create({
    data: {
      pom_id: pomId,
      actor_id: actorId ?? null,
      from_status: fromStatus ?? null,
      to_status: toStatus,
      action,
      note: note ?? null,
      metadata: (metadata ?? Prisma.JsonNull) as any,
    },
  })
}

// ── GET /poms ─────────────────────────────────────────────────

export const getPoms = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const statusParam = req.query.status as string | undefined
  const createdBy = req.query.created_by ? parseInt(req.query.created_by as string) : undefined
  const excludeSurveyed = req.query.exclude_surveyed === 'true'
  const assignedSale   = req.query.assigned_sale_id ? parseInt(req.query.assigned_sale_id as string) : undefined
  const saleAdminId    = req.query.sale_admin_id    ? parseInt(req.query.sale_admin_id    as string) : undefined

  const status = (statusParam && Object.values(PomStatus).includes(statusParam as PomStatus))
    ? (statusParam as PomStatus)
    : undefined

  const where: Prisma.PomWhereInput = {
    ...(status && { status }),
    ...(createdBy && { created_by: createdBy }),
    ...(assignedSale && { assigned_sale_id: assignedSale }),
    ...(saleAdminId  && { sale_admin_id:    saleAdminId  }),
    ...(excludeSurveyed && { survey: null }),
  }

  const [poms, total] = await Promise.all([
    prisma.pom.findMany({
      where,
      include: POM_FULL_INCLUDE,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.pom.count({ where }),
  ])

  res.json(successResponse({ data: poms, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }))
})

// ── GET /poms/:id ──────────────────────────────────────────────

export const getPomById = asyncHandler(async (req: Request, res: Response) => {
  const pom = await prisma.pom.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    include: {
      ...POM_FULL_INCLUDE,
      auditLogs: {
        include: { actor: { select: { id: true, full_name: true, role: true } } },
        orderBy: { created_at: 'asc' },
      },
    },
  })
  res.json(successResponse(pom))
})

// ── POST /poms ─────────────────────────────────────────────────

export const createPom = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, project_name, customer_name, note, ward_id } = req.body
  const actorId = req.user!.id

  if (!project_name?.trim()) throw new AppError(400, 'project_name is required')

  const pom = await prisma.$transaction(async (tx) => {
    const created = await tx.pom.create({
      data: {
        pom_code: generatePomCode(),
        solution_id: solution_id ? parseInt(solution_id) : null,
        created_by: actorId,
        project_name: project_name.trim(),
        customer_name: customer_name?.trim() ?? null,
        note: note?.trim() ?? null,
        status: 'draft',
        ...(ward_id ? { ward_id: parseInt(ward_id) } : {}),
      },
      include: POM_FULL_INCLUDE,
    })

    await writeAuditLog(tx, {
      pomId: created.id,
      actorId,
      fromStatus: null,
      toStatus: 'draft',
      action: 'created',
    })

    return created
  })

  res.status(201).json(successResponse(pom, 'BOM đã được tạo'))
})

// ── PUT /poms/:id ──────────────────────────────────────────────

export const updatePom = asyncHandler(async (req: Request, res: Response) => {
  const { solution_id, project_name, customer_name, note } = req.body
  const pom = await prisma.pom.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(solution_id !== undefined && { solution_id: parseInt(solution_id) }),
      ...(project_name && { project_name }),
      ...(customer_name !== undefined && { customer_name }),
      ...(note !== undefined && { note }),
    },
    include: POM_FULL_INCLUDE,
  })
  res.json(successResponse(pom))
})

// ── DELETE /poms/:id ───────────────────────────────────────────

export const deletePom = asyncHandler(async (req: Request, res: Response) => {
  const pom = await prisma.pom.findUnique({ where: { id: parseInt(req.params.id) } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'draft') throw new AppError(400, 'Chỉ có thể xóa BOM đang ở trạng thái nháp')
  await prisma.pom.delete({ where: { id: parseInt(req.params.id) } })
  res.json(successResponse(null, 'POM đã được xóa'))
})

// ── PUT /poms/:id/submit — Kỹ thuật nộp BOM lên TP KT ─────────

export const submitPom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (!['draft', 'revision_tech'].includes(pom.status)) {
    throw new AppError(400, `Không thể nộp BOM ở trạng thái: ${pom.status}`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: { status: 'submitted' },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'submitted',
      action: 'submitted',
    })
    return u
  })

  res.json(successResponse(updated, 'BOM đã được nộp lên Trưởng phòng KT'))
})

// ── PUT /poms/:id/approve — TP KT duyệt BOM → tp_approved ────

export const approvePom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'submitted') {
    throw new AppError(400, 'Chỉ có thể duyệt BOM đang chờ duyệt (submitted)')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: 'tp_approved',
        reviewed_by: actorId,
        return_reason: null,
      },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'tp_approved',
      action: 'tp_approved',
    })
    return u
  })

  res.json(successResponse(updated, 'BOM đã được duyệt'))
})

// ── PUT /poms/:id/return — TP KT trả về cho Kỹ thuật ─────────

export const returnPom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { reason } = req.body

  if (!reason?.trim()) throw new AppError(400, 'reason is required')

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'submitted') {
    throw new AppError(400, 'Chỉ có thể trả về BOM đang chờ duyệt')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: 'draft',
        return_reason: reason.trim(),
        revision_count: { increment: 1 },
      },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'draft',
      action: 'tp_returned',
      note: reason.trim(),
    })
    return u
  })

  res.json(successResponse(updated, 'BOM đã được trả về cho Kỹ thuật'))
})

// ── PUT /poms/:id/price — Sale Admin định giá → pricing_done ──

export const pricePom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { assigned_sale_id, items } = req.body

  if (!assigned_sale_id) throw new AppError(400, 'assigned_sale_id (người Sale phụ trách) là bắt buộc')

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (!['tp_approved', 'revision_price'].includes(pom.status)) {
    throw new AppError(400, `BOM phải ở trạng thái tp_approved hoặc revision_price, hiện tại: ${pom.status}`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Cập nhật sale_price cho từng item nếu được truyền vào
    if (Array.isArray(items) && items.length > 0) {
      await Promise.all(
        items.map((item: { id: number; sale_price: number; note?: string }) =>
          tx.pomItem.update({
            where: { id: item.id },
            data: {
              sale_price: item.sale_price,
              ...(item.note !== undefined && { note: item.note }),
            },
          })
        )
      )
    }

    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: 'pricing_done',
        sale_admin_id: actorId,
        assigned_sale_id: parseInt(assigned_sale_id),
      },
      include: POM_FULL_INCLUDE,
    })

    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'pricing_done',
      action: pom.status === 'revision_price' ? 'price_revised' : 'pricing_done',
    })

    return u
  })

  res.json(successResponse(updated, 'BOM đã được định giá, đã giao cho Sale'))
})

// ── PUT /poms/:id/send — Sale gửi KH → sent_to_client ─────────

export const sendToClient = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'pricing_done') {
    throw new AppError(400, 'BOM phải ở trạng thái pricing_done trước khi gửi KH')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: { status: 'sent_to_client' },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'sent_to_client',
      action: 'sent_to_client',
    })
    return u
  })

  res.json(successResponse(updated, 'Đã ghi nhận gửi hồ sơ cho Khách hàng'))
})

// ── PUT /poms/:id/feedback — Sale ghi nhận phản hồi KH ────────

export const clientFeedback = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { note } = req.body

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (!['sent_to_client', 'negotiating'].includes(pom.status)) {
    throw new AppError(400, 'BOM phải đang ở giai đoạn tư vấn khách hàng')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: { status: 'negotiating', note: note ?? pom.note },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'negotiating',
      action: 'client_feedback',
      note: note ?? null,
    })
    return u
  })

  res.json(successResponse(updated, 'Đã ghi nhận phản hồi khách hàng'))
})

// ── PUT /poms/:id/return-price — Sale trả về Sale Admin sửa giá

export const returnToPrice = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { reason } = req.body

  if (!reason?.trim()) throw new AppError(400, 'reason là bắt buộc (lý do yêu cầu sửa giá)')

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'negotiating') {
    throw new AppError(400, 'Chỉ có thể trả về sửa giá khi BOM đang negotiating')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: 'revision_price',
        revision_count: { increment: 1 },
      },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'revision_price',
      action: 'return_to_price',
      note: reason.trim(),
    })
    return u
  })

  res.json(successResponse(updated, 'Đã gửi trả BOM cho Sale Admin điều chỉnh giá'))
})

// ── PUT /poms/:id/return-tech — Sale trả về Kỹ thuật sửa phương án

export const returnToTech = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { reason } = req.body

  if (!reason?.trim()) throw new AppError(400, 'reason là bắt buộc (lý do yêu cầu sửa kỹ thuật)')

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'negotiating') {
    throw new AppError(400, 'Chỉ có thể trả về sửa kỹ thuật khi BOM đang negotiating')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: 'revision_tech',
        revision_count: { increment: 1 },
      },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'revision_tech',
      action: 'return_to_tech',
      note: reason.trim(),
    })
    return u
  })

  res.json(successResponse(updated, 'Đã gửi trả BOM cho Kỹ thuật chỉnh sửa phương án'))
})

// ── PUT /poms/:id/reapprove — TP KT duyệt lại sau sửa kỹ thuật

export const reapprovePom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (pom.status !== 'submitted') {
    throw new AppError(400, 'BOM phải được Kỹ thuật nộp lại (submitted) trước khi TP KT duyệt lại')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: { status: 'tp_approved', reviewed_by: actorId, return_reason: null },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus: 'tp_approved',
      action: 'tp_reapproved',
    })
    return u
  })

  res.json(successResponse(updated, 'TP KT đã duyệt lại sau chỉnh sửa kỹ thuật'))
})

// ── PUT /poms/:id/close — Sale chốt hợp đồng ─────────────────

export const closePom = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const actorId = req.user!.id
  const { result, note } = req.body  // result: 'won' | 'lost'

  if (!['won', 'lost'].includes(result)) {
    throw new AppError(400, "result phải là 'won' hoặc 'lost'")
  }

  const pom = await prisma.pom.findUnique({ where: { id: pomId } })
  if (!pom) throw new AppError(404, 'POM không tồn tại')
  if (!['negotiating', 'sent_to_client'].includes(pom.status)) {
    throw new AppError(400, 'BOM phải đang ở giai đoạn tư vấn để chốt')
  }

  const toStatus: PomStatus = result === 'won' ? 'closed_won' : 'closed_lost'
  const action: AuditAction = result === 'won' ? 'closed_won' : 'closed_lost'

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.pom.update({
      where: { id: pomId },
      data: {
        status: toStatus,
        closed_at: new Date(),
        ...(note && { note }),
      },
      include: POM_FULL_INCLUDE,
    })
    await writeAuditLog(tx, {
      pomId,
      actorId,
      fromStatus: pom.status,
      toStatus,
      action,
      note: note ?? null,
    })
    return u
  })

  const msg = result === 'won' ? '🎉 Chốt hợp đồng thành công!' : 'Dự án đã được đóng (không chốt)'
  res.json(successResponse(updated, msg))
})

// ── POM Items ─────────────────────────────────────────────────

export const upsertPomItems = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const { items } = req.body
  if (!Array.isArray(items)) throw new AppError(400, 'items must be an array')

  const result = await prisma.$transaction([
    prisma.pomItem.deleteMany({ where: { pom_id: pomId } }),
    prisma.pomItem.createMany({
      data: items.map((item: any, idx: number) => ({
        pom_id: pomId,
        product_id: item.product_id ?? null,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        sale_price: item.sale_price != null ? Number(item.sale_price) : null,
        vat_rate: Number(item.vat_rate) ?? 0.1,
        note: item.note ?? null,
        sort_order: item.sort_order ?? idx,
      })),
    }),
  ])

  const pom = await prisma.pom.findUnique({
    where: { id: pomId },
    include: POM_FULL_INCLUDE,
  })

  res.json(successResponse(pom, `Đã cập nhật ${result[1].count} items`))
})

export const addPomItem = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const { product_id, quantity, unit_price, sale_price, vat_rate, note, sort_order } = req.body

  const item = await prisma.pomItem.create({
    data: {
      pom_id: pomId,
      product_id: parseInt(product_id),
      quantity: parseInt(quantity) || 1,
      unit_price: parseFloat(unit_price) || 0,
      sale_price: sale_price != null ? parseFloat(sale_price) : null,
      vat_rate: parseFloat(vat_rate) ?? 0.1,
      note: note ?? null,
      sort_order: sort_order ?? 0,
    },
    include: { product: { include: { brand: true, category: true } } },
  })

  res.status(201).json(successResponse(item))
})

export const updatePomItem = asyncHandler(async (req: Request, res: Response) => {
  const { quantity, unit_price, sale_price, vat_rate, note, sort_order } = req.body

  const item = await prisma.pomItem.update({
    where: { id: parseInt(req.params.itemId) },
    data: {
      ...(quantity !== undefined && { quantity: parseInt(quantity) }),
      ...(unit_price !== undefined && { unit_price: parseFloat(unit_price) }),
      ...(sale_price !== undefined && { sale_price: sale_price != null ? parseFloat(sale_price) : null }),
      ...(vat_rate !== undefined && { vat_rate: parseFloat(vat_rate) }),
      ...(note !== undefined && { note }),
      ...(sort_order !== undefined && { sort_order }),
    },
    include: { product: { include: { brand: true, category: true } } },
  })

  res.json(successResponse(item))
})

export const deletePomItem = asyncHandler(async (req: Request, res: Response) => {
  await prisma.pomItem.delete({ where: { id: parseInt(req.params.itemId) } })
  res.json(successResponse(null, 'Item đã được xóa'))
})

// ── Legacy: changePomStatus (giữ backward compat) ──────────────

export const changePomStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body
  if (!status) throw new AppError(400, 'status is required')

  const pom = await prisma.pom.update({
    where: { id: parseInt(req.params.id) },
    data: { status },
    include: POM_FULL_INCLUDE,
  })

  res.json(successResponse(pom))
})
