import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../middleware/errorHandler'
import { successResponse } from '../utils/response'

const shared = global as typeof global & { _prisma?: PrismaClient }
if (!shared._prisma) shared._prisma = new PrismaClient()
const prisma = shared._prisma

// Same auth/visibility as unfiltered GET /poms (anyRole). No contact/product
// enrichment, per-record queries, pagination, or writes. One grouped query
// returns the complete lightweight cohort for accurate dashboard totals.
export const getPomsDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<Array<{
    id: number; pom_code: string; project_name: string; customer_name: string | null;
    status: string; created_at: Date; updated_at: Date; created_by_name: string;
    item_count: number; total_amount: unknown;
  }>>`
    SELECT p.id, p.pom_code, p.project_name, p.customer_name,
           p.status::text AS status, p.created_at, p.updated_at,
           u.full_name AS created_by_name,
           COALESCE(i.item_count, 0)::integer AS item_count,
           COALESCE(i.total_amount, 0) AS total_amount
    FROM poms p
    JOIN users u ON u.id = p.created_by
    LEFT JOIN (
      SELECT pom_id, COUNT(*)::integer AS item_count,
             SUM(COALESCE(sale_price, unit_price) * quantity * (1 + vat_rate)) AS total_amount
      FROM pom_items GROUP BY pom_id
    ) i ON i.pom_id = p.id
    ORDER BY p.created_at DESC, p.id DESC
  `
  res.json(successResponse({
    rows: rows.map(row => ({ ...row, total_amount: Number(row.total_amount) })),
    total: rows.length,
    loaded_at: new Date().toISOString(),
  }))
})
