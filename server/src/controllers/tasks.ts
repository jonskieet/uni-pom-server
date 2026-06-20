// ============================================================
// server/src/controllers/tasks.ts — Planner Module
// Dùng $queryRaw / $executeRaw để không cần sửa schema.prisma
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { sendTaskAssignEmail, sendTaskReassignEmail, sendTaskDeleteEmail } from '../utils/emailService'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── Helper: lấy tên plan ──────────────────────────────────────────────
async function getPlanName(planId: number): Promise<string> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM plans WHERE id = ${planId}
  `
  return rows[0]?.name ?? 'Không rõ'
}

// ── Helper: lấy tên bucket ───────────────────────────────────────────
async function getBucketName(bucketId: number | null): Promise<string> {
  if (!bucketId) return 'Chưa phân loại'
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM buckets WHERE id = ${bucketId}
  `
  return rows[0]?.name ?? 'Chưa phân loại'
}

// ── Helper: gửi email cho danh sách assignee mới (bất đồng bộ) ───────
function notifyAssignees(params: {
  newAssigneeIds: number[]
  assignerName: string
  assignerRole?: string | null
  taskId: number
  taskTitle: string
  planName: string
  bucketName?: string | null
  status?: string | null
  priority: string
  dueDate?: string | Date | null
  description?: string | null
}) {
  const { newAssigneeIds, assignerName, assignerRole, taskId, taskTitle, planName, bucketName, status, priority, dueDate, description } = params
  if (!newAssigneeIds.length) return

  // Chạy bất đồng bộ, không block response
  prisma.$queryRaw<{ id: number; email: string | null; full_name: string }[]>`
    SELECT id, email, full_name FROM users WHERE id = ANY(${newAssigneeIds}::int[])
  `.then(users => {
    for (const u of users) {
      if (!u.email) {
        console.warn(`[Email] User #${u.id} (${u.full_name}) chưa có email — bỏ qua`)
        continue
      }
      sendTaskAssignEmail({
        toEmail: u.email,
        recipientName: u.full_name,
        taskId,
        taskTitle,
        planName,
        bucketName,
        status,
        assignerName,
        assignerRole,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        description: description ?? null,
        assignedDate: new Date(),
      })
    }
  }).catch(err => console.error('[Email] Lỗi lấy thông tin user (giao việc):', err))
}

// ── Helper: gửi email chuyển giao / đổi người thực hiện (bất đồng bộ) ─
// addedIds:   những người mới được thêm vào (nhận vai "người mới")
// removedIds: những người bị gỡ khỏi nhiệm vụ (nhận vai "người cũ")
function notifyReassignment(params: {
  addedIds: number[]
  removedIds: number[]
  changedByName: string
  changedByRole?: string | null
  taskId: number
  taskTitle: string
  planName: string
  bucketName?: string | null
  status?: string | null
  priority: string
  dueDate?: string | Date | null
  description?: string | null
}) {
  const { addedIds, removedIds, changedByName, changedByRole, taskId, taskTitle, planName, bucketName, status, priority, dueDate, description } = params
  if (!addedIds.length && !removedIds.length) return

  const allIds = [...new Set([...addedIds, ...removedIds])]

  prisma.$queryRaw<{ id: number; email: string | null; full_name: string; role: string }[]>`
    SELECT id, email, full_name, role FROM users WHERE id = ANY(${allIds}::int[])
  `.then(users => {
    const byId = new Map(users.map(u => [u.id, u]))
    const addedUsers   = addedIds.map(id => byId.get(id)).filter(Boolean) as typeof users
    const removedUsers = removedIds.map(id => byId.get(id)).filter(Boolean) as typeof users

    const newAssigneeName = addedUsers.length   ? addedUsers.map(u => u.full_name).join(', ')   : 'Chưa có người thay thế'
    const oldAssigneeName = removedUsers.length ? removedUsers.map(u => u.full_name).join(', ') : 'Chưa có'
    const newAssigneeRole = addedUsers.length === 1   ? addedUsers[0].role   : null
    const oldAssigneeRole = removedUsers.length === 1 ? removedUsers[0].role : null
    const changedDate = new Date()
    const dueDateIso = dueDate ? new Date(dueDate).toISOString() : null

    for (const u of addedUsers) {
      if (!u.email) { console.warn(`[Email] User #${u.id} (${u.full_name}) chưa có email — bỏ qua`); continue }
      sendTaskReassignEmail({
        toEmail: u.email,
        viewpoint: 'new',
        recipientName: u.full_name,
        oldAssigneeName, oldAssigneeRole,
        newAssigneeName, newAssigneeRole,
        taskId, taskTitle, description: description ?? null,
        planName, bucketName, status, priority, dueDate: dueDateIso,
        changedByName, changedByRole, changedDate,
      })
    }
    for (const u of removedUsers) {
      if (!u.email) { console.warn(`[Email] User #${u.id} (${u.full_name}) chưa có email — bỏ qua`); continue }
      sendTaskReassignEmail({
        toEmail: u.email,
        viewpoint: 'old',
        recipientName: u.full_name,
        oldAssigneeName, oldAssigneeRole,
        newAssigneeName, newAssigneeRole,
        taskId, taskTitle, description: description ?? null,
        planName, bucketName, status, priority, dueDate: dueDateIso,
        changedByName, changedByRole, changedDate,
      })
    }
  }).catch(err => console.error('[Email] Lỗi lấy thông tin user (chuyển giao):', err))
}

// ── Helper: gửi email báo xóa nhiệm vụ cho các assignee (bất đồng bộ) ─
function notifyTaskDeleted(params: {
  assignees: { id: number; email: string | null; full_name: string }[]
  deletedByName: string
  deletedByRole?: string | null
  taskTitle: string
  description?: string | null
  planName: string
  bucketName?: string | null
  status?: string | null
  dueDate?: string | Date | null
}) {
  const { assignees, deletedByName, deletedByRole, taskTitle, description, planName, bucketName, status, dueDate } = params
  if (!assignees.length) return

  const deletedDate = new Date()
  const dueDateIso = dueDate ? new Date(dueDate).toISOString() : null

  for (const u of assignees) {
    if (!u.email) { console.warn(`[Email] User #${u.id} (${u.full_name}) chưa có email — bỏ qua`); continue }
    sendTaskDeleteEmail({
      toEmail: u.email,
      recipientName: u.full_name,
      taskTitle,
      description: description ?? null,
      planName,
      bucketName,
      status,
      dueDate: dueDateIso,
      deletedByName,
      deletedByRole,
      deletedDate,
    })
  }
}

// ── Helper: lấy id của những người liên quan đến 1 task (người tạo + người được giao) ─
async function getTaskParticipantIds(taskId: number): Promise<{ created_by: number; participantIds: number[] } | null> {
  const rows = await prisma.$queryRaw<{ created_by: number }[]>`
    SELECT created_by FROM tasks WHERE id = ${taskId}
  `
  if (!rows.length) return null
  const assignees = await prisma.$queryRaw<{ user_id: number }[]>`
    SELECT user_id FROM task_assignees WHERE task_id = ${taskId}
  `
  const participantIds = [...new Set([rows[0].created_by, ...assignees.map(a => a.user_id)])]
  return { created_by: rows[0].created_by, participantIds }
}

// ── Helper: tạo thông báo TRONG APP khi giao task cho người mới ──────
async function notifyAppAssignees(params: {
  newAssigneeIds: number[]
  assignerName: string
  taskId: number
  taskTitle: string
}) {
  const { newAssigneeIds, assignerName, taskId, taskTitle } = params
  if (!newAssigneeIds.length) return
  try {
    await prisma.notification.createMany({
      data: newAssigneeIds.map(uid => ({
        user_id: uid,
        task_id: taskId,
        type: 'task_assigned',
        title: `${assignerName} đã giao cho bạn một nhiệm vụ`,
        message: `"${taskTitle}"`,
      })),
    })
  } catch (err) { console.error('[Notify] Lỗi tạo thông báo giao việc:', err) }
}

// ── Helper: tạo thông báo TRONG APP khi đổi/gỡ người thực hiện ───────
async function notifyAppReassignment(params: {
  addedIds: number[]
  removedIds: number[]
  changedByName: string
  taskId: number
  taskTitle: string
}) {
  const { addedIds, removedIds, changedByName, taskId, taskTitle } = params
  try {
    const data: { user_id: number; task_id: number; type: string; title: string; message: string }[] = []
    for (const uid of addedIds) {
      data.push({
        user_id: uid, task_id: taskId, type: 'task_assigned',
        title: `${changedByName} đã giao cho bạn một nhiệm vụ`,
        message: `"${taskTitle}"`,
      })
    }
    for (const uid of removedIds) {
      data.push({
        user_id: uid, task_id: taskId, type: 'task_unassigned',
        title: `${changedByName} đã gỡ bạn khỏi một nhiệm vụ`,
        message: `"${taskTitle}"`,
      })
    }
    if (data.length) await prisma.notification.createMany({ data })
  } catch (err) { console.error('[Notify] Lỗi tạo thông báo đổi người:', err) }
}

// ── Helper: tạo thông báo TRONG APP khi xóa task ──────────────────────
// Lưu ý: KHÔNG gắn task_id vì task đã bị xóa khỏi DB (FK task_id sẽ lỗi
// hoặc bị cascade xóa luôn nếu task_id không tồn tại).
async function notifyAppTaskDeleted(params: {
  recipientIds: number[]
  deletedByName: string
  taskTitle: string
}) {
  const { recipientIds, deletedByName, taskTitle } = params
  if (!recipientIds.length) return
  try {
    await prisma.notification.createMany({
      data: recipientIds.map(uid => ({
        user_id: uid,
        type: 'task_deleted',
        title: `${deletedByName} đã xóa một nhiệm vụ`,
        message: `"${taskTitle}" không còn tồn tại`,
      })),
    })
  } catch (err) { console.error('[Notify] Lỗi tạo thông báo xóa nhiệm vụ:', err) }
}

// ── PLANS ─────────────────────────────────────────────────────────────

export const getPlans = asyncHandler(async (req: Request, res: Response) => {
  const plans = await prisma.$queryRaw<any[]>`
    SELECT
      p.*,
      u.full_name                                                   AS creator_name,
      COUNT(DISTINCT t.id)::int                                     AS task_count,
      COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END)::int AS completed_count,
      COUNT(DISTINCT CASE WHEN t.status = 'in_progress' THEN t.id END)::int AS in_progress_count,
      COUNT(DISTINCT CASE WHEN t.due_date < NOW() AND t.status NOT IN ('completed','deferred') THEN t.id END)::int AS overdue_count
    FROM plans p
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN tasks t ON t.plan_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id, u.full_name
    ORDER BY p.created_at DESC
  `
  res.json(successResponse(plans))
})

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body
  const createdBy = req.user!.id
  if (!name?.trim()) throw new AppError(400, 'Tên kế hoạch không được để trống')

  const [plan] = await prisma.$queryRaw<any[]>`
    INSERT INTO plans (name, description, created_by, created_at, updated_at)
    VALUES (${name.trim()}, ${description || null}, ${createdBy}, NOW(), NOW())
    RETURNING *
  `

  // Tạo 3 cột mặc định
  await prisma.$executeRaw`
    INSERT INTO buckets (plan_id, name, sort_order) VALUES
    (${plan.id}, 'Cần làm',         0),
    (${plan.id}, 'Đang thực hiện',  1),
    (${plan.id}, 'Hoàn thành',      2)
  `

  res.status(201).json(successResponse(plan, 'Đã tạo kế hoạch'))
})

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name, description } = req.body
  if (!name?.trim()) throw new AppError(400, 'Tên kế hoạch không được để trống')

  const rows = await prisma.$queryRaw<any[]>`
    UPDATE plans SET name=${name.trim()}, description=${description ?? null}, updated_at=NOW()
    WHERE id=${id} AND is_active=true
    RETURNING *
  `
  if (!rows.length) throw new AppError(404, 'Kế hoạch không tồn tại')
  res.json(successResponse(rows[0], 'Đã cập nhật'))
})

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  // Soft delete
  await prisma.$executeRaw`UPDATE plans SET is_active=false WHERE id=${id}`
  res.json(successResponse(null, 'Đã xóa kế hoạch'))
})

// ── BUCKETS ───────────────────────────────────────────────────────────

export const getBuckets = asyncHandler(async (req: Request, res: Response) => {
  const planId = parseInt(req.params.planId)
  const buckets = await prisma.$queryRaw<any[]>`
    SELECT b.*, COUNT(t.id)::int AS task_count
    FROM buckets b
    LEFT JOIN tasks t ON t.bucket_id = b.id
    WHERE b.plan_id = ${planId}
    GROUP BY b.id
    ORDER BY b.sort_order, b.id
  `
  res.json(successResponse(buckets))
})

export const createBucket = asyncHandler(async (req: Request, res: Response) => {
  const planId = parseInt(req.params.planId)
  const { name } = req.body
  if (!name?.trim()) throw new AppError(400, 'Tên nhóm không được để trống')

  const [row] = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(MAX(sort_order), -1) AS mo FROM buckets WHERE plan_id=${planId}
  `
  const nextOrder = (row.mo ?? -1) + 1

  const [bucket] = await prisma.$queryRaw<any[]>`
    INSERT INTO buckets (plan_id, name, sort_order)
    VALUES (${planId}, ${name.trim()}, ${nextOrder})
    RETURNING *
  `
  res.status(201).json(successResponse(bucket, 'Đã tạo nhóm'))
})

export const updateBucket = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name } = req.body
  if (!name?.trim()) throw new AppError(400, 'Tên nhóm không được để trống')

  const rows = await prisma.$queryRaw<any[]>`
    UPDATE buckets SET name=${name.trim()} WHERE id=${id} RETURNING *
  `
  if (!rows.length) throw new AppError(404, 'Nhóm không tồn tại')
  res.json(successResponse(rows[0], 'Đã cập nhật'))
})

export const deleteBucket = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  // Tasks trong bucket: bỏ bucket_id (không xóa task)
  await prisma.$executeRaw`UPDATE tasks SET bucket_id=NULL WHERE bucket_id=${id}`
  await prisma.$executeRaw`DELETE FROM buckets WHERE id=${id}`
  res.json(successResponse(null, 'Đã xóa nhóm'))
})

export const reorderBuckets = asyncHandler(async (req: Request, res: Response) => {
  // body: { plan_id, ordered_ids: number[] }
  const { plan_id, ordered_ids } = req.body
  if (!plan_id || !Array.isArray(ordered_ids)) {
    throw new AppError(400, 'Thiếu plan_id hoặc ordered_ids')
  }
  const planIdInt = parseInt(plan_id)

  for (let i = 0; i < ordered_ids.length; i++) {
    const bucketId = parseInt(ordered_ids[i])
    await prisma.$executeRaw`
      UPDATE buckets SET sort_order=${i}
      WHERE id=${bucketId} AND plan_id=${planIdInt}
    `
  }

  const buckets = await prisma.$queryRaw<any[]>`
    SELECT b.*, COUNT(t.id)::int AS task_count
    FROM buckets b
    LEFT JOIN tasks t ON t.bucket_id = b.id
    WHERE b.plan_id = ${planIdInt}
    GROUP BY b.id
    ORDER BY b.sort_order, b.id
  `
  res.json(successResponse(buckets, 'Đã sắp xếp lại nhóm'))
})

// ── TASKS ─────────────────────────────────────────────────────────────

export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  const { plan_id, assigned_to, status, priority } = req.query
  if (!plan_id) throw new AppError(400, 'Thiếu plan_id')

  const planId       = parseInt(plan_id as string)
  const assignedToF  = assigned_to ? parseInt(assigned_to as string) : null
  const statusF      = (status  as string) || null
  const priorityF    = (priority as string) || null
  const userId       = req.user!.id

  // Quyền riêng tư: bucket dùng chung (public) nhưng mỗi task chỉ hiển thị
  // với người tạo ra nó hoặc người được giao (assignee) của task đó.
  const tasks = await prisma.$queryRaw<any[]>`
    SELECT
      t.*,
      a.full_name   AS assignee_name,
      a.avatar_url  AS assignee_avatar,
      a.role        AS assignee_role,
      c.full_name   AS creator_name,
      COUNT(DISTINCT cl.id)::int                              AS check_total,
      COUNT(DISTINCT CASE WHEN cl.is_done THEN cl.id END)::int AS check_done,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', au.id, 'full_name', au.full_name, 'avatar_url', au.avatar_url, 'role', au.role
        )) FILTER (WHERE au.id IS NOT NULL),
        '[]'
      ) AS assignees
    FROM tasks t
    LEFT JOIN users a  ON a.id = t.assigned_to
    LEFT JOIN users c  ON c.id = t.created_by
    LEFT JOIN task_checklists cl ON cl.task_id = t.id
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    LEFT JOIN users au ON au.id = ta.user_id
    WHERE t.plan_id = ${planId}
      AND (
        t.created_by = ${userId}
        OR EXISTS (SELECT 1 FROM task_assignees me WHERE me.task_id = t.id AND me.user_id = ${userId})
      )
      AND (${assignedToF}::int    IS NULL OR EXISTS (
            SELECT 1 FROM task_assignees x WHERE x.task_id = t.id AND x.user_id = ${assignedToF}::int
          ))
      AND (${statusF}::text       IS NULL OR t.status      = ${statusF}::text)
      AND (${priorityF}::text     IS NULL OR t.priority    = ${priorityF}::text)
    GROUP BY t.id, a.full_name, a.avatar_url, a.role, c.full_name
    ORDER BY t.bucket_id NULLS FIRST, t.sort_order, t.created_at
  `
  res.json(successResponse(tasks))
})

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const userId = req.user!.id

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      t.*,
      a.full_name  AS assignee_name,
      a.avatar_url AS assignee_avatar,
      c.full_name  AS creator_name
    FROM tasks t
    LEFT JOIN users a ON a.id = t.assigned_to
    LEFT JOIN users c ON c.id = t.created_by
    WHERE t.id = ${id}
  `
  if (!rows.length) throw new AppError(404, 'Nhiệm vụ không tồn tại')

  // Quyền riêng tư: chỉ người tạo hoặc người được giao mới được xem chi tiết task
  const participants = await getTaskParticipantIds(id)
  if (!participants || !participants.participantIds.includes(userId)) {
    throw new AppError(403, 'Bạn không có quyền xem nhiệm vụ này')
  }

  const checklists = await prisma.$queryRaw`
    SELECT * FROM task_checklists WHERE task_id=${id} ORDER BY sort_order, id
  `
  const comments = await prisma.$queryRaw`
    SELECT cm.*, u.full_name, u.avatar_url
    FROM task_comments cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.task_id=${id}
    ORDER BY cm.created_at ASC
  `
  const assignees = await prisma.$queryRaw<any[]>`
    SELECT u.id, u.full_name, u.avatar_url, u.role
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id=${id}
    ORDER BY u.full_name
  `

  res.json(successResponse({ ...rows[0], checklists, comments, assignees }))
})

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, plan_id, bucket_id, assigned_to, priority, due_date, start_date, status } = req.body
  const createdBy = req.user!.id

  if (!title?.trim()) throw new AppError(400, 'Tên nhiệm vụ không được để trống')
  if (!plan_id)       throw new AppError(400, 'Thiếu plan_id')

  const planIdInt    = parseInt(plan_id)
  const bucketIdVal  = bucket_id   ? parseInt(bucket_id)   : null
  const dueDateVal   = due_date    || null
  const startDateVal = start_date  || null
  const statusVal    = status      || 'not_started'
  const priorityVal  = priority    || 'medium'

  // assigned_to: có thể là 1 giá trị hoặc 1 mảng (giao cho nhiều người)
  const assigneeIds: number[] = Array.isArray(assigned_to)
    ? assigned_to.map((v: any) => parseInt(v)).filter((v: number) => !isNaN(v))
    : assigned_to ? [parseInt(assigned_to)] : []
  const primaryAssignee = assigneeIds.length ? assigneeIds[0] : null

  // Tính sort_order tiếp theo trong bucket
  let orderRows: any[]
  if (bucketIdVal !== null) {
    orderRows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(MAX(sort_order), -1) AS mo FROM tasks WHERE plan_id=${planIdInt} AND bucket_id=${bucketIdVal}
    `
  } else {
    orderRows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(MAX(sort_order), -1) AS mo FROM tasks WHERE plan_id=${planIdInt} AND bucket_id IS NULL
    `
  }
  const sortOrder = (orderRows[0]?.mo ?? -1) + 1

  const [task] = await prisma.$queryRaw<any[]>`
    INSERT INTO tasks
      (title, description, plan_id, bucket_id, created_by, assigned_to, priority, due_date, start_date, status, sort_order, created_at, updated_at)
    VALUES
      (${title.trim()}, ${description || null}, ${planIdInt}, ${bucketIdVal}, ${createdBy}, ${primaryAssignee},
       ${priorityVal}, ${dueDateVal ? new Date(dueDateVal) : null}, ${startDateVal ? new Date(startDateVal) : null},
       ${statusVal}, ${sortOrder}, NOW(), NOW())
    RETURNING *
  `

  for (const uid of assigneeIds) {
    await prisma.$executeRaw`
      INSERT INTO task_assignees (task_id, user_id) VALUES (${task.id}, ${uid})
      ON CONFLICT DO NOTHING
    `
  }

  // ── Gửi email thông báo cho các assignee ────────────────────────────
  if (assigneeIds.length > 0) {
    const [assigner] = await prisma.$queryRaw<{ full_name: string; role: string }[]>`
      SELECT full_name, role FROM users WHERE id = ${createdBy}
    `
    // Thông báo trong app (đồng bộ ngay, không phải đợi email)
    notifyAppAssignees({
      newAssigneeIds: assigneeIds,
      assignerName: assigner?.full_name ?? 'Hệ thống',
      taskId: task.id,
      taskTitle: title.trim(),
    })
    Promise.all([getPlanName(planIdInt), getBucketName(bucketIdVal)]).then(([planName, bucketName]) => {
      notifyAssignees({
        newAssigneeIds: assigneeIds,
        assignerName: assigner?.full_name ?? 'Hệ thống',
        assignerRole: assigner?.role ?? null,
        taskId: task.id,
        taskTitle: title.trim(),
        planName,
        bucketName,
        status: statusVal,
        priority: priorityVal,
        dueDate: dueDateVal,
        description: description || null,
      })
    })
  }
  // ────────────────────────────────────────────────────────────────────

  res.status(201).json(successResponse(task, 'Đã tạo nhiệm vụ'))
})

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const id      = parseInt(req.params.id)
  const changes = req.body

  // Lấy dữ liệu hiện tại
  const existing = await prisma.$queryRaw<any[]>`SELECT * FROM tasks WHERE id=${id}`
  if (!existing.length) throw new AppError(404, 'Nhiệm vụ không tồn tại')
  const cur = existing[0]

  // Merge changes
  const title       = 'title'       in changes ? (changes.title?.trim() || cur.title) : cur.title
  const description = 'description' in changes ? (changes.description ?? null)        : cur.description
  const bucketId    = 'bucket_id'   in changes ? (changes.bucket_id ? parseInt(changes.bucket_id) : null) : cur.bucket_id
  const priority    = 'priority'    in changes ? changes.priority  : cur.priority
  const status      = 'status'      in changes ? changes.status    : cur.status
  const dueDate     = 'due_date'    in changes ? (changes.due_date ? new Date(changes.due_date) : null) : cur.due_date
  const startDate   = 'start_date'  in changes ? (changes.start_date ? new Date(changes.start_date) : null) : cur.start_date
  const completedAt = status === 'completed' && cur.status !== 'completed'
    ? new Date()
    : (status !== 'completed' ? null : cur.completed_at)

  // ── Xử lý người được giao (hỗ trợ nhiều người) ─────────────────────
  let assigneeIds: number[] | null = null
  if ('assigned_to' in changes) {
    const val = changes.assigned_to
    assigneeIds = Array.isArray(val)
      ? val.map((v: any) => parseInt(v)).filter((v: number) => !isNaN(v))
      : (val ? [parseInt(val)] : [])
  }
  const assignedTo = assigneeIds !== null
    ? (assigneeIds.length ? assigneeIds[0] : null)
    : cur.assigned_to

  await prisma.$executeRaw`
    UPDATE tasks SET
      title        = ${title},
      description  = ${description},
      bucket_id    = ${bucketId},
      assigned_to  = ${assignedTo},
      priority     = ${priority},
      status       = ${status},
      due_date     = ${dueDate},
      start_date   = ${startDate},
      completed_at = ${completedAt},
      updated_at   = NOW()
    WHERE id = ${id}
  `

  if (assigneeIds !== null) {
    // Lấy danh sách cũ trước khi xóa để so sánh
    const prevRows = await prisma.$queryRaw<{ user_id: number }[]>`
      SELECT user_id FROM task_assignees WHERE task_id=${id}
    `
    const prevIds = new Set(prevRows.map(r => r.user_id))

    await prisma.$executeRaw`DELETE FROM task_assignees WHERE task_id=${id}`
    for (const uid of assigneeIds) {
      await prisma.$executeRaw`
        INSERT INTO task_assignees (task_id, user_id) VALUES (${id}, ${uid})
        ON CONFLICT DO NOTHING
      `
    }

    const newSet     = new Set(assigneeIds)
    const addedIds    = assigneeIds.filter(uid => !prevIds.has(uid))
    const removedIds  = [...prevIds].filter(uid => !newSet.has(uid))

    if (addedIds.length > 0 || removedIds.length > 0) {
      const [actor] = await prisma.$queryRaw<{ full_name: string; role: string }[]>`
        SELECT full_name, role FROM users WHERE id = ${req.user!.id}
      `

      // Thông báo trong app (đồng bộ ngay)
      notifyAppReassignment({
        addedIds, removedIds,
        changedByName: actor?.full_name ?? 'Hệ thống',
        taskId: id, taskTitle: title,
      })

      Promise.all([getPlanName(cur.plan_id), getBucketName(bucketId)]).then(([planName, bucketName]) => {
        if (addedIds.length > 0 && removedIds.length > 0) {
          // Có người được thêm VÀ có người bị gỡ → đây là một lượt "đổi người" (reassign)
          notifyReassignment({
            addedIds, removedIds,
            changedByName: actor?.full_name ?? 'Hệ thống',
            changedByRole: actor?.role ?? null,
            taskId: id, taskTitle: title, planName, bucketName, status, priority,
            dueDate, description,
          })
        } else if (addedIds.length > 0) {
          // Chỉ thêm người mới, không gỡ ai → email giao việc bình thường
          notifyAssignees({
            newAssigneeIds: addedIds,
            assignerName: actor?.full_name ?? 'Hệ thống',
            assignerRole: actor?.role ?? null,
            taskId: id, taskTitle: title, planName, bucketName, status, priority,
            dueDate, description,
          })
        } else if (removedIds.length > 0) {
          // Chỉ gỡ người, không có người thay thế → vẫn báo cho người bị gỡ
          notifyReassignment({
            addedIds: [], removedIds,
            changedByName: actor?.full_name ?? 'Hệ thống',
            changedByRole: actor?.role ?? null,
            taskId: id, taskTitle: title, planName, bucketName, status, priority,
            dueDate, description,
          })
        }
      })
    }
  }

  // ── Đồng bộ checklist theo trạng thái mới ───────────────────────────
  // - "Chưa bắt đầu": bỏ tick toàn bộ checklist
  // - "Hoàn thành": tick toàn bộ checklist
  if ('status' in changes && status !== cur.status) {
    if (status === 'not_started') {
      await prisma.$executeRaw`UPDATE task_checklists SET is_done=false WHERE task_id=${id}`
    } else if (status === 'completed') {
      await prisma.$executeRaw`UPDATE task_checklists SET is_done=true WHERE task_id=${id}`
    }
  }

  const [updated] = await prisma.$queryRaw<any[]>`
    SELECT t.*, a.full_name AS assignee_name, a.avatar_url AS assignee_avatar
    FROM tasks t LEFT JOIN users a ON a.id = t.assigned_to
    WHERE t.id = ${id}
  `
  const checklists = await prisma.$queryRaw<any[]>`
    SELECT * FROM task_checklists WHERE task_id=${id} ORDER BY sort_order, id
  `
  const assignees = await prisma.$queryRaw<any[]>`
    SELECT u.id, u.full_name, u.avatar_url, u.role
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id=${id}
    ORDER BY u.full_name
  `
  res.json(successResponse({
    ...updated,
    checklists,
    assignees,
    check_total: checklists.length,
    check_done: checklists.filter((c: any) => c.is_done).length,
  }, 'Đã cập nhật'))
})

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

  // Lấy thông tin nhiệm vụ + người được giao TRƯỚC khi xóa
  // (xóa task sẽ cascade xóa luôn task_assignees nên phải lấy trước)
  const [task] = await prisma.$queryRaw<any[]>`SELECT * FROM tasks WHERE id=${id}`
  if (!task) throw new AppError(404, 'Nhiệm vụ không tồn tại')

  const assignees = await prisma.$queryRaw<{ id: number; email: string | null; full_name: string }[]>`
    SELECT u.id, u.email, u.full_name
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ${id}
  `

  const [deleter] = await prisma.$queryRaw<{ full_name: string; role: string }[]>`
    SELECT full_name, role FROM users WHERE id = ${req.user!.id}
  `

  await prisma.$executeRaw`DELETE FROM tasks WHERE id=${id}`

  // ── Thông báo trong app cho các assignee + người tạo (trừ người vừa xóa) ─
  const deletedById = req.user!.id
  const recipientIds = [...new Set([task.created_by, ...assignees.map(a => a.id)])]
    .filter(uid => uid !== deletedById)
  notifyAppTaskDeleted({
    recipientIds,
    deletedByName: deleter?.full_name ?? 'Hệ thống',
    taskTitle: task.title,
  })

  // ── Gửi email báo xóa nhiệm vụ cho các assignee (bất đồng bộ) ───────
  if (assignees.length > 0) {
    Promise.all([getPlanName(task.plan_id), getBucketName(task.bucket_id)]).then(([planName, bucketName]) => {
      notifyTaskDeleted({
        assignees,
        deletedByName: deleter?.full_name ?? 'Hệ thống',
        deletedByRole: deleter?.role ?? null,
        taskTitle: task.title,
        description: task.description,
        planName,
        bucketName,
        status: task.status,
        dueDate: task.due_date,
      })
    }).catch(err => console.error('[Email] Lỗi gửi email xóa nhiệm vụ:', err))
  }
  // ────────────────────────────────────────────────────────────────────

  res.json(successResponse(null, 'Đã xóa nhiệm vụ'))
})

export const reorderTask = asyncHandler(async (req: Request, res: Response) => {
  // body: { bucket_id: number|null, ordered_ids: number[] }
  const id = parseInt(req.params.id)
  const { bucket_id, ordered_ids } = req.body
  if (!Array.isArray(ordered_ids)) throw new AppError(400, 'Thiếu ordered_ids')

  const bucketIdVal = bucket_id !== undefined && bucket_id !== null ? parseInt(bucket_id) : null

  // Cập nhật bucket cho task được kéo (nếu đổi cột)
  await prisma.$executeRaw`
    UPDATE tasks SET bucket_id=${bucketIdVal}, updated_at=NOW() WHERE id=${id}
  `

  // Cập nhật sort_order cho toàn bộ task trong cột đích theo thứ tự gửi lên
  for (let i = 0; i < ordered_ids.length; i++) {
    const taskId = parseInt(ordered_ids[i])
    await prisma.$executeRaw`
      UPDATE tasks SET sort_order=${i} WHERE id=${taskId}
    `
  }

  const [task] = await prisma.$queryRaw<any[]>`
    SELECT t.*, a.full_name AS assignee_name, a.avatar_url AS assignee_avatar
    FROM tasks t LEFT JOIN users a ON a.id = t.assigned_to
    WHERE t.id = ${id}
  `
  res.json(successResponse(task, 'Đã sắp xếp lại'))
})

export const copyTask = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const createdBy = req.user!.id

  const existing = await prisma.$queryRaw<any[]>`SELECT * FROM tasks WHERE id=${id}`
  if (!existing.length) throw new AppError(404, 'Nhiệm vụ không tồn tại')
  const cur = existing[0]

  const { plan_id, bucket_id } = req.body
  const planIdInt   = plan_id   ? parseInt(plan_id)   : cur.plan_id
  const bucketIdVal = bucket_id !== undefined ? (bucket_id ? parseInt(bucket_id) : null) : cur.bucket_id

  let orderRows: any[]
  if (bucketIdVal !== null) {
    orderRows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(MAX(sort_order), -1) AS mo FROM tasks WHERE plan_id=${planIdInt} AND bucket_id=${bucketIdVal}
    `
  } else {
    orderRows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(MAX(sort_order), -1) AS mo FROM tasks WHERE plan_id=${planIdInt} AND bucket_id IS NULL
    `
  }
  const sortOrder = (orderRows[0]?.mo ?? -1) + 1

  const [task] = await prisma.$queryRaw<any[]>`
    INSERT INTO tasks
      (title, description, plan_id, bucket_id, created_by, assigned_to, priority, due_date, start_date, status, sort_order, created_at, updated_at)
    VALUES
      (${cur.title + ' (Copy)'}, ${cur.description}, ${planIdInt}, ${bucketIdVal}, ${createdBy}, ${cur.assigned_to},
       ${cur.priority}, ${cur.due_date}, ${cur.start_date}, 'not_started', ${sortOrder}, NOW(), NOW())
    RETURNING *
  `

  // Sao chép checklist
  const checklists = await prisma.$queryRaw<any[]>`
    SELECT * FROM task_checklists WHERE task_id=${id} ORDER BY sort_order, id
  `
  for (const cl of checklists) {
    await prisma.$executeRaw`
      INSERT INTO task_checklists (task_id, title, is_done, sort_order)
      VALUES (${task.id}, ${cl.title}, ${cl.is_done}, ${cl.sort_order})
    `
  }

  // Sao chép người được giao
  const assignees = await prisma.$queryRaw<any[]>`
    SELECT user_id FROM task_assignees WHERE task_id=${id}
  `
  for (const a of assignees) {
    await prisma.$executeRaw`
      INSERT INTO task_assignees (task_id, user_id) VALUES (${task.id}, ${a.user_id})
      ON CONFLICT DO NOTHING
    `
  }

  res.status(201).json(successResponse(task, 'Đã sao chép nhiệm vụ'))
})

// ── CHECKLISTS ────────────────────────────────────────────────────────

export const addChecklist = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const { title } = req.body
  if (!title?.trim()) throw new AppError(400, 'Nội dung không được để trống')

  const [row] = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(MAX(sort_order), -1) AS mo FROM task_checklists WHERE task_id=${taskId}
  `
  const nextOrder = (row.mo ?? -1) + 1

  const [item] = await prisma.$queryRaw<any[]>`
    INSERT INTO task_checklists (task_id, title, sort_order)
    VALUES (${taskId}, ${title.trim()}, ${nextOrder})
    RETURNING *
  `
  res.status(201).json(successResponse(item, 'Đã thêm'))
})

export const toggleChecklist = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const itemId = parseInt(req.params.itemId)

  // Toggle item
  await prisma.$executeRaw`
    UPDATE task_checklists SET is_done = NOT is_done
    WHERE id=${itemId} AND task_id=${taskId}
  `
  const [item] = await prisma.$queryRaw<any[]>`SELECT * FROM task_checklists WHERE id=${itemId}`

  // ── Auto-update task status based on checklist state ────────────────
  const [taskRow] = await prisma.$queryRaw<any[]>`SELECT status FROM tasks WHERE id=${taskId}`
  const allItems  = await prisma.$queryRaw<any[]>`SELECT is_done FROM task_checklists WHERE task_id=${taskId}`

  if (taskRow && allItems.length > 0) {
    const total    = allItems.length
    const doneCount = allItems.filter((r: any) => r.is_done).length
    const curStatus = taskRow.status as string

    let newStatus: string | null = null

    if (doneCount === total) {
      // All items ticked → completed
      newStatus = 'completed'
    } else if (doneCount > 0 && curStatus === 'not_started') {
      // First tick on a not-started task → in_progress
      newStatus = 'in_progress'
    } else if (doneCount === 0 && curStatus === 'in_progress') {
      // All unticked on an auto-started task → back to not_started
      newStatus = 'not_started'
    } else if (doneCount < total && curStatus === 'completed') {
      // Un-ticking a completed task → back to in_progress
      newStatus = 'in_progress'
    }

    if (newStatus) {
      await prisma.$executeRaw`
        UPDATE tasks SET status=${newStatus}, updated_at=NOW()
        WHERE id=${taskId}
      `
    }
  }

  // Return item + new task status so the client can update UI
  const [updatedTask] = await prisma.$queryRaw<any[]>`SELECT status FROM tasks WHERE id=${taskId}`
  res.json(successResponse({ ...item, task_status: updatedTask?.status ?? null }))
})

export const updateChecklist = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const itemId = parseInt(req.params.itemId)
  const { title } = req.body
  if (!title?.trim()) throw new AppError(400, 'Nội dung không được để trống')

  const rows = await prisma.$queryRaw<any[]>`
    UPDATE task_checklists SET title=${title.trim()}
    WHERE id=${itemId} AND task_id=${taskId}
    RETURNING *
  `
  if (!rows.length) throw new AppError(404, 'Mục không tồn tại')
  res.json(successResponse(rows[0], 'Đã cập nhật'))
})

export const deleteChecklist = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const itemId = parseInt(req.params.itemId)

  await prisma.$executeRaw`DELETE FROM task_checklists WHERE id=${itemId} AND task_id=${taskId}`
  res.json(successResponse(null, 'Đã xóa'))
})

// ── COMMENTS ─────────────────────────────────────────────────────────

export const getComments = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const userId = req.user!.id

  const participants = await getTaskParticipantIds(taskId)
  if (!participants || !participants.participantIds.includes(userId)) {
    throw new AppError(403, 'Bạn không có quyền xem nhiệm vụ này')
  }

  const comments = await prisma.$queryRaw`
    SELECT cm.*, u.full_name, u.avatar_url
    FROM task_comments cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.task_id=${taskId}
    ORDER BY cm.created_at ASC
  `
  res.json(successResponse(comments))
})

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.taskId)
  const userId = req.user!.id
  const { content } = req.body
  if (!content?.trim()) throw new AppError(400, 'Nội dung không được để trống')

  const participants = await getTaskParticipantIds(taskId)
  if (!participants || !participants.participantIds.includes(userId)) {
    throw new AppError(403, 'Bạn không có quyền bình luận trong nhiệm vụ này')
  }

  const [comment] = await prisma.$queryRaw<any[]>`
    INSERT INTO task_comments (task_id, user_id, content)
    VALUES (${taskId}, ${userId}, ${content.trim()})
    RETURNING *
  `

  // ── Thông báo cho những người liên quan khác trong task (trừ người vừa nhắn) ─
  // Bọc try/catch riêng: nếu gửi thông báo lỗi (vd. DB chưa migrate cột task_id)
  // thì vẫn không ảnh hưởng tới việc bình luận đã được thêm thành công.
  const recipientIds = participants.participantIds.filter(id => id !== userId)
  if (recipientIds.length) {
    try {
      const [sender] = await prisma.$queryRaw<{ full_name: string }[]>`
        SELECT full_name FROM users WHERE id = ${userId}
      `
      const [taskRow] = await prisma.$queryRaw<{ title: string }[]>`
        SELECT title FROM tasks WHERE id = ${taskId}
      `
      const senderName = sender?.full_name ?? 'Một thành viên'
      const taskTitle  = taskRow?.title ?? 'nhiệm vụ'
      const preview     = content.trim().slice(0, 120)

      await prisma.notification.createMany({
        data: recipientIds.map(uid => ({
          user_id: uid,
          task_id: taskId,
          type: 'task_comment',
          title: `${senderName} đã nhắn tin trong "${taskTitle}"`,
          message: preview,
        })),
      })
    } catch (err) {
      console.error('[Planner] Lỗi tạo thông báo bình luận task:', err)
    }
  }

  res.status(201).json(successResponse(comment, 'Đã thêm bình luận'))
})

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const taskId    = parseInt(req.params.taskId)
  const commentId = parseInt(req.params.commentId)

  await prisma.$executeRaw`DELETE FROM task_comments WHERE id=${commentId} AND task_id=${taskId}`
  res.json(successResponse(null, 'Đã xóa bình luận'))
})

// ── STATS (Chart view) ─────────────────────────────────────────────────

export const getPlanStats = asyncHandler(async (req: Request, res: Response) => {
  const planId = parseInt(req.params.planId)

  const byStatus = await prisma.$queryRaw<any[]>`
    SELECT status, COUNT(*)::int AS count
    FROM tasks WHERE plan_id=${planId}
    GROUP BY status
  `

  const byPriority = await prisma.$queryRaw<any[]>`
    SELECT priority, COUNT(*)::int AS count
    FROM tasks WHERE plan_id=${planId}
    GROUP BY priority
  `

  const byAssignee = await prisma.$queryRaw<any[]>`
    SELECT u.id AS user_id, u.full_name, u.avatar_url,
      COUNT(t.id)::int AS count,
      COUNT(CASE WHEN t.status='completed' THEN 1 END)::int AS completed
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.plan_id=${planId}
    GROUP BY u.id, u.full_name, u.avatar_url
    ORDER BY count DESC
  `

  const dueRows = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(CASE WHEN due_date IS NOT NULL AND due_date < NOW() AND status NOT IN ('completed','deferred') THEN 1 END)::int AS overdue,
      COUNT(CASE WHEN due_date IS NOT NULL AND due_date >= NOW() AND due_date < NOW() + INTERVAL '3 days' AND status NOT IN ('completed','deferred') THEN 1 END)::int AS due_soon,
      COUNT(CASE WHEN due_date IS NOT NULL AND due_date >= NOW() + INTERVAL '3 days' AND status NOT IN ('completed','deferred') THEN 1 END)::int AS on_track,
      COUNT(CASE WHEN due_date IS NULL THEN 1 END)::int AS no_due
    FROM tasks
    WHERE plan_id=${planId}
  `

  res.json(successResponse({
    byStatus,
    byPriority,
    byAssignee,
    byDue: dueRows[0] || { overdue: 0, due_soon: 0, on_track: 0, no_due: 0 },
  }))
})

// ── USERS (for assignee picker) ───────────────────────────────────────

export const getPlannerUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.$queryRaw`
    SELECT id, full_name, avatar_url, role
    FROM users
    WHERE is_active = true
    ORDER BY full_name
  `
  res.json(successResponse(users))
})
// ── MY TASKS (tasks assigned to current user, across all plans) ───────

export const getMyTasks = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { status, priority } = req.query
  const statusF   = (status   as string) || null
  const priorityF = (priority as string) || null

  const tasks = await prisma.$queryRaw<any[]>`
    SELECT
      t.*,
      p.name                                                        AS plan_name,
      b.name                                                        AS bucket_name,
      c.full_name                                                   AS creator_name,
      c.avatar_url                                                  AS creator_avatar,
      c.role                                                        AS creator_role,
      COUNT(DISTINCT cl.id)::int                                    AS check_total,
      COUNT(DISTINCT CASE WHEN cl.is_done THEN cl.id END)::int      AS check_done,
      COUNT(DISTINCT cm.id)::int                                    AS comment_count
    FROM tasks t
    JOIN task_assignees ta ON ta.task_id = t.id AND ta.user_id = ${userId}
    LEFT JOIN plans   p  ON p.id = t.plan_id
    LEFT JOIN buckets b  ON b.id = t.bucket_id
    LEFT JOIN users   c  ON c.id = t.created_by
    LEFT JOIN task_checklists cl ON cl.task_id = t.id
    LEFT JOIN task_comments   cm ON cm.task_id = t.id
    WHERE p.is_active = true
      AND (${statusF}::text   IS NULL OR t.status   = ${statusF}::text)
      AND (${priorityF}::text IS NULL OR t.priority = ${priorityF}::text)
    GROUP BY t.id, p.name, b.name, c.full_name, c.avatar_url, c.role
    ORDER BY
      CASE t.status
        WHEN 'in_progress' THEN 0
        WHEN 'not_started' THEN 1
        WHEN 'deferred'    THEN 2
        WHEN 'completed'   THEN 3
        ELSE 4
      END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `
  res.json(successResponse(tasks))
})