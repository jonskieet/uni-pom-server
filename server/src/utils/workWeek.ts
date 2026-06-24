// ============================================================
// src/utils/workWeek.ts — Cấu hình ngày làm việc trong tuần
//
// Thay cho "khung giờ làm việc" (giờ vào/ra, đi trễ) đã bị loại bỏ.
// Lưu trong system_settings, key = 'attendance_work_week'.
// Cho phép cấu hình mỗi ngày trong tuần là: nghỉ hẳn / làm cả ngày /
// chỉ làm buổi sáng / chỉ làm buổi chiều — ví dụ: Thứ 2 → Thứ 6 làm
// cả ngày, Thứ 7 chỉ làm buổi sáng, Chủ nhật nghỉ.
// ============================================================

import { PrismaClient } from '@prisma/client'

export type DayMode = 'off' | 'full' | 'half_morning' | 'half_afternoon'

export const DAY_MODE_LABEL: Record<DayMode, string> = {
  off: 'Nghỉ',
  full: 'Làm cả ngày',
  half_morning: 'Chỉ làm buổi sáng',
  half_afternoon: 'Chỉ làm buổi chiều',
}

export const WEEKDAY_LABEL: Record<number, string> = {
  0: 'Chủ nhật', 1: 'Thứ 2', 2: 'Thứ 3', 3: 'Thứ 4', 4: 'Thứ 5', 5: 'Thứ 6', 6: 'Thứ 7',
}

// Mặc định: Thứ 2 → Thứ 7 làm cả ngày, Chủ nhật nghỉ
// (Admin/kế toán có thể chỉnh lại trong "Quản lý chấm công" nếu công ty
// có ngày làm nửa buổi, ví dụ Thứ 7 chỉ làm sáng)
export const DEFAULT_WORK_WEEK: Record<number, DayMode> = {
  0: 'off', 1: 'full', 2: 'full', 3: 'full', 4: 'full', 5: 'full', 6: 'full',
}

let cache: { value: Record<number, DayMode>; ts: number } | null = null
const CACHE_TTL_MS = 30_000

function normalize(raw: any): Record<number, DayMode> {
  const out: Record<number, DayMode> = { ...DEFAULT_WORK_WEEK }
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const dow = Number(k)
      if (!isNaN(dow) && dow >= 0 && dow <= 6) out[dow] = raw[k]
    }
  }
  return out
}

export async function getWorkWeekConfig(prisma: PrismaClient): Promise<Record<number, DayMode>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.value
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT value FROM public.system_settings WHERE key = 'attendance_work_week'`
  )
  const value = normalize(rows[0]?.value)
  cache = { value, ts: Date.now() }
  return value
}

export function invalidateWorkWeekCache() {
  cache = null
}

/** Trọng số 1 ngày: 1 (làm cả ngày), 0.5 (nửa ngày), 0 (nghỉ hẳn) */
export function dayWeight(cfg: Record<number, DayMode>, dow: number): number {
  const mode = cfg[dow] ?? 'off'
  if (mode === 'full') return 1
  if (mode === 'half_morning' || mode === 'half_afternoon') return 0.5
  return 0
}

export function isWorkDay(cfg: Record<number, DayMode>, dow: number): boolean {
  return dayWeight(cfg, dow) > 0
}

/** 'morning' | 'afternoon' nào còn làm việc trong ngày làm nửa buổi, để chặn xin nghỉ nửa buổi không hợp lệ */
export function workingHalf(cfg: Record<number, DayMode>, dow: number): 'morning' | 'afternoon' | null {
  const mode = cfg[dow] ?? 'off'
  if (mode === 'half_morning') return 'morning'
  if (mode === 'half_afternoon') return 'afternoon'
  return null
}
