// ============================================================
// server/src/controllers/workflowProgress.ts
//
// API "My Workflow Progress" – mỗi role thấy vị trí của mình
// trên luồng 5 giai đoạn theo flow_du_an_hoan_chinh.svg
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ─────────────────────────────────────────────────────────────
// Định nghĩa 5 giai đoạn + các bước con (dùng ở frontend)
// ─────────────────────────────────────────────────────────────
const STAGES = [
  {
    phase: 1,
    label: 'Khảo sát & Tạo hồ sơ',
    role: 'technical',
    steps: [
      { key: 'receive',  label: 'Nhận yêu cầu khảo sát',     role: 'technical',      triggerStatuses: ['draft'] },
      { key: 'survey',   label: 'Tiến hành khảo sát thực tế', role: 'technical',      triggerStatuses: ['draft'] },
      { key: 'create',   label: 'Tạo BOM + Báo cáo khảo sát', role: 'technical',      triggerStatuses: ['draft'] },
      { key: 'approve',  label: 'Trưởng phòng KT duyệt BOM',  role: 'technical_lead', triggerStatuses: ['submitted'] },
    ],
  },
  {
    phase: 2,
    label: 'Định giá',
    role: 'sale_admin',
    steps: [
      { key: 'price',    label: 'Sale Admin định giá BOM',     role: 'sale_admin', triggerStatuses: ['tp_approved', 'revision_price'] },
      { key: 'send_sa',  label: 'Gửi BOM hoàn chỉnh cho Sale', role: 'sale_admin', triggerStatuses: ['tp_approved'] },
    ],
  },
  {
    phase: 3,
    label: 'Tư vấn khách hàng',
    role: 'sales',
    steps: [
      { key: 'consult',  label: 'Sale tư vấn & gửi hồ sơ KH',  role: 'sales', triggerStatuses: ['pricing_done'] },
      { key: 'feedback', label: 'Ghi nhận phản hồi khách hàng', role: 'sales', triggerStatuses: ['sent_to_client', 'negotiating'] },
      { key: 'close',    label: 'Chốt hợp đồng',                role: 'sales', triggerStatuses: ['negotiating'] },
    ],
  },
  {
    phase: 4,
    label: 'Thi công',
    role: 'technical',
    steps: [
      { key: 'construct', label: 'Triển khai thi công',   role: 'technical',      triggerStatuses: ['construction'] },
      { key: 'incident',  label: 'Xử lý sự cố (nếu có)', role: 'technical_lead', triggerStatuses: ['construction'] },
    ],
  },
  {
    phase: 5,
    label: 'Nghiệm thu',
    role: 'technical',
    steps: [
      { key: 'inspect',  label: 'Nghiệm thu & kiểm tra chất lượng', role: 'technical',      triggerStatuses: ['inspection'] },
      { key: 'confirm',  label: 'Trưởng phòng xác nhận hoàn tất',   role: 'technical_lead', triggerStatuses: ['inspection'] },
    ],
  },
]

// Map status → phase (số giai đoạn hiện tại)
const STATUS_TO_PHASE: Record<string, number> = {
  draft:              1,
  submitted:          1,
  tp_approved:        2,
  pricing_done:       2,
  revision_price:     2,
  sent_to_client:     3,
  negotiating:        3,
  revision_tech:      1, // quay lại G1 để KT sửa
  closed_won:         4,
  construction:       4,
  inspection:         5,
  project_completed:  5,
  closed_lost:        3, // kết thúc tại G3
}

// Nhãn hiển thị cho từng status
const STATUS_LABEL: Record<string, string> = {
  draft:             'Đang soạn BOM',
  submitted:         'Chờ TP KT duyệt',
  tp_approved:       'Chờ Sale Admin định giá',
  pricing_done:      'Chờ Sale gửi KH',
  revision_price:    'Sale Admin đang sửa giá',
  sent_to_client:    'Đã gửi KH, chờ phản hồi',
  negotiating:       'Đang thương lượng',
  revision_tech:     'KT đang sửa phương án',
  closed_won:        'Đã chốt – chuẩn bị thi công',
  construction:      'Đang thi công',
  inspection:        'Đang nghiệm thu',
  project_completed: 'Hoàn tất dự án ✓',
  closed_lost:       'Không chốt được',
}

// ─────────────────────────────────────────────────────────────
// GET /api/workflows/my-progress
// Trả về danh sách BOM mà user đang có việc cần làm,
// kèm thông tin stage + next action
// ─────────────────────────────────────────────────────────────
export const getMyProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id
  const userRole = (req as any).user?.role

  if (!userId) throw new AppError(401, 'Chưa xác thực')

  // Điều kiện lọc theo role
  let roleFilter = ''
  const params: unknown[] = [userId]

  if (userRole === 'technical') {
    // KT thấy BOM mình tạo, còn đang active (không phải closed_lost/project_completed)
    roleFilter = `p.created_by = $1 AND p.status NOT IN ('closed_lost','project_completed')`
  } else if (userRole === 'technical_lead') {
    // TP KT thấy BOM đang chờ mình duyệt hoặc đang thi công/nghiệm thu
    roleFilter = `p.status IN ('submitted','revision_tech','construction','inspection')`
    params.pop() // không dùng userId filter
    params.push(userId) // vẫn push để $1 có giá trị (dùng cho created check)
    roleFilter = `p.status IN ('submitted','revision_tech','construction','inspection') OR (p.reviewed_by = $1 AND p.status IN ('closed_won','project_completed'))`
  } else if (userRole === 'sale_admin') {
    roleFilter = `p.status IN ('tp_approved','revision_price') OR (p.sale_admin_id = $1 AND p.status = 'pricing_done')`
  } else if (userRole === 'sales') {
    roleFilter = `p.assigned_sale_id = $1 AND p.status NOT IN ('draft','submitted','tp_approved','closed_lost','project_completed')`
  } else if (userRole === 'admin') {
    // Admin thấy tất cả đang in-progress
    roleFilter = `p.status NOT IN ('project_completed','closed_lost')`
    params.pop()
    params.push(1) // dummy
    roleFilter = `p.status NOT IN ('project_completed','closed_lost')`
  } else {
    return res.json(successResponse([]))
  }

  const sql = `
    SELECT
      p.id,
      p.pom_code,
      p.project_name,
      p.customer_name,
      p.status,
      p.revision_count,
      p.return_reason,
      p.created_at,
      p.updated_at,
      u_creator.full_name   AS creator_name,
      u_reviewer.full_name  AS reviewer_name,
      u_sale.full_name      AS sale_name,
      u_sa.full_name        AS sale_admin_name,
      sr.status             AS survey_status,
      -- Số log thi công
      COALESCE((
        SELECT COUNT(*) FROM pom_construction_logs pcl WHERE pcl.pom_id = p.id
      ), 0)::int AS construction_log_count,
      -- Incident chưa resolved
      COALESCE((
        SELECT COUNT(*) FROM pom_construction_logs pcl
        WHERE pcl.pom_id = p.id AND pcl.log_type = 'incident'
          AND NOT EXISTS (
            SELECT 1 FROM pom_construction_logs r
            WHERE r.pom_id = p.id AND r.log_type = 'resolved'
              AND r.created_at > pcl.created_at
          )
      ), 0)::int AS open_incidents
    FROM poms p
    LEFT JOIN users u_creator   ON u_creator.id  = p.created_by
    LEFT JOIN users u_reviewer  ON u_reviewer.id = p.reviewed_by
    LEFT JOIN users u_sale      ON u_sale.id     = p.assigned_sale_id
    LEFT JOIN users u_sa        ON u_sa.id       = p.sale_admin_id
    LEFT JOIN survey_reports sr ON sr.pom_id     = p.id
    WHERE ${roleFilter}
    ORDER BY p.updated_at DESC
    LIMIT 50
  `

  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)

  // Enrich với stage info
  const enriched = rows.map(pom => {
    const currentPhase = STATUS_TO_PHASE[pom.status] ?? 1
    const statusLabel  = STATUS_LABEL[pom.status] ?? pom.status

    // Xác định bước tiếp theo cho user này
    const nextAction = getNextAction(pom.status, userRole)

    return {
      ...pom,
      current_phase: currentPhase,
      total_phases: 5,
      status_label: statusLabel,
      next_action: nextAction,
      stages: STAGES.map(stage => ({
        phase: stage.phase,
        label: stage.label,
        state:
          stage.phase < currentPhase
            ? 'completed'
            : stage.phase === currentPhase
            ? pom.status === 'closed_lost' ? 'failed' : 'active'
            : 'pending',
      })),
    }
  })

  res.json(successResponse(enriched))
})

function getNextAction(
  status: string,
  role: string
): { label: string; action: string } | null {
  const map: Record<string, Record<string, { label: string; action: string }>> = {
    draft: {
      technical: { label: 'Nộp BOM để duyệt', action: 'submit_bom' },
    },
    submitted: {
      technical_lead: { label: 'Duyệt BOM', action: 'approve_bom' },
    },
    revision_tech: {
      technical: { label: 'Cập nhật BOM & nộp lại', action: 'resubmit_bom' },
    },
    tp_approved: {
      sale_admin: { label: 'Bắt đầu định giá', action: 'start_pricing' },
    },
    revision_price: {
      sale_admin: { label: 'Sửa giá & gửi lại Sale', action: 'revise_price' },
    },
    pricing_done: {
      sales: { label: 'Gửi hồ sơ cho khách hàng', action: 'send_to_client' },
    },
    sent_to_client: {
      sales: { label: 'Ghi nhận phản hồi KH', action: 'record_feedback' },
    },
    negotiating: {
      sales: { label: 'Chốt hợp đồng', action: 'close_deal' },
    },
    closed_won: {
      technical: { label: 'Bắt đầu thi công', action: 'start_construction' },
      technical_lead: { label: 'Xác nhận bắt đầu thi công', action: 'confirm_construction' },
    },
    construction: {
      technical:      { label: 'Cập nhật tiến độ thi công', action: 'log_progress' },
      technical_lead: { label: 'Xử lý sự cố / Chuyển nghiệm thu', action: 'handle_incident' },
    },
    inspection: {
      technical:      { label: 'Báo cáo nghiệm thu', action: 'submit_inspection' },
      technical_lead: { label: 'Ký duyệt hoàn tất', action: 'confirm_completion' },
    },
  }
  return map[status]?.[role] ?? null
}

// ─────────────────────────────────────────────────────────────
// POST /api/poms/:id/transition
// Xử lý chuyển trạng thái có kiểm soát theo role
// ─────────────────────────────────────────────────────────────
export const transitionPomStatus = asyncHandler(async (req: Request, res: Response) => {
  const pomId   = parseInt(req.params.id)
  const userId  = (req as any).user?.id
  const role    = (req as any).user?.role
  const { action, note, reason } = req.body as {
    action: string
    note?: string
    reason?: string
  }

  const pom = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, status, created_by, assigned_sale_id, sale_admin_id, reviewed_by
     FROM poms WHERE id = $1`, pomId
  )
  if (!pom.length) throw new AppError(404, 'Không tìm thấy BOM')
  const p = pom[0]

  // Bảng chuyển trạng thái hợp lệ
  type Transition = {
    fromStatus: string
    roles: string[]
    toStatus: string
    extraUpdates?: string
    params?: unknown[]
  }

  const TRANSITIONS: Record<string, Transition> = {
    submit_bom: {
      fromStatus: 'draft',
      roles: ['technical'],
      toStatus: 'submitted',
    },
    resubmit_bom: {
      fromStatus: 'revision_tech',
      roles: ['technical'],
      toStatus: 'submitted',
    },
    approve_bom: {
      fromStatus: 'submitted',
      roles: ['technical_lead'],
      toStatus: 'tp_approved',
      extraUpdates: `, reviewed_by = ${userId}`,
    },
    reject_bom: {
      fromStatus: 'submitted',
      roles: ['technical_lead'],
      toStatus: 'draft',
      extraUpdates: `, return_reason = '${reason ?? ''}', revision_count = revision_count + 1`,
    },
    start_pricing: {
      fromStatus: 'tp_approved',
      roles: ['sale_admin'],
      toStatus: 'pricing_done',
      extraUpdates: `, sale_admin_id = ${userId}`,
    },
    revise_price: {
      fromStatus: 'revision_price',
      roles: ['sale_admin'],
      toStatus: 'pricing_done',
    },
    send_to_client: {
      fromStatus: 'pricing_done',
      roles: ['sales'],
      toStatus: 'sent_to_client',
    },
    record_feedback: {
      fromStatus: 'sent_to_client',
      roles: ['sales'],
      toStatus: 'negotiating',
    },
    request_price_revision: {
      fromStatus: 'negotiating',
      roles: ['sales'],
      toStatus: 'revision_price',
      extraUpdates: `, return_reason = '${reason ?? ''}'`,
    },
    request_tech_revision: {
      fromStatus: 'negotiating',
      roles: ['sales'],
      toStatus: 'revision_tech',
      extraUpdates: `, return_reason = '${reason ?? ''}', revision_count = revision_count + 1`,
    },
    re_approve_tech: {
      fromStatus: 'revision_tech',
      roles: ['technical_lead'],
      toStatus: 'tp_approved',
    },
    close_deal: {
      fromStatus: 'negotiating',
      roles: ['sales'],
      toStatus: 'closed_won',
      extraUpdates: `, closed_at = NOW()`,
    },
    lose_deal: {
      fromStatus: 'negotiating',
      roles: ['sales', 'sale_admin', 'admin'],
      toStatus: 'closed_lost',
      extraUpdates: `, closed_at = NOW(), return_reason = '${reason ?? ''}'`,
    },
    start_construction: {
      fromStatus: 'closed_won',
      roles: ['technical', 'technical_lead', 'admin'],
      toStatus: 'construction',
    },
    move_to_inspection: {
      fromStatus: 'construction',
      roles: ['technical_lead', 'admin'],
      toStatus: 'inspection',
    },
    complete_project: {
      fromStatus: 'inspection',
      roles: ['technical_lead', 'admin'],
      toStatus: 'project_completed',
    },
  }

  const t = TRANSITIONS[action]
  if (!t) throw new AppError(400, `Action không hợp lệ: ${action}`)
  if (!t.roles.includes(role)) throw new AppError(403, 'Không có quyền thực hiện hành động này')
  if (p.status !== t.fromStatus)
    throw new AppError(400, `BOM đang ở trạng thái "${p.status}", không thể ${action}`)

  // Cập nhật status
  const extra = t.extraUpdates ?? ''
  await prisma.$executeRawUnsafe(
    `UPDATE poms SET status = $1, updated_at = NOW() ${extra} WHERE id = $2`,
    t.toStatus, pomId
  )

  // Ghi audit log
  await prisma.$executeRawUnsafe(
    `INSERT INTO audit_logs (pom_id, from_status, to_status, changed_by, note, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    pomId, p.status, t.toStatus, userId, note ?? null
  )

  // Nếu chuyển sang construction/inspection → tạo construction log
  if (['construction', 'inspection', 'project_completed'].includes(t.toStatus)) {
    const logTypeMap: Record<string, string> = {
      construction:      'progress',
      inspection:        'progress',
      project_completed: 'handover',
    }
    const titleMap: Record<string, string> = {
      construction:      'Bắt đầu thi công',
      inspection:        'Chuyển sang giai đoạn nghiệm thu',
      project_completed: 'Bàn giao & hoàn tất dự án',
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO pom_construction_logs (pom_id, log_type, title, content, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      pomId, logTypeMap[t.toStatus], titleMap[t.toStatus], note ?? null, userId
    )
  }

  // Đồng bộ tiến độ sang phiên workflow engine đang liên kết BOM này (nếu có).
  // Không chặn response nếu lỗi đồng bộ — BOM vẫn là nguồn sự thật chính.
  try {
    await syncPomLinkedInstance(pomId)
  } catch (err) {
    console.error('[workflow] syncPomLinkedInstance lỗi:', err)
  }

  res.json(successResponse({
    id: pomId,
    from_status: p.status,
    to_status: t.toStatus,
    status_label: STATUS_LABEL[t.toStatus],
  }))
})

// ─────────────────────────────────────────────────────────────
// Đồng bộ 1 phiên workflow_instances đang liên kết (pom_id = pomId)
// với trạng thái thật của BOM.
//
// Cách tính: BOM có 5 giai đoạn (STATUS_TO_PHASE, 1..5). Phiên engine
// có N bước tuỳ template. Ta quy đổi tỉ lệ: số bước đã "hoàn thành"
// = round(N * (phase-1) / 5), bước kế tiếp (nếu còn) chuyển in_progress,
// phần còn lại ở pending. Khi BOM đóng (project_completed) → hoàn tất
// toàn bộ + đóng phiên; khi closed_lost → huỷ phiên.
//
// Đây là đồng bộ MỘT CHIỀU: BOM → workflow_instance. Không có chiều
// ngược lại — không cho tick tay phiên liên kết (chặn ở updateInstanceStep).
// ─────────────────────────────────────────────────────────────
export async function syncPomLinkedInstance(pomId: number): Promise<void> {
  const pomRows = await prisma.$queryRawUnsafe<{ status: string }[]>(
    `SELECT status FROM poms WHERE id = $1`, pomId
  )
  if (!pomRows.length) return
  const pomStatus = pomRows[0].status

  const instRows = await prisma.$queryRawUnsafe<{ id: number; workflow_id: number }[]>(
    `SELECT id, workflow_id FROM workflow_instances WHERE pom_id = $1 AND status = 'in_progress'`,
    pomId
  )
  if (!instRows.length) return // không có phiên nào đang liên kết — không cần làm gì

  const phase = STATUS_TO_PHASE[pomStatus] ?? 1
  const isClosedLost = pomStatus === 'closed_lost'
  const isCompleted  = pomStatus === 'project_completed'

  for (const inst of instRows) {
    const steps = await prisma.$queryRawUnsafe<{ step_id: number; step_order: number }[]>(
      `SELECT id AS step_id, step_order FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC`,
      inst.workflow_id
    )
    if (!steps.length) continue

    const n = steps.length
    const completedCount = isCompleted ? n : Math.min(n, Math.round(n * (phase - 1) / 5))

    for (let i = 0; i < n; i++) {
      const s = steps[i]
      let status: string
      if (isCompleted || i < completedCount) status = 'completed'
      else if (i === completedCount && !isClosedLost) status = 'in_progress'
      else status = 'pending'

      await prisma.$executeRawUnsafe(
        `UPDATE workflow_instance_steps SET
           status = $1,
           started_at   = CASE WHEN $1 IN ('in_progress','completed') AND started_at IS NULL THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
           updated_at   = NOW()
         WHERE instance_id = $2 AND step_id = $3`,
        status, inst.id, s.step_id
      )
    }

    if (isCompleted) {
      await prisma.$executeRawUnsafe(
        `UPDATE workflow_instances SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        inst.id
      )
    } else if (isClosedLost) {
      await prisma.$executeRawUnsafe(
        `UPDATE workflow_instances SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        inst.id
      )
    }
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/poms/:id/construction-logs
// KT / TP KT ghi nhật ký thi công
// ─────────────────────────────────────────────────────────────
export const addConstructionLog = asyncHandler(async (req: Request, res: Response) => {
  const pomId  = parseInt(req.params.id)
  const userId = (req as any).user?.id
  const role   = (req as any).user?.role
  const { log_type, title, content } = req.body as {
    log_type: 'progress' | 'incident' | 'resolved'
    title: string
    content?: string
  }

  if (!['technical', 'technical_lead', 'admin'].includes(role))
    throw new AppError(403, 'Chỉ Kỹ thuật / Trưởng phòng KT mới có quyền')

  if (!title?.trim()) throw new AppError(400, 'Thiếu tiêu đề nhật ký')

  const [row] = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO pom_construction_logs (pom_id, log_type, title, content, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, pom_id, log_type, title, content, created_by, created_at`,
    pomId, log_type ?? 'progress', title.trim(), content ?? null, userId
  )

  res.json(successResponse(row))
})

// ─────────────────────────────────────────────────────────────
// GET /api/poms/:id/construction-logs
// ─────────────────────────────────────────────────────────────
export const getConstructionLogs = asyncHandler(async (req: Request, res: Response) => {
  const pomId = parseInt(req.params.id)
  const rows  = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pcl.*, u.full_name AS creator_name
     FROM pom_construction_logs pcl
     LEFT JOIN users u ON u.id = pcl.created_by
     WHERE pcl.pom_id = $1
     ORDER BY pcl.created_at DESC`,
    pomId
  )
  res.json(successResponse(rows))
})

// ─────────────────────────────────────────────────────────────
// GET /api/workflows/admin-overview
// Admin xem tổng quan tất cả dự án theo 5 giai đoạn
// ─────────────────────────────────────────────────────────────
export const getAdminOverview = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      -- Đếm theo phase
      COUNT(*) FILTER (WHERE status IN ('draft','submitted','revision_tech'))::int            AS phase1_count,
      COUNT(*) FILTER (WHERE status IN ('tp_approved','pricing_done','revision_price'))::int  AS phase2_count,
      COUNT(*) FILTER (WHERE status IN ('sent_to_client','negotiating'))::int                 AS phase3_count,
      COUNT(*) FILTER (WHERE status IN ('closed_won','construction'))::int                    AS phase4_count,
      COUNT(*) FILTER (WHERE status IN ('inspection','project_completed'))::int               AS phase5_count,
      COUNT(*) FILTER (WHERE status = 'project_completed')::int                              AS total_completed,
      COUNT(*) FILTER (WHERE status = 'closed_lost')::int                                    AS total_lost,
      COUNT(*)::int                                                                           AS total_active,
      -- KPI
      ROUND(
        COUNT(*) FILTER (WHERE status = 'closed_won') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('closed_won','closed_lost')), 0)
      )::int AS win_rate,
      -- Tắc nghẽn: BOM chờ TP KT > 3 ngày
      COUNT(*) FILTER (
        WHERE status = 'submitted' AND updated_at < NOW() - INTERVAL '3 days'
      )::int AS bottleneck_tp_kt,
      -- BOM chờ Sale Admin > 2 ngày
      COUNT(*) FILTER (
        WHERE status = 'tp_approved' AND updated_at < NOW() - INTERVAL '2 days'
      )::int AS bottleneck_sale_admin,
      -- Revision nhiều lần
      SUM(revision_count)::int                                                               AS total_revisions,
      ROUND(AVG(revision_count), 1)::float                                                   AS avg_revisions
    FROM poms
    WHERE status NOT IN ('draft')
  `)

  // Danh sách BOM tắc nghẽn
  const bottlenecks = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.id, p.pom_code, p.project_name, p.status, p.updated_at,
           u.full_name AS creator_name,
           EXTRACT(DAY FROM NOW() - p.updated_at)::int AS days_stuck
    FROM poms p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE (
      (p.status = 'submitted'   AND p.updated_at < NOW() - INTERVAL '3 days') OR
      (p.status = 'tp_approved' AND p.updated_at < NOW() - INTERVAL '2 days') OR
      (p.status = 'construction' AND p.updated_at < NOW() - INTERVAL '7 days')
    )
    ORDER BY p.updated_at ASC
    LIMIT 20
  `)

  res.json(successResponse({
    summary: rows[0],
    bottlenecks,
  }))
})