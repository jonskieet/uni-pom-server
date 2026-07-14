// ============================================================
// server/src/routes/tasks.ts — Planner routes (FULL version)
// Base path: /api/planner (đăng ký trong app.ts)
// ============================================================

import { Router } from 'express'
import { authMiddleware, anyRole } from '../middleware/auth'
import {
  getPlans, createPlan, updatePlan, deletePlan,
  getPlanMembers, addPlanMembers, removePlanMember,
  getBuckets, createBucket, updateBucket, deleteBucket, reorderBuckets,
  getTasks, getTask, createTask, updateTask, deleteTask, reorderTask, copyTask,
  addChecklist, toggleChecklist, deleteChecklist, updateChecklist,
  getComments, addComment, deleteComment,
  getPlannerUsers,
  getPlanStats,
  getMyTasks,
} from '../controllers/tasks'
import {
  getTeams, createTeam, updateTeam, deleteTeam,
  getTeamMembers, addTeamMembers, removeTeamMember,
} from '../controllers/teams'

const router = Router()
router.use(authMiddleware)

// ── Teams (Nhóm — chứa nhiều Kế hoạch) ────────────────────────
router.get('/teams',        getTeams)
router.post('/teams',       anyRole, createTeam)
router.put('/teams/:id',    anyRole, updateTeam)
router.delete('/teams/:id', anyRole, deleteTeam)
router.get('/teams/:teamId/members',           getTeamMembers)
router.post('/teams/:teamId/members',          anyRole, addTeamMembers)
router.delete('/teams/:teamId/members/:userId', anyRole, removeTeamMember)

// ── Plans ──────────────────────────────────────────────────
router.get('/plans',        getPlans)
router.post('/plans',       anyRole, createPlan)
router.put('/plans/:id',    anyRole, updatePlan)
router.delete('/plans/:id', anyRole, deletePlan)

// ── Plan Members (Team) ──────────────────────────────────────
router.get('/plans/:planId/members',                 getPlanMembers)
router.post('/plans/:planId/members',                 anyRole, addPlanMembers)
router.delete('/plans/:planId/members/:userId',       anyRole, removePlanMember)


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

// ── My Tasks (tasks assigned to current user) ──────────────
router.get('/my-tasks', getMyTasks)

// ── Users picker ───────────────────────────────────────────
router.get('/users', getPlannerUsers)

export default router