// ============================================================
// src/utils/response.ts — Response helpers
// ============================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Success response
 */
export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message
  }
}

/**
 * Error response
 */
export function errorResponse(error: string): ApiResponse {
  return {
    success: false,
    error
  }
}
