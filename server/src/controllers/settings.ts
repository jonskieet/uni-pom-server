// ============================================================
// src/controllers/settings.ts — System settings (roles & modules)
// Lưu role metadata và module definitions vào DB thay vì localStorage
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

// ── Prisma singleton (shared connection pool) ────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// Raw query vì system_settings chưa có trong Prisma schema
// Dùng $queryRaw để đọc / $executeRaw để ghi
const ALLOWED_KEYS = ['roles', 'modules'] as const
type SettingKey = typeof ALLOWED_KEYS[number]

function isAllowedKey(k: string): k is SettingKey {
  return ALLOWED_KEYS.includes(k as SettingKey)
}

/**
 * GET /settings/:key — Lấy một setting (roles | modules)
 */
export const getSetting = asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params
  if (!isAllowedKey(key)) throw new AppError(400, `Key không hợp lệ. Chỉ chấp nhận: ${ALLOWED_KEYS.join(', ')}`)

  const rows = await prisma.$queryRawUnsafe<{ value: any }[]>(
    `SELECT value FROM public.system_settings WHERE key = $1`, key
  )

  if (!rows.length) {
    res.json(successResponse(null))
    return
  }

  res.json(successResponse(rows[0].value))
})

/**
 * PUT /settings/:key — Ghi một setting (admin only)
 * Body: { value: any[] }
 */
export const setSetting = asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params
  if (!isAllowedKey(key)) throw new AppError(400, `Key không hợp lệ. Chỉ chấp nhận: ${ALLOWED_KEYS.join(', ')}`)

  const { value } = req.body
  if (value === undefined || value === null) throw new AppError(400, 'Thiếu field "value" trong body')

  const userId = req.user?.id ?? null
  const json   = JSON.stringify(value)

  await prisma.$executeRawUnsafe(
    `INSERT INTO public.system_settings (key, value, updated_by)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
    key, json, userId
  )

  res.json(successResponse({ key, updated: true }))
})

/**
 * GET /settings — Lấy tất cả settings (roles + modules) trong 1 request
 */
export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRawUnsafe<{ key: string; value: any }[]>(
    `SELECT key, value FROM public.system_settings WHERE key = ANY($1::text[])`,
    ALLOWED_KEYS
  )

  const result: Record<string, any> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }

  res.json(successResponse(result))
})