// ============================================================
// src/middleware/auth.ts — v2 (thêm sales_admin role)
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

// Helper dùng nội bộ
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

// Admin toàn quyền
export const adminOnly = checkRoles(['admin'])

// TP KT duyệt BOM
export const adminOrTechLead = checkRoles(['admin', 'technical_lead'])

// Kỹ thuật tạo BOM / báo cáo
export const adminOrTechnical = checkRoles(['admin', 'technical'])

// Tất cả kỹ thuật (technical + technical_lead)
export const technicalRoles = checkRoles(['admin', 'technical', 'technical_lead'])

// Sale Admin: định giá BOM
export const adminOrSaleAdmin = checkRoles(['admin', 'sales_admin'])

// Sale (mới): tư vấn KH, chốt HĐ
export const adminOrSale = checkRoles(['admin', 'sales'])

// Sale Admin + Sale (xem chung)
export const salesRoles = checkRoles(['admin', 'sales_admin', 'sales'])

// Mọi role trừ không xác thực
export const anyRole = checkRoles(['admin', 'sales_admin', 'sales', 'technical', 'technical_lead'])

// Giữ backward compat (một số route cũ dùng adminOrSales)
// @deprecated dùng salesRoles hoặc adminOrSaleAdmin
export const adminOrSales = checkRoles(['admin', 'sales_admin', 'sales'])

// adminTechnicalOrSales (backward compat)
export const adminTechnicalOrSales = checkRoles(['admin', 'technical', 'technical_lead', 'sales_admin', 'sales'])
