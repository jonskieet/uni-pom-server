// ============================================================
// server/src/routes/tasks.ts — Planner routes
// Base path: /api/planner (đăng ký trong app.ts)
// ============================================================

import { Router } from 'express'
import { authMiddleware, anyRole } from '../middleware/auth'
import {
  getPlans, createPlan, updatePlan, deletePlan,
  getBuckets, createBucket, updateBucket, deleteBucket,
  getTasks, getTask, createTask, updateTask, deleteTask,
  addChecklist, toggleChecklist, deleteChecklist,
  getComments, addComment,
  getPlannerUsers,
} from '../controllers/tasks'

const router = Router()
router.use(authMiddleware)

// ── Plans ──────────────────────────────────────────────────
router.get('/plans',        getPlans)
router.post('/plans',       anyRole, createPlan)
router.put('/plans/:id',    anyRole, updatePlan)
router.delete('/plans/:id', anyRole, deletePlan)

// ── Buckets ────────────────────────────────────────────────
router.get('/plans/:planId/buckets',  getBuckets)
router.post('/plans/:planId/buckets', anyRole, createBucket)
router.put('/buckets/:id',            anyRole, updateBucket)
router.delete('/buckets/:id',         anyRole, deleteBucket)

// ── Tasks ──────────────────────────────────────────────────
router.get('/tasks',        getTasks)
router.get('/tasks/:id',    getTask)
router.post('/tasks',       anyRole, createTask)
router.put('/tasks/:id',    anyRole, updateTask)
router.delete('/tasks/:id', anyRole, deleteTask)

// ── Checklists ─────────────────────────────────────────────
router.post('/tasks/:taskId/checklist',                anyRole, addChecklist)
router.put('/tasks/:taskId/checklist/:itemId/toggle',  anyRole, toggleChecklist)
router.delete('/tasks/:taskId/checklist/:itemId',      anyRole, deleteChecklist)

// ── Comments ───────────────────────────────────────────────
router.get('/tasks/:taskId/comments',  getComments)
router.post('/tasks/:taskId/comments', anyRole, addComment)

// ── Users picker ───────────────────────────────────────────
router.get('/users', getPlannerUsers)

export default router
