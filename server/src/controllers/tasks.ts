// ============================================================
// server/src/controllers/tasks.ts — Planner Module
// Dùng $queryRaw / $executeRaw để không cần sửa schema.prisma
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

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

  const tasks = await prisma.$queryRaw<any[]>`
    SELECT
      t.*,
      a.full_name   AS assignee_name,
      a.avatar_url  AS assignee_avatar,
      a.role        AS assignee_role,
      c.full_name   AS creator_name,
      COUNT(DISTINCT cl.id)::int                              AS check_total,
      COUNT(DISTINCT CASE WHEN cl.is_done THEN cl.id END)::int AS check_done
    FROM tasks t
    LEFT JOIN users a  ON a.id = t.assigned_to
    LEFT JOIN users c  ON c.id = t.created_by
    LEFT JOIN task_checklists cl ON cl.task_id = t.id
    WHERE t.plan_id = ${planId}
      AND (${assignedToF}::int    IS NULL OR t.assigned_to = ${assignedToF}::int)
      AND (${statusF}::text       IS NULL OR t.status      = ${statusF}::text)
      AND (${priorityF}::text     IS NULL OR t.priority    = ${priorityF}::text)
    GROUP BY t.id, a.full_name, a.avatar_url, a.role, c.full_name
    ORDER BY t.bucket_id NULLS FIRST, t.sort_order, t.created_at
  `
  res.json(successResponse(tasks))
})

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

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

  res.json(successResponse({ ...rows[0], checklists, comments }))
})

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, plan_id, bucket_id, assigned_to, priority, due_date, start_date, status } = req.body
  const createdBy = req.user!.id

  if (!title?.trim()) throw new AppError(400, 'Tên nhiệm vụ không được để trống')
  if (!plan_id)       throw new AppError(400, 'Thiếu plan_id')

  const planIdInt    = parseInt(plan_id)
  const bucketIdVal  = bucket_id   ? parseInt(bucket_id)   : null
  const assigneeVal  = assigned_to ? parseInt(assigned_to) : null
  const dueDateVal   = due_date    || null
  const startDateVal = start_date  || null
  const statusVal    = status      || 'not_started'
  const priorityVal  = priority    || 'medium'

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
      (${title.trim()}, ${description || null}, ${planIdInt}, ${bucketIdVal}, ${createdBy}, ${assigneeVal},
       ${priorityVal}, ${dueDateVal ? new Date(dueDateVal) : null}, ${startDateVal ? new Date(startDateVal) : null},
       ${statusVal}, ${sortOrder}, NOW(), NOW())
    RETURNING *
  `

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
  const assignedTo  = 'assigned_to' in changes ? (changes.assigned_to ? parseInt(changes.assigned_to) : null) : cur.assigned_to
  const priority    = 'priority'    in changes ? changes.priority  : cur.priority
  const status      = 'status'      in changes ? changes.status    : cur.status
  const dueDate     = 'due_date'    in changes ? (changes.due_date ? new Date(changes.due_date) : null) : cur.due_date
  const startDate   = 'start_date'  in changes ? (changes.start_date ? new Date(changes.start_date) : null) : cur.start_date
  const completedAt = status === 'completed' && cur.status !== 'completed'
    ? new Date()
    : (status !== 'completed' ? null : cur.completed_at)

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

  const [updated] = await prisma.$queryRaw<any[]>`
    SELECT t.*, a.full_name AS assignee_name, a.avatar_url AS assignee_avatar
    FROM tasks t LEFT JOIN users a ON a.id = t.assigned_to
    WHERE t.id = ${id}
  `
  res.json(successResponse(updated, 'Đã cập nhật'))
})

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  await prisma.$executeRaw`DELETE FROM tasks WHERE id=${id}`
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

  await prisma.$executeRaw`
    UPDATE task_checklists SET is_done = NOT is_done
    WHERE id=${itemId} AND task_id=${taskId}
  `
  const [item] = await prisma.$queryRaw<any[]>`SELECT * FROM task_checklists WHERE id=${itemId}`
  res.json(successResponse(item))
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

  const [comment] = await prisma.$queryRaw<any[]>`
    INSERT INTO task_comments (task_id, user_id, content)
    VALUES (${taskId}, ${userId}, ${content.trim()})
    RETURNING *
  `
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
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.plan_id=${planId} AND t.assigned_to IS NOT NULL
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