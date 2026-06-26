// ============================================================
// server/src/routes/workflows.ts — Workflow Module
// ============================================================

import { Router } from 'express'
import {
  getWorkflows, getWorkflowStats, getWorkflowById,
  createWorkflow, updateWorkflow, deleteWorkflow,
  getInstances, getInstanceById, createInstance,
  updateInstanceStep, updateInstance,
  getLinkedWorkflows, getLinkedInstances,
} from '../controllers/workflows'
import { authMiddleware } from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ⚠️ QUAN TRỌNG: các route cụ thể (literal path) phải khai báo TRƯỚC
// route có tham số ('/:id'), nếu không Express sẽ match nhầm.
// Trước đây '/instances' bị đặt SAU '/:id' nên GET /api/workflows/instances
// luôn rơi vào getWorkflowById(id='instances') → trả 404 sai.

// Linked workflows (4 quy trình đã có module riêng — chỉ đọc)
router.get('/linked',           getLinkedWorkflows)
router.get('/linked/instances', getLinkedInstances)

// Instances (đặt trước '/:id')
router.get('/instances',      getInstances)
router.get('/instances/:id',  getInstanceById)
router.post('/instances',     createInstance)
router.patch('/instances/:id',updateInstance)
router.patch('/instances/:id/steps/:stepId', updateInstanceStep)

// Templates
router.get('/stats',          getWorkflowStats)
router.get('/',               getWorkflows)
router.get('/:id',            getWorkflowById)
router.post('/',              createWorkflow)
router.put('/:id',            updateWorkflow)
router.delete('/:id',         deleteWorkflow)

export default router
