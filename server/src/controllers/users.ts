// ============================================================
// src/controllers/users.ts — Users controller
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { hashPassword } from '../utils/password'

const prisma = new PrismaClient()

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
      created_at: true
    }
  })

  res.json(successResponse(user))
})

/**
 * POST /users — Create new user (admin only)
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, full_name, role, password } = req.body

  if (!username || !full_name || !role || !password) {
    throw new AppError(400, 'username, full_name, role, and password are required')
  }

  const existingUser = await prisma.user.findUnique({ where: { username } })
  if (existingUser) {
    throw new AppError(400, 'Username already exists')
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      username,
      full_name,
      role,
      password_hash: passwordHash
    }
  })

  res.status(201).json(
    successResponse({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    })
  )
})

/**
 * PUT /users/:id — Update user (admin only)
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { full_name, role, is_active } = req.body

  const user = await prisma.user.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(full_name && { full_name }),
      ...(role && { role }),
      ...(is_active !== undefined && { is_active })
    },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true
    }
  })

  res.json(successResponse(user))
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
