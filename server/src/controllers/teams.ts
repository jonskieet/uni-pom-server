// ============================================================
// server/src/controllers/teams.ts — Planner Module: Teams (Nhóm)
// 1 Team (Nhóm) chứa nhiều Plan (Kế hoạch) bên trong.
// Dùng $queryRaw / $executeRaw để không cần sửa schema.prisma
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── TEAMS ─────────────────────────────────────────────────────────────

export const getTeams = asyncHandler(async (req: Request, res: Response) => {
  const userId  = req.user!.id
  const isAdmin = req.user!.role === 'admin'

  const teams = await prisma.$queryRaw<any[]>`
    SELECT
      t.*,
      u.full_name                                                    AS creator_name,
      COUNT(DISTINCT p.id)::int                                      AS plan_count,
      COUNT(DISTINCT tk.id)::int                                     AS task_count,
      COUNT(DISTINCT CASE WHEN tk.status='completed' THEN tk.id END)::int AS completed_count,
      COUNT(DISTINCT tm.user_id)::int                                AS member_count,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', mu.id, 'full_name', mu.full_name, 'avatar_url', mu.avatar_url, 'role', mu.role
        )) FILTER (WHERE mu.id IS NOT NULL),
        '[]'
      )                                                               AS members
    FROM teams t
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN plans p ON p.team_id = t.id AND p.is_active = true
    LEFT JOIN tasks tk ON tk.plan_id = p.id
    LEFT JOIN team_members tm ON tm.team_id = t.id
    LEFT JOIN users mu ON mu.id = tm.user_id
    WHERE t.is_active = true
      AND (
        ${isAdmin} = true
        OR EXISTS (SELECT 1 FROM team_members me WHERE me.team_id = t.id AND me.user_id = ${userId})
      )
    GROUP BY t.id, u.full_name
    ORDER BY t.created_at DESC
  `
  res.json(successResponse(teams))
})

export const createTeam = asyncHandler(async (req: Request, res: Response) => {
  const { name, description, color, icon, member_ids } = req.body
  const createdBy = req.user!.id
  if (!name?.trim()) throw new AppError(400, 'Tên nhóm không được để trống')

  const memberIds: number[] = Array.isArray(member_ids)
    ? [...new Set(member_ids.map((x: any) => parseInt(x)).filter((x: number) => !!x && x !== createdBy))]
    : []

  const [team] = await prisma.$queryRaw<any[]>`
    INSERT INTO teams (name, description, color, icon, created_by, created_at, updated_at)
    VALUES (${name.trim()}, ${description || null}, ${color || 'indigo'}, ${icon || null}, ${createdBy}, NOW(), NOW())
    RETURNING *
  `

  await prisma.$executeRaw`
    INSERT INTO team_members (team_id, user_id, role) VALUES (${team.id}, ${createdBy}, 'owner')
    ON CONFLICT DO NOTHING
  `
  if (memberIds.length) {
    await prisma.$executeRaw`
      INSERT INTO team_members (team_id, user_id, role)
      SELECT ${team.id}, u.id, 'member' FROM users u WHERE u.id = ANY(${memberIds}::int[])
      ON CONFLICT DO NOTHING
    `
  }

  res.status(201).json(successResponse(team, 'Đã tạo nhóm'))
})

export const updateTeam = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const { name, description, color, icon } = req.body
  if (!name?.trim()) throw new AppError(400, 'Tên nhóm không được để trống')

  const rows = await prisma.$queryRaw<any[]>`
    UPDATE teams SET
      name=${name.trim()},
      description=${description ?? null},
      color=COALESCE(${color ?? null}, color),
      icon=COALESCE(${icon ?? null}, icon),
      updated_at=NOW()
    WHERE id=${id} AND is_active=true
    RETURNING *
  `
  if (!rows.length) throw new AppError(404, 'Nhóm không tồn tại')
  res.json(successResponse(rows[0], 'Đã cập nhật nhóm'))
})

export const deleteTeam = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  // Soft delete team + tất cả plan bên trong
  await prisma.$executeRaw`UPDATE teams SET is_active=false WHERE id=${id}`
  await prisma.$executeRaw`UPDATE plans SET is_active=false WHERE team_id=${id}`
  res.json(successResponse(null, 'Đã xóa nhóm'))
})

// ── TEAM MEMBERS ─────────────────────────────────────────────────────

export const getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInt(req.params.teamId)
  const members = await prisma.$queryRaw<any[]>`
    SELECT u.id, u.full_name, u.avatar_url, u.role, tm.role AS member_role, tm.added_at
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ${teamId}
    ORDER BY (tm.role = 'owner') DESC, u.full_name
  `
  res.json(successResponse(members))
})

export const addTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInt(req.params.teamId)
  const { user_ids } = req.body
  if (!Array.isArray(user_ids) || !user_ids.length) {
    throw new AppError(400, 'Vui lòng chọn người để thêm vào nhóm')
  }
  const teamRows = await prisma.$queryRaw<any[]>`SELECT * FROM teams WHERE id=${teamId} AND is_active=true`
  if (!teamRows.length) throw new AppError(404, 'Nhóm không tồn tại')

  const ids = [...new Set(user_ids.map((x: any) => parseInt(x)).filter(Boolean))]
  await prisma.$executeRaw`
    INSERT INTO team_members (team_id, user_id, role)
    SELECT ${teamId}, u.id, 'member' FROM users u WHERE u.id = ANY(${ids}::int[])
    ON CONFLICT DO NOTHING
  `
  const members = await prisma.$queryRaw<any[]>`
    SELECT u.id, u.full_name, u.avatar_url, u.role, tm.role AS member_role, tm.added_at
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ${teamId}
    ORDER BY (tm.role = 'owner') DESC, u.full_name
  `
  res.status(201).json(successResponse(members, 'Đã thêm thành viên'))
})

export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const teamId = parseInt(req.params.teamId)
  const userId = parseInt(req.params.userId)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT role FROM team_members WHERE team_id=${teamId} AND user_id=${userId}
  `
  if (!rows.length) throw new AppError(404, 'Người này không phải thành viên của nhóm')
  if (rows[0].role === 'owner') throw new AppError(400, 'Không thể xóa chủ sở hữu nhóm')

  await prisma.$executeRaw`DELETE FROM team_members WHERE team_id=${teamId} AND user_id=${userId}`
  // Đồng thời gỡ khỏi các plan_members của những plan thuộc team này
  await prisma.$executeRaw`
    DELETE FROM plan_members pm
    USING plans p
    WHERE pm.plan_id = p.id AND p.team_id = ${teamId} AND pm.user_id = ${userId}
  `
  res.json(successResponse(null, 'Đã xóa thành viên khỏi nhóm'))
})
