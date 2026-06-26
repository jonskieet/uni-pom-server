// server/src/routes/workflows.ts  (cập nhật – thêm progress routes)

import { Router } from 'express'
import { authenticate } from '../middleware/auth'

// Workflow template/instance controllers (cũ)
import {
  getWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow,
  getWorkflowStats,
  getWorkflowInstances, getWorkflowInstanceById, createWorkflowInstance,
  updateWorkflowInstance, deleteWorkflowInstance,
  getLinkedWorkflowStats, getLinkedWorkflowInstances,
} from '../controllers/workflows'

// Workflow Progress controllers (mới)
import {
  getMyProgress,
  transitionPomStatus,
  addConstructionLog,
  getConstructionLogs,
  getAdminOverview,
} from '../controllers/workflowProgress'

const router = Router()

// ─── Auth bắt buộc ────────────────────────────────────────────
router.use(authenticate)

// ─── WORKFLOW TEMPLATES ───────────────────────────────────────
router.get('/',         getWorkflows)
router.get('/stats',    getWorkflowStats)
router.get('/:id',      getWorkflowById)
router.post('/',        createWorkflow)
router.put('/:id',      updateWorkflow)
router.delete('/:id',   deleteWorkflow)

// ─── WORKFLOW INSTANCES ───────────────────────────────────────
router.get('/:id/instances',      getWorkflowInstances)
router.get('/instances/:iid',     getWorkflowInstanceById)
router.post('/:id/instances',     createWorkflowInstance)
router.put('/instances/:iid',     updateWorkflowInstance)
router.delete('/instances/:iid',  deleteWorkflowInstance)

// ─── LINKED (BOM / Survey / Trip / Leave) ────────────────────
router.get('/linked/stats',     getLinkedWorkflowStats)
router.get('/linked/instances', getLinkedWorkflowInstances)

// ─── MY PROGRESS (mới) ───────────────────────────────────────
// GET  /api/workflows/my-progress          → danh sách BOM user đang có việc
router.get('/my-progress', getMyProgress)

// GET  /api/workflows/admin-overview       → tổng quan 5 giai đoạn cho Admin
router.get('/admin-overview', getAdminOverview)

// ─── POM TRANSITION (mới) ────────────────────────────────────
// POST /api/poms/:id/transition            → chuyển trạng thái BOM
// (thêm vào pom routes hoặc dùng riêng dưới đây nếu muốn tách)
// Nếu muốn đặt ở đây (prefixed /api/workflows/poms/:id):
router.post('/poms/:id/transition',           transitionPomStatus)
router.post('/poms/:id/construction-logs',    addConstructionLog)
router.get('/poms/:id/construction-logs',     getConstructionLogs)

export default router