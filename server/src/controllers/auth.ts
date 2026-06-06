// ============================================================
// src/controllers/auth.ts — Authentication controller
// ============================================================

import { Request, Response } from 'express'
import { generateToken, JwtPayload } from '../utils/jwt'
import { comparePassword, hashPassword } from '../utils/password'
import { successResponse, errorResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { prisma } from '../lib/prisma'


/**
 * POST /auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body

  if (!username || !password) {
    throw new AppError(400, 'Username and password are required')
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    throw new AppError(401, 'Invalid username or password')
  }

  const isPasswordValid = await comparePassword(password, user.password_hash)
  if (!isPasswordValid) {
    throw new AppError(401, 'Invalid username or password')
  }

  if (!user.is_active) {
    throw new AppError(403, 'User account is disabled')
  }

  const payload: JwtPayload = {
    id: user.id,
    username: user.username,
    role: user.role
  }

  const token = generateToken(payload)

  res.json(
    successResponse({
      token,
      user: {
        id:         user.id,
        username:   user.username,
        full_name:  user.full_name,
        role:       user.role,
        avatar_url: user.avatar_url ?? null   // bắt buộc để session lưu đúng
      }
    })
  )
})

/**
 * POST /auth/change-password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { old_password, new_password } = req.body
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(401, 'Unauthorized')
  }

  if (!old_password || !new_password) {
    throw new AppError(400, 'Old and new password are required')
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const isPasswordValid = await comparePassword(old_password, user.password_hash)
  if (!isPasswordValid) {
    throw new AppError(401, 'Current password is incorrect')
  }

  const newPasswordHash = await hashPassword(new_password)
  await prisma.user.update({
    where: { id: userId },
    data: { password_hash: newPasswordHash }
  })

  res.json(successResponse(null, 'Password changed successfully'))
})

/**
 * GET /auth/me
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id

  if (!userId) {
    throw new AppError(401, 'Unauthorized')
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
      role: true,
      is_active: true,
      avatar_url: true,
      created_at: true
    }
  })

  res.json(successResponse(user))
})
