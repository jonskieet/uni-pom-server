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
  const { name, description, category, color, icon, steps } = req.body
  const userId = (req as any).user?.id ?? null

  if (!name?.trim()) throw new AppError(400, 'Tên workflow là bắt buộc')

  const result = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    INSERT INTO workflows (name, description, category, color, icon, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, name.trim(), description || null, category || 'Chung',
     color || '#4F46E5', icon || 'ti-git-branch', userId)

  const workflowId = result[0].id

  if (Array.isArray(steps) && steps.length > 0) {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      await prisma.$executeRawUnsafe(`
        INSERT INTO workflow_steps
          (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, workflowId, s.name, s.description || null, i,
         s.step_type || 'task', s.assignee_role || null,
         s.required !== false, s.duration_days || 1)
    }
  }

  res.status(201).json(successResponse({ id: workflowId }, 'Tạo workflow thành công'))
})

// PUT /api/workflows/:id
export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name, description, category, color, icon, status, steps } = req.body

  await prisma.$executeRawUnsafe(`
    UPDATE workflows SET
      name        = COALESCE($1, name),
      description = COALESCE($2, description),
      category    = COALESCE($3, category),
      color       = COALESCE($4, color),
      icon        = COALESCE($5, icon),
      status      = COALESCE($6, status),
      updated_at  = NOW()
    WHERE id = $7
  `, name || null, description !== undefined ? description : null,
     category || null, color || null, icon || null, status || null, id)

  if (Array.isArray(steps)) {
    await prisma.$executeRawUnsafe(`DELETE FROM workflow_steps WHERE workflow_id = $1`, id)
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      await prisma.$executeRawUnsafe(`
        INSERT INTO workflow_steps
          (workflow_id, name, description, step_order, step_type, assignee_role, required, duration_days)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, id, s.name, s.description || null, i,
         s.step_type || 'task', s.assignee_role || null,
         s.required !== false, s.duration_days || 1)
    }
  }

  res.json(successResponse({ id }, 'Cập nhật thành công'))
})

// DELETE /api/workflows/:id
export const deleteWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  await prisma.$executeRawUnsafe(`DELETE FROM workflows WHERE id = $1`, id)
  res.json(successResponse(null, 'Đã xóa workflow'))
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
      COUNT(wis.id)::int AS total_steps,
      COUNT(CASE WHEN wis.status='completed' THEN 1 END)::int AS done_steps
    FROM workflow_instances wi
    JOIN workflows w ON w.id = wi.workflow_id
    LEFT JOIN users u ON u.id = wi.assignee_id
    LEFT JOIN users c ON c.id = wi.created_by
    LEFT JOIN workflow_instance_steps wis ON wis.instance_id = wi.id
    WHERE ${where}
    GROUP BY wi.id, w.name, w.color, w.icon, u.full_name, c.full_name
    ORDER BY wi.created_at DESC
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
      u.full_name AS assignee_name, c.full_name AS creator_name
    FROM workflow_instances wi
    JOIN workflows w ON w.id = wi.workflow_id
    LEFT JOIN users u ON u.id = wi.assignee_id
    LEFT JOIN users c ON c.id = wi.created_by
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
  res.json(successResponse({ ...rows[0], steps }))
})

// POST /api/workflows/instances
export const createInstance = asyncHandler(async (req: Request, res: Response) => {
  const { workflow_id, title, description, priority, assignee_id, due_date } = req.body
  const userId = (req as any).user?.id ?? null

  if (!workflow_id || !title?.trim()) throw new AppError(400, 'workflow_id và title là bắt buộc')

  const wf = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM workflows WHERE id = $1`, parseInt(workflow_id))
  if (!wf.length) throw new AppError(404, 'Workflow không tồn tại')

  const result = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    INSERT INTO workflow_instances
      (workflow_id, title, description, priority, assignee_id, due_date, created_by)
    VALUES ($1,$2,$3,$4,$5,$6::date,$7)
    RETURNING id
  `, parseInt(workflow_id), title.trim(), description || null,
     priority || 'normal', assignee_id || null, due_date || null, userId)

  const instanceId = result[0].id

  const templateSteps = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    SELECT id FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC
  `, parseInt(workflow_id))

  for (const s of templateSteps) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO workflow_instance_steps (instance_id, step_id, status)
      VALUES ($1, $2, 'pending')
    `, instanceId, s.id)
  }

  res.status(201).json(successResponse({ id: instanceId }, 'Đã tạo phiên workflow'))
})

// PATCH /api/workflows/instances/:id
export const updateInstance = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { status, priority, assignee_id, due_date, description } = req.body

  await prisma.$executeRawUnsafe(`
    UPDATE workflow_instances SET
      status      = COALESCE($1, status),
      priority    = COALESCE($2, priority),
      assignee_id = COALESCE($3, assignee_id),
      due_date    = COALESCE($4::date, due_date),
      description = COALESCE($5, description),
      completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
      updated_at  = NOW()
    WHERE id = $6
  `, status || null, priority || null, assignee_id || null,
     due_date || null, description !== undefined ? description : null, id)

  res.json(successResponse(null, 'Cập nhật thành công'))
})

// PATCH /api/workflows/instances/:id/steps/:stepId
export const updateInstanceStep = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = parseInt(req.params.id)
  const stepId = parseInt(req.params.stepId)
  const { status, note, assignee_id } = req.body

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

  // Auto-complete instance nếu tất cả required steps đã done
  const pending = await prisma.$queryRawUnsafe<{ cnt: number }[]>(`
    SELECT COUNT(*)::int AS cnt
    FROM workflow_instance_steps wis
    JOIN workflow_steps ws ON ws.id = wis.step_id
    WHERE wis.instance_id = $1
      AND ws.required = true
      AND wis.status != 'completed'
  `, instanceId)

  if ((pending[0]?.cnt ?? 1) === 0) {
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instances
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'in_progress'
    `, instanceId)
  }

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
