// ============================================================
// src/utils/jwt.ts — JWT utilities
// ============================================================

import jwt, { SignOptions } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export interface JwtPayload {
  id: number
  username: string
  role: string
}

/**
 * Tạo JWT token từ user data
 */
export function generateToken(payload: JwtPayload, expiresIn: string | number = '30d'): string {
  const options: SignOptions = { expiresIn: expiresIn as any }
  return jwt.sign(payload, JWT_SECRET as string, options)
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded as JwtPayload
  } catch (err) {
    return null
  }
}

/**
 * Extract token từ Authorization header
 */
export function extractToken(authHeader?: string): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}
