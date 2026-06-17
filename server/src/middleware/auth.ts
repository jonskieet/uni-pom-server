// ============================================================
// src/middleware/auth.ts — v3 (thêm ke_toan role)
// ============================================================

import { Request, Response, NextFunction } from 'express'
import { extractToken, verifyToken, JwtPayload } from '../utils/jwt'
import { errorResponse } from '../utils/response'

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req.headers.authorization)
  if (!token) {
    res.status(401).json(errorResponse('Missing or invalid authorization header'))
    return
  }
  const user = verifyToken(token)
  if (!user) {
    res.status(401).json(errorResponse('Invalid or expired token'))
    return
  }
  req.user = user
  next()
}

// ── Helper ────────────────────────────────────────────────────────────────────
function checkRoles(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(errorResponse('Unauthorized'))
      return
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json(errorResponse(`Requires one of: ${allowed.join(', ')}`))
      return
    }
    next()
  }
}

// ── Roles ────────────────────────────────────────────────────────────────────

export const adminOnly           = checkRoles(['admin'])
export const adminOrTechLead     = checkRoles(['admin', 'technical_lead'])
export const adminOrTechnical    = checkRoles(['admin', 'technical'])
export const technicalRoles      = checkRoles(['admin', 'technical', 'technical_lead'])
export const adminOrSaleAdmin    = checkRoles(['admin', 'sales_admin'])
export const adminOrSale         = checkRoles(['admin', 'sales'])
export const salesRoles          = checkRoles(['admin', 'sales_admin', 'sales'])
export const adminOrSales        = checkRoles(['admin', 'sales_admin', 'sales'])  // compat
export const adminTechnicalOrSales = checkRoles(['admin', 'technical', 'technical_lead', 'sales_admin', 'sales'])

/** Mọi role đã đăng nhập (kể cả ke_toan) */
export const anyRole = checkRoles([
  'admin', 'sales_admin', 'sales', 'technical', 'technical_lead', 'ke_toan'
])

/** Kế toán + Admin — xem chấm công & công tác phí */
export const keToansAndAdmin = checkRoles(['admin', 'ke_toan'])

/** Roles được phép tạo báo cáo công tác (trừ admin, ke_toan, sales_admin) */
export const tripCreators = checkRoles(['sales', 'technical', 'technical_lead'])
