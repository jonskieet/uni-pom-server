// ============================================================
// src/controllers/admin.ts — Dashboard giám sát cho Admin (Sếp)
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

// ── GET /admin/dashboard — Tổng quan nhanh ────────────────────

export const getDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalPoms,
    byStatus,
    closedWon30d,
    closedLost30d,
    sentToClient30d,
    stuckSubmitted,
    stuckPricing,
    stuckNegotiating,
    revisionStats,
    topRevisioned,
  ] = await Promise.all([
    // Tổng BOM
    prisma.pom.count(),

    // Số lượng theo trạng thái
    prisma.pom.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // Chốt được trong 30 ngày
    prisma.pom.count({
      where: { status: 'closed_won', closed_at: { gte: thirtyDaysAgo } },
    }),

    // Không chốt trong 30 ngày
    prisma.pom.count({
      where: { status: 'closed_lost', closed_at: { gte: thirtyDaysAgo } },
    }),

    // Đã gửi KH trong 30 ngày
    prisma.auditLog.count({
      where: { action: 'sent_to_client', created_at: { gte: thirtyDaysAgo } },
    }),

    // Tắc nghẽn: chờ TP duyệt > 3 ngày
    prisma.pom.findMany({
      where: {
        status: 'submitted',
        updated_at: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      },
      include: {
        creator: { select: { id: true, full_name: true } },
      },
      orderBy: { updated_at: 'asc' },
    }),

    // Tắc nghẽn: chờ định giá > 2 ngày
    prisma.pom.findMany({
      where: {
        status: { in: ['tp_approved', 'revision_price'] },
        updated_at: { lt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
      },
      include: {
        creator: { select: { id: true, full_name: true } },
        saleAdmin: { select: { id: true, full_name: true } },
      },
      orderBy: { updated_at: 'asc' },
    }),

    // Tắc nghẽn: negotiating > 7 ngày
    prisma.pom.findMany({
      where: {
        status: 'negotiating',
        updated_at: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        assignedSale: { select: { id: true, full_name: true } },
      },
      orderBy: { updated_at: 'asc' },
    }),

    // Thống kê revision
    prisma.pom.aggregate({
      _avg: { revision_count: true },
      _max: { revision_count: true },
      _sum: { revision_count: true },
    }),

    // BOM bị sửa nhiều nhất
    prisma.pom.findMany({
      where: { revision_count: { gt: 0 } },
      orderBy: { revision_count: 'desc' },
      take: 5,
      select: {
        id: true,
        pom_code: true,
        project_name: true,
        customer_name: true,
        status: true,
        revision_count: true,
      },
    }),
  ])

  // Tỉ lệ chốt
  const closeRate = sentToClient30d > 0
    ? Math.round((closedWon30d / sentToClient30d) * 100 * 10) / 10
    : null

  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count.id]))

  res.json(successResponse({
    summary: {
      total_poms: totalPoms,
      close_rate_30d_pct: closeRate,
      closed_won_30d: closedWon30d,
      closed_lost_30d: closedLost30d,
      sent_to_client_30d: sentToClient30d,
    },
    by_status: statusMap,
    alerts: {
      stuck_waiting_tp: stuckSubmitted.map((p) => ({
        pom_id: p.id,
        pom_code: p.pom_code,
        project_name: p.project_name,
        tech_name: (p as any).creator?.full_name,
        waiting_since: p.updated_at,
        days_waiting: Math.floor((now.getTime() - p.updated_at.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      stuck_waiting_price: stuckPricing.map((p) => ({
        pom_id: p.id,
        pom_code: p.pom_code,
        project_name: p.project_name,
        sale_admin_name: (p as any).saleAdmin?.full_name ?? 'Chưa giao',
        waiting_since: p.updated_at,
        days_waiting: Math.floor((now.getTime() - p.updated_at.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      stuck_negotiating: stuckNegotiating.map((p) => ({
        pom_id: p.id,
        pom_code: p.pom_code,
        project_name: p.project_name,
        sale_name: (p as any).assignedSale?.full_name ?? 'Chưa giao',
        waiting_since: p.updated_at,
        days_waiting: Math.floor((now.getTime() - p.updated_at.getTime()) / (1000 * 60 * 60 * 24)),
      })),
    },
    revision_stats: {
      avg_per_pom: Math.round((revisionStats._avg.revision_count ?? 0) * 10) / 10,
      max: revisionStats._max.revision_count ?? 0,
      total: revisionStats._sum.revision_count ?? 0,
      top_revisioned: topRevisioned,
    },
  }))
})

// ── GET /admin/timeline — Timeline từng dự án ─────────────────

export const getPomTimeline = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.pomId)

  const [pom, auditLogs] = await Promise.all([
    prisma.pom.findUniqueOrThrow({
      where: { id: pomId },
      include: {
        creator: { select: { id: true, full_name: true, role: true } },
        reviewer: { select: { id: true, full_name: true, role: true } },
        assignedSale: { select: { id: true, full_name: true, role: true } },
        saleAdmin: { select: { id: true, full_name: true, role: true } },
        solution: true,
        survey: { select: { id: true, report_code: true, status: true, survey_date: true } },
        items: {
          include: { product: { select: { id: true, name: true, part_number: true } } },
          orderBy: { sort_order: 'asc' },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { pom_id: pomId },
      include: { actor: { select: { id: true, full_name: true, role: true } } },
      orderBy: { created_at: 'asc' },
    }),
  ])

  // Tính thời gian từng giai đoạn
  const stages = [
    { action: 'created',        label: 'Tạo BOM' },
    { action: 'submitted',      label: 'Nộp lên TP KT' },
    { action: 'tp_approved',    label: 'TP KT duyệt' },
    { action: 'pricing_done',   label: 'Sale Admin định giá' },
    { action: 'sent_to_client', label: 'Gửi Khách hàng' },
    { action: 'closed_won',     label: 'Chốt thành công' },
    { action: 'closed_lost',    label: 'Không chốt' },
  ]

  const timeline = stages.map((stage) => {
    const log = auditLogs.find((l) => l.action === stage.action)
    return {
      stage: stage.action,
      label: stage.label,
      completed: !!log,
      actor: log?.actor ?? null,
      timestamp: log?.created_at ?? null,
      note: log?.note ?? null,
    }
  })

  // Tính tổng thời gian
  const firstLog = auditLogs[0]
  const lastLog = auditLogs[auditLogs.length - 1]
  const totalDays = firstLog && lastLog
    ? Math.round((lastLog.created_at.getTime() - firstLog.created_at.getTime()) / (1000 * 60 * 60 * 24) * 10) / 10
    : null

  res.json(successResponse({
    pom,
    timeline,
    audit_logs: auditLogs,
    meta: {
      total_days: totalDays,
      revision_count: pom.revision_count,
      return_reasons: auditLogs
        .filter((l) => l.note && ['tp_returned', 'return_to_price', 'return_to_tech'].includes(l.action))
        .map((l) => ({ action: l.action, note: l.note, actor: l.actor, at: l.created_at })),
    },
  }))
})

// ── GET /admin/kpi — KPI nhân sự ─────────────────────────────

export const getKpi = asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: {
      id: true,
      full_name: true,
      role: true,
    },
  })

  const kpiData = await Promise.all(
    users.map(async (u) => {
      const [bomsCreated, auditActions] = await Promise.all([
        // Kỹ thuật: BOM đã tạo
        prisma.pom.count({
          where: { created_by: u.id, created_at: { gte: since } },
        }),
        // Các action của user trong kỳ
        prisma.auditLog.groupBy({
          by: ['action'],
          where: { actor_id: u.id, created_at: { gte: since } },
          _count: { id: true },
        }),
      ])

      const actionMap = Object.fromEntries(auditActions.map((a) => [a.action, a._count.id]))

      return {
        user_id: u.id,
        full_name: u.full_name,
        role: u.role,
        metrics: {
          boms_created: bomsCreated,
          boms_approved: actionMap['tp_approved'] ?? 0,
          boms_returned: actionMap['tp_returned'] ?? 0,
          boms_priced: actionMap['pricing_done'] ?? 0,
          boms_sent: actionMap['sent_to_client'] ?? 0,
          boms_closed_won: actionMap['closed_won'] ?? 0,
          boms_closed_lost: actionMap['closed_lost'] ?? 0,
          price_revisions: actionMap['price_revised'] ?? 0,
          tech_revisions: actionMap['tech_revised'] ?? 0,
        },
      }
    })
  )

  res.json(successResponse({ period_days: days, since, kpi: kpiData }))
})

// ── GET /admin/poms — Danh sách tất cả BOM với filter nâng cao

export const getAllPoms = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
  const skip = (page - 1) * limit
  const status = req.query.status as string | undefined
  const techId = req.query.tech_id ? parseInt(req.query.tech_id as string) : undefined
  const saleId = req.query.sale_id ? parseInt(req.query.sale_id as string) : undefined
  const isStuck = req.query.stuck === 'true'

  const now = new Date()
  let stuckFilter = {}
  if (isStuck) {
    stuckFilter = {
      OR: [
        {
          status: 'submitted',
          updated_at: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
        },
        {
          status: { in: ['tp_approved', 'revision_price'] },
          updated_at: { lt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
        },
        {
          status: 'negotiating',
          updated_at: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      ],
    }
  }

  const where = {
    ...(status && { status }),
    ...(techId && { created_by: techId }),
    ...(saleId && { assigned_sale_id: saleId }),
    ...stuckFilter,
  }

  const [poms, total] = await Promise.all([
    prisma.pom.findMany({
      where,
      include: {
        creator: { select: { id: true, full_name: true } },
        reviewer: { select: { id: true, full_name: true } },
        assignedSale: { select: { id: true, full_name: true } },
        saleAdmin: { select: { id: true, full_name: true } },
        solution: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      skip,
      take: limit,
      orderBy: { updated_at: 'desc' },
    }),
    prisma.pom.count({ where }),
  ])

  const enriched = poms.map((p) => ({
    ...p,
    days_in_current_status: Math.floor(
      (now.getTime() - p.updated_at.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }))

  res.json(successResponse({ data: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }))
})

// ── GET /admin/price-history — Lịch sử thay đổi giá BOM ──────

export const getPriceHistory = asyncHandler(async (req: Request, res: Response) => {
  const pomId = req.query.pom_id ? parseInt(req.query.pom_id as string) : undefined
  const actorId = req.query.actor_id ? parseInt(req.query.actor_id as string) : undefined
  const since = req.query.since ? new Date(req.query.since as string) : undefined

  const logs = await prisma.auditLog.findMany({
    where: {
      action: { in: ['pricing_done', 'price_revised'] },
      ...(pomId && { pom_id: pomId }),
      ...(actorId && { actor_id: actorId }),
      ...(since && { created_at: { gte: since } }),
    },
    include: {
      pom: { select: { id: true, pom_code: true, project_name: true } },
      actor: { select: { id: true, full_name: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  res.json(successResponse(logs))
})
