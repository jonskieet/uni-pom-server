// ============================================================
// src/middleware/auth.ts — Authentication middleware
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

/**
 * Middleware xác thực JWT token
 */
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

/**
 * Middleware kiểm tra role (admin only)
 */
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  if (req.user.role !== 'admin') {
    res.status(403).json(errorResponse('Admin access required'))
    return
  }

  next()
}

/**
 * Middleware kiểm tra role (admin hoặc sales)
 * Dùng cho quản lý danh mục: sales được thêm/sửa, chỉ admin được xóa
 */
export function adminOrSales(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  if (req.user.role !== 'admin' && req.user.role !== 'sales') {
    res.status(403).json(errorResponse('Admin or Sales access required'))
    return
  }

  next()
}

/**
 * Middleware kiểm tra role (admin hoặc technical)
 */
export function adminOrTechnical(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  if (req.user.role !== 'admin' && req.user.role !== 'technical') {
    res.status(403).json(errorResponse('Admin or Technical access required'))
    return
  }

  next()
}

/**
 * Middleware kiểm tra role (admin, technical hoặc sales)
 * Dùng cho các thao tác mà sales cũng được phép thực hiện (VD: tạo/sửa sản phẩm)
 */
export function adminTechnicalOrSales(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  if (req.user.role !== 'admin' && req.user.role !== 'technical' && req.user.role !== 'sales') {
    res.status(403).json(errorResponse('Admin, Technical or Sales access required'))
    return
  }

  next()
}

/**
 * Middleware kiểm tra role (admin hoặc technical_lead)
 * Dùng cho duyệt POM, quản lý giải pháp
 */
export function adminOrTechLead(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  if (req.user.role !== 'admin' && req.user.role !== 'technical_lead') {
    res.status(403).json(errorResponse('Admin or Technical Lead access required'))
    return
  }

  next()
}

/**
 * Middleware kiểm tra role (admin, technical hoặc technical_lead)
 */
export function technicalRoles(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json(errorResponse('Unauthorized'))
    return
  }

  const allowed = ['admin', 'technical', 'technical_lead']
  if (!allowed.includes(req.user.role)) {
    res.status(403).json(errorResponse('Technical access required'))
    return
  }

  next()
}
