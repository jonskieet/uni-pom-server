// ============================================================
// server/src/routes/tasks.ts — Planner routes (FULL version)
// Base path: /api/planner (đăng ký trong app.ts)
// ============================================================

import { Router } from 'express'
import { authMiddleware, anyRole } from '../middleware/auth'
import {
  getPlans, createPlan, updatePlan, deletePlan,
  getBuckets, createBucket, updateBucket, deleteBucket, reorderBuckets,
  getTasks, getTask, createTask, updateTask, deleteTask, reorderTask, copyTask,
  addChecklist, toggleChecklist, deleteChecklist, updateChecklist,
  getComments, addComment, deleteComment,
  getPlannerUsers,
  getPlanStats,
} from '../controllers/tasks'

const router = Router()
router.use(authMiddleware)

// ── Plans ──────────────────────────────────────────────────
router.get('/plans',        getPlans)
router.post('/plans',       anyRole, createPlan)
router.put('/plans/:id',    anyRole, updatePlan)
router.delete('/plans/:id', anyRole, deletePlan)

// ── Buckets ────────────────────────────────────────────────
router.get('/plans/:planId/buckets',   getBuckets)
router.post('/plans/:planId/buckets',  anyRole, createBucket)
router.put('/buckets/reorder',         anyRole, reorderBuckets)   // ← MỚI (đặt trước :id)
router.put('/buckets/:id',             anyRole, updateBucket)
router.delete('/buckets/:id',          anyRole, deleteBucket)

// ── Tasks ──────────────────────────────────────────────────
router.get('/tasks',          getTasks)
router.get('/tasks/:id',      getTask)
router.post('/tasks',         anyRole, createTask)
router.put('/tasks/:id',      anyRole, updateTask)
router.delete('/tasks/:id',   anyRole, deleteTask)
router.put('/tasks/:id/reorder', anyRole, reorderTask)            // ← MỚI
router.post('/tasks/:id/copy',   anyRole, copyTask)               // ← MỚI

// ── Checklists ─────────────────────────────────────────────
router.post('/tasks/:taskId/checklist',                   anyRole, addChecklist)
router.put('/tasks/:taskId/checklist/:itemId/toggle',     anyRole, toggleChecklist)
router.put('/tasks/:taskId/checklist/:itemId',            anyRole, updateChecklist)  // ← MỚI
router.delete('/tasks/:taskId/checklist/:itemId',         anyRole, deleteChecklist)

// ── Comments ───────────────────────────────────────────────
router.get('/tasks/:taskId/comments',               getComments)
router.post('/tasks/:taskId/comments',              anyRole, addComment)
router.delete('/tasks/:taskId/comments/:commentId', anyRole, deleteComment) // ← MỚI

// ── Stats (Chart view) ─────────────────────────────────────
router.get('/plans/:planId/stats', getPlanStats)  // ← MỚI

// ── Users picker ───────────────────────────────────────────
router.get('/users', getPlannerUsers)

export default router