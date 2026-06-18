// ============================================================
// server/src/controllers/wards.ts
// Quản lý Phường/Xã/UBND + Liên hệ + Hoạt động
// ============================================================
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ── PROVINCES ────────────────────────────────────────────────
export const getProvinces = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT p.*, COUNT(d.id)::int AS district_count
    FROM provinces p
    LEFT JOIN districts d ON d.province_id = p.id AND d.is_active = TRUE
    WHERE p.is_active = TRUE
    GROUP BY p.id
    ORDER BY p.name
  `
  res.json(successResponse(rows))
})

// ── DISTRICTS ────────────────────────────────────────────────
export const getDistricts = asyncHandler(async (req: Request, res: Response) => {
  const province_id = req.query.province_id ? parseInt(req.query.province_id as string) : null
  const rows = province_id
    ? await prisma.$queryRaw<any[]>`
        SELECT d.*, COUNT(w.id)::int AS ward_count
        FROM districts d
        LEFT JOIN wards w ON w.district_id = d.id AND w.is_active = TRUE
        WHERE d.is_active = TRUE AND d.province_id = ${province_id}
        GROUP BY d.id ORDER BY d.name
      `
    : await prisma.$queryRaw<any[]>`
        SELECT d.*, COUNT(w.id)::int AS ward_count
        FROM districts d
        LEFT JOIN wards w ON w.district_id = d.id AND w.is_active = TRUE
        WHERE d.is_active = TRUE
        GROUP BY d.id ORDER BY d.name
      `
  res.json(successResponse(rows))
})

// ── WARDS ────────────────────────────────────────────────────
export const getWards = asyncHandler(async (req: Request, res: Response) => {
  const {
    province_id, district_id, relationship_status, assigned_sale_id, search,
    page = '1', limit = '30'
  } = req.query

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
  const lim  = parseInt(limit as string)

  // Build dynamic where
  const conditions: string[] = ['w.is_active = TRUE']
  const params: any[] = []

  if (province_id) { params.push(parseInt(province_id as string)); conditions.push(`d.province_id = $${params.length}`) }
  if (district_id) { params.push(parseInt(district_id as string)); conditions.push(`w.district_id = $${params.length}`) }
  if (relationship_status) { params.push(relationship_status); conditions.push(`w.relationship_status = $${params.length}`) }
  if (assigned_sale_id) { params.push(parseInt(assigned_sale_id as string)); conditions.push(`w.assigned_sale_id = $${params.length}`) }
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(w.name ILIKE $${params.length} OR w.full_name ILIKE $${params.length} OR w.address ILIKE $${params.length})`)
  }

  const where = 'WHERE ' + conditions.join(' AND ')
  const base = `
    FROM wards w
    LEFT JOIN districts d ON d.id = w.district_id
    LEFT JOIN provinces p ON p.id = d.province_id
    LEFT JOIN users u     ON u.id = w.assigned_sale_id
  `

  params.push(lim); const limitIdx = params.length
  params.push(skip); const skipIdx = params.length

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT w.*, d.name AS district_name, d.type AS district_type,
           d.province_id,
           p.id AS province_id, p.name AS province_name, p.short_name AS province_short,
           u.full_name AS assigned_sale_name,
           (SELECT COUNT(*)::int FROM contacts c WHERE c.ward_id = w.id AND c.is_active = TRUE) AS contact_count,
           (SELECT COUNT(*)::int FROM ward_activities a WHERE a.ward_id = w.id) AS activity_count,
           (SELECT COUNT(*)::int FROM poms pm WHERE pm.ward_id = w.id) AS pom_count
    ${base} ${where}
    ORDER BY p.name, d.name, w.name
    LIMIT $${limitIdx} OFFSET $${skipIdx}
  `, ...params)

  const countParams = params.slice(0, params.length - 2)
  const [countRow] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(DISTINCT w.id)::int AS total ${base} ${where}`,
    ...countParams
  )

  res.json(successResponse({ data: rows, total: countRow?.total ?? 0, page: parseInt(page as string), limit: lim }))
})

export const getWardById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const [ward] = await prisma.$queryRaw<any[]>`
    SELECT w.*, d.name AS district_name,
           d.province_id,
           p.id AS province_id, p.name AS province_name, p.short_name AS province_short,
           u.full_name AS assigned_sale_name,
           (SELECT COUNT(*)::int FROM contacts c WHERE c.ward_id = w.id AND c.is_active = TRUE) AS contact_count,
           (SELECT COUNT(*)::int FROM ward_activities a WHERE a.ward_id = w.id) AS activity_count,
           (SELECT COUNT(*)::int FROM poms pm WHERE pm.ward_id = w.id) AS pom_count
    FROM wards w
    LEFT JOIN districts d ON d.id = w.district_id
    LEFT JOIN provinces p ON p.id = d.province_id
    LEFT JOIN users u     ON u.id = w.assigned_sale_id
    WHERE w.id = ${id}
  `
  if (!ward) throw new AppError(404, 'Không tìm thấy UBND')
  res.json(successResponse(ward))
})

export const createWard = asyncHandler(async (req: Request, res: Response) => {
  const {
    district_id, code, name, type = 'phuong', full_name, address, phone, email, website,
    relationship_status = 'chua_tiep_can', first_visit_date, last_visit_date,
    current_leader_name, current_leader_title, current_leader_phone, current_leader_email,
    assigned_sale_id, note,
  } = req.body
  if (!district_id || !name) throw new AppError(400, 'district_id và name là bắt buộc')
  const autoFullName = full_name || `UBND ${type === 'phuong' ? 'Phường' : type === 'xa' ? 'Xã' : 'Thị trấn'} ${name}`
  // Auto-generate code nếu không cung cấp (DB: code NOT NULL UNIQUE)
  const autoCode = code || `W-${district_id}-${name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/[^a-zA-Z0-9]/g,'-').toLowerCase().replace(/-+/g,'-').slice(0,30)}-${Date.now().toString(36)}`
  const [ward] = await prisma.$queryRaw<any[]>`
    INSERT INTO wards (district_id,code,name,type,full_name,address,phone,email,website,
      relationship_status,first_visit_date,last_visit_date,
      current_leader_name,current_leader_title,current_leader_phone,current_leader_email,
      assigned_sale_id,note)
    VALUES (${parseInt(district_id)},${autoCode},${name},${type},${autoFullName},
      ${address||null},${phone||null},${email||null},${website||null},
      ${relationship_status},
      ${first_visit_date||null}::date,${last_visit_date||null}::date,
      ${current_leader_name||null},${current_leader_title||null},
      ${current_leader_phone||null},${current_leader_email||null},
      ${assigned_sale_id ? parseInt(assigned_sale_id) : null},${note||null})
    RETURNING *
  `
  res.status(201).json(successResponse(ward, 'Đã thêm UBND'))
})

export const updateWard = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const allowed = ['name','type','full_name','address','phone','email','website',
    'relationship_status','first_visit_date','last_visit_date','visit_count',
    'current_leader_name','current_leader_title','current_leader_phone','current_leader_email',
    'assigned_sale_id','note']
  const sets: string[] = []; const vals: any[] = []
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { vals.push(req.body[f] ?? null); sets.push(`${f} = $${vals.length}`) }
  })
  if (!sets.length) throw new AppError(400, 'Không có dữ liệu cập nhật')
  vals.push(id)
  const [ward] = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE wards SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, ...vals
  )
  res.json(successResponse(ward, 'Đã cập nhật'))
})

export const deleteWard = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  await prisma.$queryRaw`UPDATE wards SET is_active = FALSE WHERE id = ${id}`
  res.json(successResponse(null, 'Đã xoá UBND'))
})

// ── WARD SUMMARY (dropdown nhẹ) ──────────────────────────────
export const getWardSummary = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT w.id, w.name, w.full_name, w.type, w.address, w.phone, w.relationship_status,
           d.name AS district_name, d.province_id,
           p.id AS province_id, p.name AS province_name, p.short_name AS province_short,
           c.full_name AS primary_contact_name, c.phone AS primary_contact_phone, c.title AS primary_contact_title
    FROM wards w
    LEFT JOIN districts d ON d.id = w.district_id
    LEFT JOIN provinces p ON p.id = d.province_id
    LEFT JOIN contacts c  ON c.ward_id = w.id AND c.is_primary = TRUE AND c.is_active = TRUE
    WHERE w.is_active = TRUE
    ORDER BY p.name, d.name, w.name
  `
  res.json(successResponse(rows))
})

// ── CONTACTS ─────────────────────────────────────────────────
export const getContacts = asyncHandler(async (req: Request, res: Response) => {
  const {
    ward_id, province_id, district_id, search, relationship_status, assigned_to,
    page = '1', limit = '50'
  } = req.query

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
  const lim  = parseInt(limit as string)

  const conditions: string[] = ['c.is_active = TRUE']
  const params: any[] = []

  if (ward_id)             { params.push(parseInt(ward_id as string));             conditions.push(`c.ward_id = $${params.length}`) }
  if (province_id)         { params.push(parseInt(province_id as string));         conditions.push(`d.province_id = $${params.length}`) }
  if (district_id)         { params.push(parseInt(district_id as string));         conditions.push(`w.district_id = $${params.length}`) }
  if (assigned_to)         { params.push(parseInt(assigned_to as string));         conditions.push(`c.assigned_to = $${params.length}`) }
  if (relationship_status) { params.push(relationship_status as string);           conditions.push(`w.relationship_status = $${params.length}`) }
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.title ILIKE $${params.length} OR w.full_name ILIKE $${params.length} OR w.name ILIKE $${params.length})`)
  }

  const where = 'WHERE ' + conditions.join(' AND ')
  const baseFrom = `
    FROM contacts c
    LEFT JOIN wards w     ON w.id = c.ward_id
    LEFT JOIN districts d ON d.id = w.district_id
    LEFT JOIN provinces p ON p.id = d.province_id
  `

  params.push(lim);  const limitIdx = params.length
  params.push(skip); const skipIdx  = params.length

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*,
           w.name AS ward_name, w.full_name AS ward_full_name,
           w.relationship_status AS ward_relationship_status,
           d.name AS district_name,
           p.name AS province_name,
           u.full_name AS assigned_to_name
    ${baseFrom}
    LEFT JOIN users u ON u.id = c.assigned_to
    ${where}
    ORDER BY c.is_primary DESC, c.full_name
    LIMIT $${limitIdx} OFFSET $${skipIdx}
  `, ...params)

  const countParams = params.slice(0, params.length - 2)
  const [countRow] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(DISTINCT c.id)::int AS total ${baseFrom} ${where}`,
    ...countParams
  )

  res.json(successResponse({ data: rows, total: countRow?.total ?? 0, page: parseInt(page as string), limit: lim }))
})

export const createContact = asyncHandler(async (req: Request, res: Response) => {
  const { ward_id, full_name, gender, phone, phone_alt, email, title, department,
          decision_role = 'influencer', zalo, birthday, note, is_primary = false,
          assigned_to } = req.body
  if (!ward_id || !full_name || !phone || !title) throw new AppError(400, 'ward_id, full_name, phone, title là bắt buộc')
  if (is_primary) {
    await prisma.$queryRaw`UPDATE contacts SET is_primary = FALSE WHERE ward_id = ${parseInt(ward_id)}`
  }
  const assignedToVal = assigned_to ? parseInt(String(assigned_to)) : null
  const [contact] = await prisma.$queryRaw<any[]>`
    INSERT INTO contacts (ward_id,full_name,gender,phone,phone_alt,email,title,department,decision_role,zalo,birthday,note,is_primary,assigned_to)
    VALUES (${parseInt(ward_id)},${full_name},${gender||null},${phone},${phone_alt||null},${email||null},
            ${title},${department||null},${decision_role},${zalo||null},${birthday||null}::date,${note||null},${!!is_primary},${assignedToVal})
    RETURNING *
  `
  res.status(201).json(successResponse(contact, 'Đã thêm liên hệ'))
})

export const updateContact = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const allowed = ['full_name','gender','phone','phone_alt','email','title','department','decision_role','zalo','birthday','note','is_primary','assigned_to']
  const sets: string[] = []; const vals: any[] = []
  if (req.body.is_primary) {
    const [c] = await prisma.$queryRaw<any[]>`SELECT ward_id FROM contacts WHERE id = ${id}`
    await prisma.$queryRaw`UPDATE contacts SET is_primary = FALSE WHERE ward_id = ${c.ward_id}`
  }
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { vals.push(req.body[f] ?? null); sets.push(`${f} = $${vals.length}`) }
  })
  if (!sets.length) throw new AppError(400, 'Không có dữ liệu')
  vals.push(id)
  const [contact] = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE contacts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, ...vals
  )
  res.json(successResponse(contact))
})

export const deleteContact = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  await prisma.$queryRaw`UPDATE contacts SET is_active = FALSE WHERE id = ${id}`
  res.json(successResponse(null, 'Đã xoá liên hệ'))
})

// ── ACTIVITIES ───────────────────────────────────────────────
export const getActivities = asyncHandler(async (req: Request, res: Response) => {
  const ward_id = parseInt(req.query.ward_id as string)
  if (!ward_id) throw new AppError(400, 'ward_id là bắt buộc')
  const rows = await prisma.$queryRaw<any[]>`
    SELECT a.*, u.full_name AS performed_by_name, c.full_name AS contact_name, pm.pom_code
    FROM ward_activities a
    LEFT JOIN users u    ON u.id = a.performed_by
    LEFT JOIN contacts c ON c.id = a.contact_id
    LEFT JOIN poms pm    ON pm.id = a.pom_id
    WHERE a.ward_id = ${ward_id}
    ORDER BY a.activity_date DESC, a.created_at DESC
  `
  res.json(successResponse(rows))
})

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const { ward_id, contact_id, pom_id, activity_type, title, description,
          activity_date, outcome, next_action, next_action_date } = req.body
  const actorId = req.user!.id
  if (!ward_id || !activity_type || !title) throw new AppError(400, 'ward_id, activity_type, title là bắt buộc')
  const aDate = activity_date || new Date().toISOString().slice(0,10)
  const [activity] = await prisma.$queryRaw<any[]>`
    INSERT INTO ward_activities (ward_id,contact_id,pom_id,activity_type,title,description,activity_date,outcome,next_action,next_action_date,performed_by)
    VALUES (${parseInt(ward_id)},${contact_id ? parseInt(contact_id) : null},${pom_id ? parseInt(pom_id) : null},
            ${activity_type},${title},${description||null},${aDate}::date,${outcome||null},
            ${next_action||null},${next_action_date||null}::date,${actorId})
    RETURNING *
  `
  if (activity_type === 'visit') {
    await prisma.$queryRaw`
      UPDATE wards SET
        last_visit_date  = ${aDate}::date,
        visit_count      = visit_count + 1,
        first_visit_date = COALESCE(first_visit_date, ${aDate}::date),
        updated_at       = NOW()
      WHERE id = ${parseInt(ward_id)}
    `
  }
  res.status(201).json(successResponse(activity, 'Đã ghi hoạt động'))
})