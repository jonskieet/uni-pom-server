// ============================================================
// src/app.ts — Express application setup
// ============================================================

import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import productsRoutes from './routes/products'
import pomsRoutes from './routes/poms'
import surveysRoutes from './routes/surveys'
import formTemplatesRoutes from './routes/formTemplates'
import brandsRoutes from './routes/brands'
import categoriesRoutes from './routes/categories'
import solutionsRoutes from './routes/solutions'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'

export function createApp(): Express {
  const app = express()

  // ============================================================
  // MIDDLEWARE
  // ============================================================
  app.use(helmet())
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true
    })
  )
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // ============================================================
  // HEALTH CHECK
  // ============================================================
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    })
  })

  // ============================================================
  // API ROUTES
  // ============================================================
  app.use('/api/auth', authRoutes)
  app.use('/api/users', usersRoutes)
  app.use('/api/products', productsRoutes)
  app.use('/api/poms', pomsRoutes)
  app.use('/api/surveys', surveysRoutes)
  app.use('/api/form-templates', formTemplatesRoutes)
  app.use('/api/brands', brandsRoutes)
  app.use('/api/categories', categoriesRoutes)
  app.use('/api/solutions', solutionsRoutes)

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
