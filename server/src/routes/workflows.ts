// server/src/routes/workflows.ts (cập nhật – thêm progress routes)

import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'

// Workflow template/instance controllers (cũ)
import {
  getWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow,
  getWorkflowStats,
  getInstances, getInstanceById, createInstance,
  updateInstance, updateInstanceStep,
  getLinkedWorkflows, getLinkedInstances,
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
router.use(authMiddleware)

// ─── CÁC ROUTE TĨNH / CỤ THỂ PHẢI ĐĂNG KÝ TRƯỚC "/:id" ────────
// (tránh bug route-ordering: Express khớp theo thứ tự đăng ký,
//  "/:id" sẽ "ăn" mất "/stats", "/instances", "/linked"... nếu đặt trước)

// ─── WORKFLOW INSTANCES ───────────────────────────────────────
router.get('/instances',              getInstances)
router.post('/instances',             createInstance)
router.get('/instances/:id',          getInstanceById)
router.put('/instances/:id',          updateInstance)
router.patch('/instances/:id/steps/:stepId', updateInstanceStep)

// ─── LINKED (BOM / Survey / Trip / Leave) ────────────────────
router.get('/linked',           getLinkedWorkflows)
router.get('/linked/instances', getLinkedInstances)

// ─── MY PROGRESS (mới) ───────────────────────────────────────
// GET  /api/workflows/my-progress          → danh sách BOM user đang có việc
router.get('/my-progress', getMyProgress)

// GET  /api/workflows/admin-overview       → tổng quan 5 giai đoạn cho Admin
router.get('/admin-overview', getAdminOverview)

// ─── POM TRANSITION (mới) ────────────────────────────────────
// POST /api/workflows/poms/:id/transition            → chuyển trạng thái BOM
router.post('/poms/:id/transition',           transitionPomStatus)
router.post('/poms/:id/construction-logs',    addConstructionLog)
router.get('/poms/:id/construction-logs',     getConstructionLogs)

// ─── WORKFLOW TEMPLATES ───────────────────────────────────────
// (các route "/:id" này luôn để CUỐI vì khớp mọi đoạn 1 segment)
router.get('/stats',    getWorkflowStats)
router.get('/',         getWorkflows)
router.post('/',        createWorkflow)
router.get('/:id',      getWorkflowById)
router.put('/:id',      updateWorkflow)
router.delete('/:id',   deleteWorkflow)

export default router
