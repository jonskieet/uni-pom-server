// ============================================================
// src/middleware/errorHandler.ts — Global error handler
// ============================================================

import { Request, Response, NextFunction } from 'express'
import { errorResponse } from '../utils/response'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Async error wrapper
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error('[ERROR]', err)

  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.message))
    return
  }

  if (err.code === 'P2002') {
    res.status(400).json(errorResponse(`Duplicate entry: ${err.meta?.target?.join(', ')}`))
    return
  }

  if (err.code === 'P2025') {
    res.status(404).json(errorResponse('Record not found'))
    return
  }

  res.status(500).json(errorResponse('Internal server error'))
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(errorResponse(`Route not found: ${req.method} ${req.path}`))
}
