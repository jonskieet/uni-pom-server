// ============================================================
// server/src/routes/workflows.ts — Workflow Module
// ============================================================

import { Router } from 'express'
import {
  getWorkflows, getWorkflowStats, getWorkflowById,
  createWorkflow, updateWorkflow, deleteWorkflow,
  getInstances, getInstanceById, createInstance,
  updateInstanceStep, updateInstance,
} from '../controllers/workflows'
import { authMiddleware } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// Templates
router.get('/stats',          getWorkflowStats)
router.get('/',               getWorkflows)
router.get('/:id',            getWorkflowById)
router.post('/',              createWorkflow)
router.put('/:id',            updateWorkflow)
router.delete('/:id',         deleteWorkflow)

// Instances
router.get('/instances',      getInstances)
router.get('/instances/:id',  getInstanceById)
router.post('/instances',     createInstance)
router.patch('/instances/:id',updateInstance)
router.patch('/instances/:id/steps/:stepId', updateInstanceStep)

export default router