// ============================================================
// src/controllers/users.ts — Users controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { hashPassword } from '../utils/password'

// ── Prisma singleton (shared connection pool) ────────────────
const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

/**
 * GET /users — Get all users
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true,
      avatar_url: true,
      email: true,
      created_at: true
    },
    orderBy: { created_at: 'desc' }
  })
  res.json(successResponse(users))
})

/**
 * GET /users/:id — Get user by ID
 */
export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: parseInt(req.params.id) },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true,
      avatar_url: true,
      email: true,
      created_at: true
    }
  })

  res.json(successResponse(user))
})

/**
 * POST /users — Create new user (admin only)
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, full_name, role, password, email } = req.body

  if (!username || !full_name || !role || !password) {
    throw new AppError(400, 'username, full_name, role, and password are required')
  }

  const existingUser = await prisma.user.findUnique({ where: { username } })
  if (existingUser) {
    throw new AppError(400, 'Username already exists')
  }

  const passwordHash = await hashPassword(password)
  const emailVal = email?.trim() || null

  const user = await prisma.user.create({
    data: {
      username,
      full_name,
      role,
      password_hash: passwordHash,
      email: emailVal
    },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      email: true
    }
  })

  res.status(201).json(successResponse(user))
})

/**
 * PUT /users/:id — Update user (admin only)
 * Accepts is_active as boolean | 0 | 1 | "0" | "1"
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { full_name, role, is_active, avatar_url, email } = req.body
  const id = parseInt(req.params.id)

  // Normalise is_active: DB expects Boolean, frontend may send 0/1/true/false
  let normalizedIsActive: boolean | undefined = undefined
  if (is_active !== undefined && is_active !== null) {
    normalizedIsActive = is_active === true || is_active === 1 || is_active === '1'
  }

  try {
    const emailVal = email !== undefined ? (email?.trim() || null) : undefined

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(full_name !== undefined && full_name !== null && { full_name }),
        ...(role !== undefined && role !== null && { role }),
        ...(normalizedIsActive !== undefined && { is_active: normalizedIsActive }),
        ...(avatar_url !== undefined && { avatar_url }),
        ...(emailVal !== undefined && { email: emailVal }),
        updated_at: new Date(),
      },
      select: {
        id: true,
        username: true,
        full_name: true,
        role: true,
        is_active: true,
        avatar_url: true,
        email: true
      }
    })

    res.json(successResponse(user))
  } catch (err: any) {
    // Prisma validation errors (invalid enum value, missing required field, etc.)
    if (err.name === 'PrismaClientValidationError') {
      const detail = err.message.split('\n').filter(Boolean).pop() ?? ''
      throw new AppError(400, `Dữ liệu không hợp lệ: ${detail}`)
    }
    throw err
  }
})

/**
 * DELETE /users/:id — Delete user (admin only)
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await prisma.user.delete({
    where: { id: parseInt(req.params.id) }
  })

  res.json(successResponse(null, 'User deleted successfully'))
})

/**
 * PUT /users/:id/avatar — Cập nhật avatar (admin hoặc chính user đó)
 */
export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id)
  const requesterId = req.user?.id
  const requesterRole = req.user?.role

  if (requesterRole !== 'admin' && requesterId !== targetId) {
    throw new AppError(403, 'Bạn không có quyền cập nhật avatar của người dùng khác')
  }

  const { avatar_url } = req.body
  if (avatar_url === undefined) {
    throw new AppError(400, 'avatar_url là bắt buộc')
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: { avatar_url },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true,
      avatar_url: true
    }
  })

  res.json(successResponse(user))
})

/**
 * PUT /users/:id/email — Cập nhật email (admin hoặc chính user đó)
 */
export const updateEmail = asyncHandler(async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id)
  const requesterId = req.user?.id
  const requesterRole = req.user?.role

  if (requesterRole !== 'admin' && requesterId !== targetId) {
    throw new AppError(403, 'Bạn không có quyền cập nhật email của người dùng khác')
  }

  const { email } = req.body
  if (email !== undefined && email !== null && typeof email !== 'string') {
    throw new AppError(400, 'Email không hợp lệ')
  }

  const emailVal = email?.trim() || null
  if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    throw new AppError(400, 'Email không hợp lệ')
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: { email: emailVal, updated_at: new Date() },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true,
      avatar_url: true,
      email: true
    }
  })

  res.json(successResponse(user))
})

/**
 * PUT /users/:id/reset-password — Đặt lại mật khẩu (admin only)
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body
  if (!password || password.length < 6) {
    throw new AppError(400, 'Mật khẩu phải có ít nhất 6 ký tự')
  }

  const passwordHash = await hashPassword(password)

  await prisma.user.update({
    where: { id: parseInt(req.params.id) },
    data:  { password_hash: passwordHash }
  })

  res.json(successResponse(null, 'Đặt lại mật khẩu thành công'))
})