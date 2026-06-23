// ============================================================
// src/app.ts — v3 (thêm attendance + businessTrips routes)
// ============================================================

import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import productsRoutes from './routes/products'
import pomsRoutes from './routes/poms'
import surveysRoutes from './routes/surveys'
import brandsRoutes from './routes/brands'
import categoriesRoutes from './routes/categories'
import solutionsRoutes from './routes/solutions'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import uploadRoutes from './routes/upload'
import formTemplatesRoutes from './routes/formTemplates'
import adminRoutes from './routes/admin'
import settingsRoutes from './routes/settings'
import wardsRoutes from './routes/wards'
import notificationsRoutes from './routes/notifications'
import plannerRoutes from './routes/tasks'
import attendanceRoutes from './routes/attendance'       // ← MỚI
import businessTripsRoutes from './routes/businessTrips' // ← MỚI
import leaveRequestsRoutes from './routes/leaveRequests' // ← MỚI
import scheduleRoutes      from './routes/schedule'       // ← MỚI

export function createApp(): Express {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true
    })
  )
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // ── Routes ─────────────────────────────────────────────────
  app.use('/api/auth',           authRoutes)
  app.use('/api/users',          usersRoutes)
  app.use('/api/products',       productsRoutes)
  app.use('/api/poms',           pomsRoutes)
  app.use('/api/surveys',        surveysRoutes)
  app.use('/api/brands',         brandsRoutes)
  app.use('/api/categories',     categoriesRoutes)
  app.use('/api/solutions',      solutionsRoutes)
  app.use('/api/form-templates', formTemplatesRoutes)
  app.use('/api/admin',          adminRoutes)
  app.use('/api/settings',       settingsRoutes)
  app.use('/api/upload',         uploadRoutes)
  app.use('/api',                wardsRoutes)
  app.use('/api/notifications',  notificationsRoutes)
  app.use('/api/planner',        plannerRoutes)
  app.use('/api/attendance',     attendanceRoutes)       // ← MỚI
  app.use('/api/business-trips', businessTripsRoutes)    // ← MỚI
  app.use('/api/leave-requests', leaveRequestsRoutes)    // ← MỚI
  app.use('/api/schedule',       scheduleRoutes)          // ← MỚI

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
