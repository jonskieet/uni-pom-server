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
      p.pom_code      AS pom_code,
      p.project_name  AS pom_project_name,
      p.customer_name AS pom_customer_name,
      p.status        AS pom_status,
      COUNT(wis.id)::int AS total_steps,
      COUNT(CASE WHEN wis.status='completed' THEN 1 END)::int AS done_steps,
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
  res.json(successResponse({ ...rows[0], steps }))
})

// POST /api/workflows/instances
export const createInstance = asyncHandler(async (req: Request, res: Response) => {
  const { workflow_id, title, description, priority, assignee_id, due_date, pom_id } = req.body
  const userId = (req as any).user?.id ?? null

  if (!workflow_id || !title?.trim()) throw new AppError(400, 'workflow_id và title là bắt buộc')

  const wf = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM workflows WHERE id = $1`, parseInt(workflow_id))
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

  const result = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    INSERT INTO workflow_instances
      (workflow_id, title, description, priority, assignee_id, due_date, created_by, pom_id)
    VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8)
    RETURNING id
  `, parseInt(workflow_id), title.trim(), description || null,
     priority || 'normal', assignee_id || null, due_date || null, userId, pomIdNum)

  const instanceId = result[0].id

  const templateSteps = await prisma.$queryRawUnsafe<{ id: number }[]>(`
    SELECT id FROM workflow_steps WHERE workflow_id = $1 ORDER BY step_order ASC
  `, parseInt(workflow_id))

  // QUAN TRỌNG: bước đầu tiên (step_order nhỏ nhất) phải vào thẳng 'in_progress'
  // ngay khi tạo phiên — nếu không, KHÔNG bước nào active, "bước hiện tại"
  // sẽ luôn rỗng và phiên chạy nhìn như đứng im 0% mãi mãi dù đã "Thực hiện".
  //
  // Ngoại lệ: phiên liên kết BOM (pom_id != null) KHÔNG tick tay — tiến độ của
  // nó được đồng bộ tự động từ trạng thái BOM (xem syncPomLinkedInstance trong
  // workflowProgress.ts, được gọi mỗi khi BOM chuyển trạng thái).
  for (let i = 0; i < templateSteps.length; i++) {
    const s = templateSteps[i]
    const isFirst = i === 0 && !pomIdNum
    await prisma.$executeRawUnsafe(`
      INSERT INTO workflow_instance_steps (instance_id, step_id, status, started_at)
      VALUES ($1, $2, $3, ${isFirst ? 'NOW()' : 'NULL'})
    `, instanceId, s.id, isFirst ? 'in_progress' : 'pending')
  }

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
  const userId = (req as any).user?.id
  const { status, note, assignee_id } = req.body

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
  const curRows = await prisma.$queryRawUnsafe<{ cur_status: string; step_order: number; step_type: string }[]>(`
    SELECT wis.status AS cur_status, ws.step_order, ws.step_type
    FROM workflow_instance_steps wis
    JOIN workflow_steps ws ON ws.id = wis.step_id
    WHERE wis.instance_id = $1 AND wis.step_id = $2
  `, instanceId, stepId)
  if (!curRows.length) throw new AppError(404, 'Không tìm thấy bước trong phiên này')
  const { cur_status, step_order, step_type } = curRows[0]

  // CHẶN hoàn thành/trả về sai thứ tự
  if ((status === 'completed' || status === 'rejected') && cur_status !== 'in_progress') {
    throw new AppError(400, 'Chỉ có thể hoàn thành hoặc trả về bước đang chạy hiện tại. Các bước phải thực hiện theo đúng thứ tự.')
  }

  // Với approval step bị reject: set rejected_at + rejected_by
  if (status === 'rejected') {
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instance_steps SET
        status       = 'rejected',
        note         = $1,
        rejected_at  = NOW(),
        rejected_by  = $2,
        updated_at   = NOW()
      WHERE instance_id = $3 AND step_id = $4
    `, note.trim(), userId ?? null, instanceId, stepId)

    // Phiên vẫn in_progress — không auto-complete, không advance
    res.json(successResponse(null, 'Đã trả về bước'))
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

  if (status === 'completed') {
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
  } else if (status === 'in_progress') {
    // Hoàn tác: trả các bước phía sau về 'pending'
    await prisma.$executeRawUnsafe(`
      UPDATE workflow_instance_steps wis2 SET status = 'pending', started_at = NULL, updated_at = NOW()
      FROM workflow_steps ws2
      WHERE wis2.step_id = ws2.id AND wis2.instance_id = $1
        AND ws2.step_order > $2 AND wis2.status = 'in_progress'
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