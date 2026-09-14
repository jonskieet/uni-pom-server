// ============================================================
// server/src/controllers/workflows.ts — Workflow Module
// Dùng $queryRawUnsafe / $executeRawUnsafe — dynamic filters
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

const WORKFLOW_MANAGER_ROLES = new Set(['admin', 'technical_lead'])
const WORKFLOW_STATUSES = new Set(['active', 'draft', 'archived'])
const INSTANCE_STATUSES = new Set(['in_progress', 'completed', 'paused', 'cancelled'])
const STEP_TYPES = new Set(['task', 'approval', 'notification', 'document', 'review'])
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])

function requireWorkflowManager(req: Request) {
  const role = req.user?.role
  if (!role || !WORKFLOW_MANAGER_ROLES.has(role)) {
    throw new AppError(403, 'Chỉ Quản trị viên hoặc Trưởng phòng kỹ thuật được quản lý mẫu workflow')
  }
}

function normalizeSteps(steps: any[]): any[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new AppError(400, 'Workflow cần ít nhất một bước')
  }
  return steps.map((step, index) => {
    const name = String(step?.name ?? '').trim()
    if (!name) throw new AppError(400, `Bước ${index + 1} chưa có tên`)
    const requestedType = step?.step_type === 'notify' ? 'notification' : step?.step_type
    const stepType = STEP_TYPES.has(requestedType) ? requestedType : 'task'
    const durationDays = Math.max(0, Math.min(365, Number(step?.duration_days) || 1))
    return {
      name,
      description: String(step?.description ?? '').trim() || null,
      step_type: stepType,
      assignee_role: String(step?.assignee_role ?? '').trim() || null,
      required: step?.required !== false,
      duration_days: durationDays,
    }
  })
}

// ═══════════════════════════════════════════════════════════
// WORKFLOWS (Templates)
// ═══════════════════════════════════════════════════════════

// GET /api/workflows
export const getWorkflows = asyncHandler(async (req: Request, res: Response) => {
  const { category, status } = req.query

  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (category) {
    params.push(category)
    conditions.push(`w.category = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`w.status = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const sql = `
    SELECT w.*,
      COUNT(DISTINCT ws.id)::int AS step_count,
      COUNT(DISTINCT wi.id)::int AS instance_count,
      COUNT(DISTINCT CASE WHEN wi.status='completed' THEN wi.id END)::int AS completed_count,
      u.full_name AS creator_name
    FROM workflows w
    LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
    LEFT JOIN workflow_instances wi ON wi.workflow_id = w.id
    LEFT JOIN users u ON u.id = w.created_by
    WHERE ${where}
    GROUP BY w.id, u.full_name
    ORDER BY w.created_at DESC
  `
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
  res.json(successResponse(rows))
})

// GET /api/workflows/stats
export const getWorkflowStats = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(DISTINCT w.id)::int AS total_workflows,
      COUNT(DISTINCT CASE WHEN w.status='active' THEN w.id END)::int AS active_workflows,
      COUNT(DISTINCT wi.id)::int AS total_instances,
      COUNT(DISTINCT CASE WHEN wi.status='completed' THEN wi.id END)::int AS completed_instances,
      COUNT(DISTINCT CASE WHEN wi.status='in_progress' THEN wi.id END)::int AS in_progress_instances
    FROM workflows w
    LEFT JOIN workflow_instances wi ON wi.workflow_id = w.id
  `)
  const s = rows[0]
  const total = s.total_instances ?? 0
  const completed = s.completed_instances ?? 0
  res.json(successResponse({
    ...s,
    completion_rate: total > 0 ? Math.round(completed / total * 100) : 0
  }))
})

// GET /api/workflows/:id
export const getWorkflowById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT w.*, u.full_name AS creator_name
    FROM workflows w
    LEFT JOIN users u ON u.id = w.created_by
    WHERE w.id = $1
  `, id)
  if (!rows.length) throw new AppError(404, 'Không tìm thấy workflow')

  const steps = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC
  `, id)
  res.json(successResponse({ ...rows[0], steps }))
})

// POST /api/workflows
export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  requireWorkflowManager(req)
  const { name, description, category, color, icon, steps } = req.body
  const userId = req.user?.id ?? null

  if (!name?.trim()) throw new AppError(400, 'Tên workflow là bắt buộc')
  const normalizedSteps = normalizeSteps(steps)

  const workflowId = await prisma.$transaction(async tx => {
    const duplicate = await tx.$queryRawUnsafe<{ id: number }[]>(
      `SELECT id FROM workflows WHERE LOWER(name) = LOWER($1) AND status <> 'archived' LIMIT 1`,
      name.trim(),
    )
    if (duplicate.length) throw new AppError(409, 'Đã có workflow đang hoạt động cùng tên')

    const result = await tx.$queryRawUnsafe<{ id: number }[]>(`
      INSERT INTO workflows (name, description, category, color, icon, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, name.trim(), description || null, category || 'Chung',
       color || '#4F46E5', icon || 'ti-git-branch', userId)
    const newId = result[0].id

    for (let i = 0; i < normalizedSteps.length; i++) {
      const s = normalizedSteps[i]
      await tx.$executeRawUnsafe(`
        INSERT INTO workflow_steps
          (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, newId, s.name, s.description, i, s.step_type, s.assignee_role, s.required, s.duration_days)
    }
    return newId
  })

  res.status(201).json(successResponse({ id: workflowId }, 'Tạo workflow thành công'))
})

// PUT /api/workflows/:id
export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  requireWorkflowManager(req)
  const id = parseInt(req.params.id)
  const { name, description, category, color, icon, status, steps } = req.body

  if (!Number.isInteger(id)) throw new AppError(400, 'Workflow không hợp lệ')
  if (status && !WORKFLOW_STATUSES.has(status)) throw new AppError(400, 'Trạng thái workflow không hợp lệ')
  const normalizedSteps = Array.isArray(steps) ? normalizeSteps(steps) : null

  const found = await prisma.$queryRawUnsafe<{ instance_count: number }[]>(`
    SELECT COUNT(wi.id)::int AS instance_count
    FROM workflows w LEFT JOIN workflow_instances wi ON wi.workflow_id = w.id
    WHERE w.id = $1 GROUP BY w.id
  `, id)
  if (!found.length) throw new AppError(404, 'Không tìm thấy workflow')
  if (normalizedSteps && found[0].instance_count > 0) {
    throw new AppError(409, 'Workflow đã có phiên chạy. Bạn có thể sửa thông tin, nhưng không thể thay cấu trúc bước để bảo toàn lịch sử.')
  }

  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`
      UPDATE workflows SET
        name        = COALESCE($1, name),
        description = CASE WHEN $2::boolean THEN $3 ELSE description END,
        category    = COALESCE($4, category),
        color       = COALESCE($5, color),
        icon        = COALESCE($6, icon),
        status      = COALESCE($7, status),
        updated_at  = NOW()
      WHERE id = $8
    `, name?.trim() || null, description !== undefined, description ?? null,
       category || null, color || null, icon || null, status || null, id)

    if (normalizedSteps) {
      await tx.$executeRawUnsafe(`DELETE FROM workflow_steps WHERE workflow_id = $1`, id)
      for (let i = 0; i < normalizedSteps.length; i++) {
        const s = normalizedSteps[i]
        await tx.$executeRawUnsafe(`
          INSERT INTO workflow_steps
            (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, id, s.name, s.description, i, s.step_type, s.assignee_role, s.required, s.duration_days)
      }
    }
  })

  res.json(successResponse({ id }, 'Cập nhật thành công'))
})

// DELETE /api/workflows/:id
export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  requireWorkflowManager(req)
  const id = parseInt(req.params.id)
  const rows = await prisma.$queryRawUnsafe<{ instance_count: number }[]>(`
    SELECT COUNT(wi.id)::int AS instance_count
    FROM workflows w LEFT JOIN workflow_instances wi ON wi.workflow_id = w.id
    WHERE w.id = $1 GROUP BY w.id
  `, id)
  if (!rows.length) throw new AppError(404, 'Không tìm thấy workflow')
  if (rows[0].instance_count > 0) {
    await prisma.$executeRawUnsafe(`UPDATE workflows SET status = 'archived', updated_at = NOW() WHERE id = $1`, id)
    return res.json(successResponse({ archived: true }, 'Workflow đã có lịch sử nên được chuyển vào lưu trữ'))
  }
  await prisma.$executeRawUnsafe(`DELETE FROM workflows WHERE id = $1`, id)
  res.json(successResponse({ archived: false }, 'Đã xóa workflow'))
})

// ═══════════════════════════════════════════════════════════
// WORKFLOW INSTANCES
// ═══════════════════════════════════════════════════════════

// GET /api/workflows/instances
export const getInstances = asyncHandler(async (req: Request, res: Response) => {
  const { workflow_id, status, my } = req.query
  const userId = (req as any).user?.id ?? null

  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (workflow_id) {
    params.push(parseInt(workflow_id as string))
    conditions.push(`wi.workflow_id = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`wi.status = $${params.length}`)
  }
  if (my === '1' && userId) {
    params.push(userId)
    conditions.push(`(wi.created_by = $${params.length} OR wi.assignee_id = $${params.length})`)
  }

  const where = conditions.join(' AND ')
  const sql = `
    SELECT wi.*, w.name AS workflow_name, w.color, w.icon,
      u.full_name AS assignee_name, c.full_name AS creator_name,
      p.pom_code      AS pom_code,
      p.project_name  AS pom_project_name,
      p.customer_name AS pom_customer_name,
      p.status        AS pom_status,
      COUNT(wis.id)::int AS total_steps,
      COUNT(CASE WHEN wis.status IN ('completed','skipped') THEN 1 END)::int AS done_steps,
      -- Bước đang chạy hiện tại
      (
        SELECT ws2.name FROM workflow_instance_steps wis2
        JOIN workflow_steps ws2 ON ws2.id = wis2.step_id
        WHERE wis2.instance_id = wi.id AND wis2.status = 'in_progress'
        ORDER BY ws2.step_order ASC LIMIT 1
      ) AS current_step_name,
      (
        SELECT ws2.step_order FROM workflow_instance_steps wis2
        JOIN workflow_steps ws2 ON ws2.id = wis2.step_id
        WHERE wis2.instance_id = wi.id AND wis2.status = 'in_progress'
        ORDER BY ws2.step_order ASC LIMIT 1
      ) AS current_step_order
    FROM workflow_instances wi
    JOIN workflows w ON w.id = wi.workflow_id
    LEFT JOIN users u ON u.id = wi.assignee_id
    LEFT JOIN users c ON c.id = wi.created_by
    LEFT JOIN poms p ON p.id = wi.pom_id
    LEFT JOIN workflow_instance_steps wis ON wis.instance_id = wi.id
    WHERE ${where}
    GROUP BY wi.id, w.name, w.color, w.icon, u.full_name, c.full_name,
             p.pom_code, p.project_name, p.customer_name, p.status
    ORDER BY wi.created_at DESC
    LIMIT 200
  `
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
  const data = rows.map((r: any) => ({
    ...r,
    progress: r.total_steps > 0 ? Math.round(r.done_steps / r.total_steps * 100) : 0
  }))
  res.json(successResponse(data))
})

// GET /api/workflows/instances/:id
export const getInstanceById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT wi.*, w.name AS workflow_name, w.color, w.icon,
      u.full_name AS assignee_name, c.full_name AS creator_name,
      p.pom_code      AS pom_code,
      p.project_name  AS pom_project_name,
      p.customer_name AS pom_customer_name,
      p.status        AS pom_status
    FROM workflow_instances wi
    JOIN workflows w ON w.id = wi.workflow_id
    LEFT JOIN users u ON u.id = wi.assignee_id
    LEFT JOIN users c ON c.id = wi.created_by
    LEFT JOIN poms p ON p.id = wi.pom_id
    WHERE wi.id = $1
  `, id)
  if (!rows.length) throw new AppError(404, 'Không tìm thấy phiên')

  const steps = await prisma.$queryRawUnsafe<any[]>(`
    SELECT wis.*, ws.name AS step_name, ws.step_type, ws.step_order,
      ws.assignee_role, ws.required, ws.duration_days,
      u.full_name AS assignee_name
    FROM workflow_instance_steps wis
    JOIN workflow_steps ws ON ws.id = wis.step_id
    LEFT JOIN users u ON u.id = wis.assignee_id
    WHERE wis.instance_id = $1
    ORDER BY ws.step_order ASC
  `, id)
  const activity = await prisma.$queryRawUnsafe<any[]>(`
    SELECT wal.*, u.full_name AS actor_name, ws.name AS step_name
    FROM workflow_activity_logs wal
    LEFT JOIN users u ON u.id = wal.actor_id
    LEFT JOIN workflow_steps ws ON ws.id = wal.step_id
    WHERE wal.instance_id = $1
    ORDER BY wal.created_at DESC
    LIMIT 100
  `, id)
  const doneSteps = steps.filter((step: any) => ['completed', 'skipped'].includes(step.status)).length
  res.json(successResponse({
    ...rows[0],
    steps,
    activity,
    total_steps: steps.length,
    done_steps: doneSteps,
    progress: steps.length ? Math.round(doneSteps / steps.length * 100) : 0,
  }))
})

// POST /api/workflows/instances
export const createInstance = asyncHandler(async (req: Request, res: Response) => {
  const { workflow_id, title, description, priority, assignee_id, due_date, pom_id } = req.body
  const userId = req.user?.id ?? null

  if (!workflow_id || !title?.trim()) throw new AppError(400, 'workflow_id và title là bắt buộc')
  if (priority && !PRIORITIES.has(priority)) throw new AppError(400, 'Mức ưu tiên không hợp lệ')

  const wf = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM workflows WHERE id = $1 AND status = 'active'`, parseInt(workflow_id))
  if (!wf.length) throw new AppError(404, 'Workflow không tồn tại')

  // Nếu có liên kết BOM: kiểm tra BOM tồn tại và chưa có phiên nào
  // đang chạy liên kết sẵn (tránh 2 phiên cùng theo dõi 1 BOM).
  let pomIdNum: number | null = null
  if (pom_id) {
    pomIdNum = parseInt(pom_id)
    const pom = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM poms WHERE id = $1`, pomIdNum)
    if (!pom.length) throw new AppError(404, 'BOM không tồn tại')

    const existing = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM workflow_instances WHERE pom_id = $1 AND status = 'in_progress'
    `, pomIdNum)
    if (existing.length) throw new AppError(400, 'BOM này đã có 1 phiên workflow đang liên kết chạy')
  }

  const templateSteps = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    SELECT id FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC
  `, parseInt(workflow_id))
  if (!templateSteps.length) throw new AppError(400, 'Workflow chưa có bước nên không thể chạy')

  // QUAN TRỌNG: bước đầu tiên (step_order nhỏ nhất) phải vào thẳng 'in_progress'
  // ngay khi tạo phiên — nếu không, KHÔNG bước nào active, "bước hiện tại"
  // sẽ luôn rỗng và phiên chạy nhìn như đứng im 0% mãi mãi dù đã "Thực hiện".
  //
  // Ngoại lệ: phiên liên kết BOM (pom_id != null) KHÔNG tick tay — tiến độ của
  // nó được đồng bộ tự động từ trạng thái BOM (xem syncPomLinkedInstance trong
  // workflowProgress.ts, được gọi mỗi khi BOM chuyển trạng thái).
  const instanceId = await prisma.$transaction(async tx => {
    const result = await tx.$queryRawUnsafe<{ id: number }[]>(`
      INSERT INTO workflow_instances
        (workflow_id, title, description, priority, assignee_id, due_date, created_by, pom_id)
      VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8)
      RETURNING id
    `, parseInt(workflow_id), title.trim(), description || null,
       priority || 'normal', assignee_id || null, due_date || null, userId, pomIdNum)
    const newId = result[0].id

    for (let i = 0; i < templateSteps.length; i++) {
      const s = templateSteps[i]
      const isFirst = i === 0 && !pomIdNum
      await tx.$executeRawUnsafe(`
        INSERT INTO workflow_instance_steps (instance_id, step_id, status, started_at)
        VALUES ($1, $2, $3, ${isFirst ? 'NOW()' : 'NULL'})
      `, newId, s.id, isFirst ? 'in_progress' : 'pending')
    }
    await tx.$executeRawUnsafe(`
      INSERT INTO workflow_activity_logs (instance_id, action, actor_id, metadata)
      VALUES ($1, 'instance_created', $2, jsonb_build_object('title', $3))
    `, newId, userId, title.trim())
    return newId
  })

  // Nếu phiên liên kết BOM: đồng bộ ngay tiến độ hiện tại của BOM vào phiên
  if (pomIdNum) {
    const { syncPomLinkedInstance } = await import('./workflowProgress')
    await syncPomLinkedInstance(pomIdNum)
  }

  res.status(201).json(successResponse({ id: instanceId }, 'Đã tạo phiên workflow'))
})

// PATCH /api/workflows/instances/:id
export const updateInstance = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { status, priority, assignee_id, due_date, description } = req.body

  if (status && !INSTANCE_STATUSES.has(status)) throw new AppError(400, 'Trạng thái phiên không hợp lệ')
  if (priority && !PRIORITIES.has(priority)) throw new AppError(400, 'Mức ưu tiên không hợp lệ')
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT created_by, assignee_id, status FROM workflow_instances WHERE id = $1
  `, id)
  if (!rows.length) throw new AppError(404, 'Không tìm thấy phiên')
  const current = rows[0]
  const userId = req.user?.id
  const role = req.user?.role
  if (!WORKFLOW_MANAGER_ROLES.has(role ?? '') && current.created_by !== userId && current.assignee_id !== userId) {
    throw new AppError(403, 'Bạn không có quyền cập nhật phiên workflow này')
  }

  await prisma.$executeRawUnsafe(`
    UPDATE workflow_instances SET
      status      = COALESCE($1, status),
      priority    = COALESCE($2, priority),
      assignee_id = CASE WHEN $3::boolean THEN $4 ELSE assignee_id END,
      due_date    = CASE WHEN $5::boolean THEN $6::date ELSE due_date END,
      description = CASE WHEN $7::boolean THEN $8 ELSE description END,
      completed_at = CASE WHEN $1 = 'completed' THEN NOW() WHEN $1 = 'in_progress' THEN NULL ELSE completed_at END,
      updated_at  = NOW()
    WHERE id = $9
  `, status || null, priority || null,
     assignee_id !== undefined, assignee_id ?? null,
     due_date !== undefined, due_date || null,
     description !== undefined, description ?? null, id)

  await prisma.$executeRawUnsafe(`
    INSERT INTO workflow_activity_logs (instance_id, action, actor_id, metadata)
    VALUES ($1, 'instance_updated', $2, $3::jsonb)
  `, id, userId ?? null, JSON.stringify({ status, priority, assignee_id, due_date }))

  res.json(successResponse(null, 'Cập nhật thành công'))
})

// PATCH /api/workflows/instances/:id/steps/:stepId
export const updateInstanceStep = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = parseInt(req.params.id)
  const stepId = parseInt(req.params.stepId)
  const userId = (req as any).user?.id
  const userRole = (req as any).user?.role as string | undefined
  const { status, note, assignee_id } = req.body

  if (!['completed', 'in_progress', 'skipped', 'rejected'].includes(status)) {
    throw new AppError(400, 'Trạng thái bước không hợp lệ')
  }

  // Validate: rejected phải có lý do
  if (status === 'rejected' && !note?.trim()) {
    throw new AppError(400, 'Bước bị trả về phải có lý do (note bắt buộc)')
  }

  // Phiên liên kết BOM: tiến độ đồng bộ tự động, không cho tick tay qua API
  const instRows = await prisma.$queryRawUnsafe<{ pom_id: number | null }[]>(`
    SELECT pom_id FROM workflow_instances WHERE id = $1
  `, instanceId)
  if (!instRows.length) throw new AppError(404, 'Không tìm thấy phiên')
  if (instRows[0].pom_id) {
    throw new AppError(400, 'Phiên này liên kết với BOM — trạng thái tự động đồng bộ, không thể tick tay')
  }

  // Lấy trạng thái hiện tại + step_order + step_type để biết vị trí bước này trong chuỗi
  const curRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT wis.status AS cur_status, wis.assignee_id AS step_assignee_id,
           ws.step_order, ws.step_type, ws.assignee_role, ws.required,
           wi.assignee_id AS instance_assignee_id, wi.created_by, wi.status AS instance_status
    FROM workflow_instance_steps wis
    JOIN workflow_steps ws ON ws.id = wis.step_id
    JOIN workflow_instances wi ON wi.id = wis.instance_id
    WHERE wis.instance_id = $1 AND wis.step_id = $2
  `, instanceId, stepId)
  if (!curRows.length) throw new AppError(404, 'Không tìm thấy bước trong phiên này')
  const current = curRows[0]
  const { cur_status, step_order, step_type } = current

  const canManage = WORKFLOW_MANAGER_ROLES.has(userRole ?? '')
  const isOwner = current.created_by === userId || current.instance_assignee_id === userId
  const isStepAssignee = current.step_assignee_id === userId
  const roleMatches = !current.assignee_role || current.assignee_role === userRole
  if (!canManage && !isOwner && !isStepAssignee && !roleMatches) {
    throw new AppError(403, 'Bước này không được giao cho bạn')
  }
  if (['paused', 'cancelled'].includes(current.instance_status)) {
    throw new AppError(409, 'Phiên đang tạm dừng hoặc đã hủy')
  }
  if (status === 'rejected' && step_type !== 'approval') {
    throw new AppError(400, 'Chỉ bước phê duyệt mới có thể trả về')
  }
  if (status === 'skipped' && current.required) {
    throw new AppError(400, 'Không thể bỏ qua bước bắt buộc')
  }

  // CHẶN hoàn thành/trả về sai thứ tự
  if (['completed', 'rejected', 'skipped'].includes(status) && cur_status !== 'in_progress') {
    throw new AppError(400, 'Chỉ có thể hoàn thành hoặc trả về bước đang chạy hiện tại. Các bước phải thực hiện theo đúng thứ tự.')
  }
  if (status === 'in_progress' && cur_status === 'completed' && !canManage) {
    throw new AppError(403, 'Chỉ quản trị viên mới có thể mở lại bước đã hoàn thành')
  }

  // Approval bị trả về: đưa bước duyệt về pending và mở lại bước ngay trước
  // đó. Code cũ để status='rejected' nhưng không còn bước in_progress, khiến
  // cả phiên bị kẹt vĩnh viễn.
  if (status === 'rejected') {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`
        UPDATE workflow_instance_steps SET
          status       = 'pending',
          note         = $1,
          started_at   = NULL,
          completed_at = NULL,
          rejected_at  = NOW(),
          rejected_by  = $2,
          updated_at   = NOW()
        WHERE instance_id = $3 AND step_id = $4
      `, note.trim(), userId ?? null, instanceId, stepId)

      const previous = await tx.$queryRawUnsafe<{ step_id: number }[]>(`
        SELECT wis.step_id
        FROM workflow_instance_steps wis
        JOIN workflow_steps ws ON ws.id = wis.step_id
        WHERE wis.instance_id = $1 AND ws.step_order < $2
        ORDER BY ws.step_order DESC LIMIT 1
      `, instanceId, step_order)
      if (previous.length) {
        await tx.$executeRawUnsafe(`
          UPDATE workflow_instance_steps
          SET status = 'in_progress', completed_at = NULL,
              started_at = COALESCE(started_at, NOW()), updated_at = NOW()
          WHERE instance_id = $1 AND step_id = $2
        `, instanceId, previous[0].step_id)
      } else {
        await tx.$executeRawUnsafe(`
          UPDATE workflow_instance_steps
          SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
          WHERE instance_id = $1 AND step_id = $2
        `, instanceId, stepId)
      }

      await tx.$executeRawUnsafe(`
        INSERT INTO workflow_activity_logs (instance_id, step_id, action, actor_id, note)
        VALUES ($1, $2, 'step_rejected', $3, $4)
      `, instanceId, stepId, userId ?? null, note.trim())
    })

    res.json(successResponse(null, 'Đã trả về bước trước để xử lý lại'))
    return
  }

  await prisma.$executeRawUnsafe(`
    UPDATE workflow_instance_steps SET
      status      = COALESCE($1, status),
      note        = COALESCE($2, note),
      assignee_id = COALESCE($3, assignee_id),
      completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
      started_at   = CASE WHEN $1 = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
      updated_at   = NOW()
    WHERE instance_id = $4 AND step_id = $5
  `, status || null, note !== undefined ? note : null,
     assignee_id || null, instanceId, stepId)

  if (status === 'completed' || status === 'skipped') {
    // Tự động kích hoạt bước kế tiếp (step_order nhỏ nhất còn 'pending') → 'in_progress'.
    const next = await prisma.$queryRawUnsafe<{ step_id: number }[]>(`
      SELECT wis.step_id FROM workflow_instance_steps wis
      JOIN workflow_steps ws ON ws.id = wis.step_id
      WHERE wis.instance_id = $1 AND wis.status = 'pending'
      ORDER BY ws.step_order ASC LIMIT 1
    `, instanceId)
    if (next.length) {
      await prisma.$executeRawUnsafe(`
        UPDATE workflow_instance_steps SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
        WHERE instance_id = $1 AND step_id = $2
      `, instanceId, next[0].step_id)
    }
  } else if (status === 'in_progress' && cur_status === 'completed') {
    // Mở lại bước: trả toàn bộ bước phía sau về pending để lịch sử tiến độ
    // không rơi vào trạng thái nhiều bước cùng chạy/hoàn thành sai thứ tự.
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instance_steps wis2
      SET status = 'pending', started_at = NULL, completed_at = NULL, updated_at = NOW()
      FROM workflow_steps ws2
      WHERE wis2.step_id = ws2.id AND wis2.instance_id = $1
        AND ws2.step_order > $2
    `, instanceId, step_order)
    // Nếu phiên đã từng được tự đóng 'completed', mở lại
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instances SET status = 'in_progress', completed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'completed'
    `, instanceId)
  }

  // Auto-complete instance nếu tất cả required steps đã done (không tính rejected)
  const pending = await prisma.$queryRawUnsafe<{ cnt: number }[]>(`
    SELECT COUNT(*)::int AS cnt
    FROM workflow_instance_steps wis
    JOIN workflow_steps ws ON ws.id = wis.step_id
    WHERE wis.instance_id = $1
      AND ws.required = true
      AND wis.status NOT IN ('completed', 'skipped')
  `, instanceId)

  if ((pending[0]?.cnt ?? 1) === 0) {
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instances
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'in_progress'
    `, instanceId)
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO workflow_activity_logs (instance_id, step_id, action, actor_id, note, metadata)
    VALUES ($1, $2, $3, $4, $5, jsonb_build_object('status', $6))
  `, instanceId, stepId, `step_${status}`, userId ?? null, note ?? null, status)

  res.json(successResponse(null, 'Đã cập nhật bước'))
})// ============================================================
// THÊM VÀO CUỐI server/src/controllers/workflows.ts
// (giữ nguyên toàn bộ phần code hiện có ở trên, chỉ append thêm)
// ============================================================

// ═══════════════════════════════════════════════════════════
// LINKED WORKFLOWS — 4 quy trình đã có module riêng
// (Phê duyệt BOM, Khảo sát khách hàng, Đề xuất công tác phí, Nghỉ phép)
// Đọc THẬT từ poms / survey_reports / business_trips / leave_requests
// qua view, không tạo workflow_instances giả. KHÔNG có create/update/delete
// ở đây — muốn sửa thì phải vào đúng module gốc (BOM, Khảo sát...).
// ═══════════════════════════════════════════════════════════

// GET /api/workflows/linked
// Trả về danh sách 4 "thẻ quy trình" kèm số liệu thật, dùng để
// hiển thị cạnh các workflow template thật trong dashboard.
export const getLinkedWorkflows = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM vw_linked_workflow_stats ORDER BY source_key
  `)
  const data = rows.map(r => ({
    linked: true,
    source_key: r.source_key,
    name: r.name,
    category: r.category,
    color: r.color,
    icon: r.icon,
    instance_count: r.instance_count,
    completed_count: r.completed_count,
    in_progress_count: r.in_progress_count,
    cancelled_count: r.cancelled_count,
    completion_rate: r.completion_rate,
  }))
  res.json(successResponse(data))
})

// GET /api/workflows/linked/instances?source=bom&status=in_progress
export const getLinkedInstances = asyncHandler(async (req: Request, res: Response) => {
  const { source, status } = req.query

  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (source) {
    params.push(source)
    conditions.push(`source_key = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM vw_linked_workflow_instances
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT 200
  `, ...params)

  res.json(successResponse(rows))
})
