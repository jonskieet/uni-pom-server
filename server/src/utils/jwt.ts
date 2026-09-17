// ============================================================
// src/utils/jwt.ts — JWT utilities
// ============================================================

import jwt, { SignOptions } from 'jsonwebtoken'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured and contain at least 32 characters')
  }
  return secret
}

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
  return jwt.sign(payload, getJwtSecret(), options)
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof decoded.id === 'number' &&
      typeof decoded.username === 'string' &&
      typeof decoded.role === 'string'
    ) {
      return {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
      }
    }
    return null
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
