// ============================================================
// server/src/routes/warehouse.ts — UNI IMS (Quản lý kho)
// ============================================================

import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import { errorResponse } from '../utils/response'
import * as wh  from '../controllers/warehouse'
import * as ops from '../controllers/warehouseOps'

const router = Router()
router.use(authMiddleware)

// ── Phân quyền ────────────────────────────────────────────────
// Xem kho: mọi role đã đăng nhập (kỹ thuật cần tra tồn trước khi làm BOM).
// Thao tác phiếu: admin, sale admin, kế toán, trưởng phòng KT.
// Danh mục (kho / NCC / SKU): admin + sale admin.
function roles(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json(errorResponse('Unauthorized')); return }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json(errorResponse('Bạn không có quyền thao tác trên module kho'))
      return
    }
    next()
  }
}
const canOperate = roles(['admin', 'sales_admin', 'ke_toan', 'technical_lead'])
const canManage  = roles(['admin', 'sales_admin'])
// Duyệt phiếu đề nghị vật tư: cấp quản lý
const canApprove = roles(['admin', 'sales_admin', 'technical_lead'])

// ── Tổng quan ─────────────────────────────────────────────────
router.get('/dashboard', wh.getDashboard)

// ── Danh mục kho ──────────────────────────────────────────────
router.get   ('/warehouses',     wh.getWarehouses)
router.post  ('/warehouses',     canManage, wh.createWarehouse)
router.put   ('/warehouses/:id', canManage, wh.updateWarehouse)
router.delete('/warehouses/:id', canManage, wh.deleteWarehouse)

// ── Nhà cung cấp ──────────────────────────────────────────────
router.get   ('/suppliers',      wh.getSuppliers)
router.post  ('/suppliers',      canManage, wh.createSupplier)
router.put   ('/suppliers/:id',  canManage, wh.updateSupplier)
router.delete('/suppliers/:id',  canManage, wh.deleteSupplier)

// ── Hàng hoá (SKU) ────────────────────────────────────────────
router.get   ('/items',                     wh.getItems)
router.get   ('/items/importable-products', wh.getImportableProducts)
router.post  ('/items/import-products',     canManage, wh.importFromProducts)
router.get   ('/items/:id',                 wh.getItemDetail)
router.post  ('/items',                     canManage, wh.createItem)
router.put   ('/items/:id',                 canManage, wh.updateItem)
router.delete('/items/:id',                 canManage, wh.deleteItem)

// ── Tồn kho & sổ nhật ký ──────────────────────────────────────
router.get('/stocks',    wh.getStocks)
router.get('/movements', wh.getMovements)

// ── Phiếu nhập ────────────────────────────────────────────────
router.get   ('/receipts',             wh.getReceipts)
router.get   ('/receipts/:id',         wh.getReceiptDetail)
router.post  ('/receipts',             canOperate, wh.saveReceipt)
router.put   ('/receipts/:id',         canOperate, wh.saveReceipt)
router.post  ('/receipts/:id/post',    canOperate, wh.postReceipt)
router.post  ('/receipts/:id/cancel',  canOperate, wh.cancelReceipt)
router.delete('/receipts/:id',         canOperate, wh.deleteReceipt)

// ── Phiếu xuất ────────────────────────────────────────────────
router.get   ('/issues',              wh.getIssues)
router.get   ('/issues/:id',          wh.getIssueDetail)
router.post  ('/issues',              canOperate, wh.saveIssue)
router.put   ('/issues/:id',          canOperate, wh.saveIssue)
router.post  ('/issues/:id/post',     canOperate, wh.postIssue)
router.post  ('/issues/:id/cancel',   canOperate, wh.cancelIssue)
router.delete('/issues/:id',          canOperate, wh.deleteIssue)

// ── Điều chuyển ───────────────────────────────────────────────
router.get   ('/transfers',             wh.getTransfers)
router.get   ('/transfers/:id',         wh.getTransferDetail)
router.post  ('/transfers',             canOperate, wh.saveTransfer)
router.put   ('/transfers/:id',         canOperate, wh.saveTransfer)
router.post  ('/transfers/:id/post',    canOperate, wh.postTransfer)
router.post  ('/transfers/:id/cancel',  canOperate, wh.cancelTransfer)
router.delete('/transfers/:id',         canOperate, wh.deleteTransfer)

// ── Kiểm kê ───────────────────────────────────────────────────
router.get   ('/counts/prepare',    wh.prepareCount)
router.get   ('/counts',            wh.getCounts)
router.get   ('/counts/:id',        wh.getCountDetail)
router.post  ('/counts',            canOperate, wh.saveCount)
router.put   ('/counts/:id',        canOperate, wh.saveCount)
router.post  ('/counts/:id/post',   canOperate, wh.postCount)
router.delete('/counts/:id',        canOperate, wh.deleteCount)

// ============================================================
// GIAI ĐOẠN 2 — nghiệp vụ thi công
// ============================================================

// ── Tra cứu nhanh (dùng cho app mobile ngoài công trường) ─────
router.get('/lookup', ops.quickLookup)

// ── Dự án: đối chiếu POM với kho ──────────────────────────────
router.get('/projects',            ops.getProjects)
router.get('/projects/:id/match',  ops.getProjectMatch)
router.get('/projects/:id/usage',  ops.getProjectUsage)
router.post('/projects/:id/release-reservations', canOperate, ops.releaseProjectReservations)

// ── Giữ hàng ──────────────────────────────────────────────────
router.get   ('/reservations',              ops.getReservations)
router.post  ('/reservations',              canOperate, ops.createReservations)
router.delete('/reservations/:id',          canOperate, ops.releaseReservation)

// ── Đề xuất mua hàng ──────────────────────────────────────────
router.get('/purchase-suggestions', ops.getPurchaseSuggestions)

// ── Phiếu đề nghị vật tư ──────────────────────────────────────
// Ai cũng được tạo đề nghị (kỹ thuật là người đề nghị chính),
// nhưng duyệt và xuất hàng thì cần quyền.
router.get   ('/requests',              ops.getRequests)
router.get   ('/requests/:id',          ops.getRequest)
router.post  ('/requests',              ops.saveRequest)
router.put   ('/requests/:id',          ops.saveRequest)
router.post  ('/requests/:id/submit',   ops.submitRequest)
router.post  ('/requests/:id/approve',  canApprove, ops.approveRequest)
router.post  ('/requests/:id/reject',   canApprove, ops.rejectRequest)
router.post  ('/requests/:id/fulfil',   canOperate, ops.fulfilRequest)
router.delete('/requests/:id',          ops.deleteRequest)

// ── Serial / MAC / bảo hành ───────────────────────────────────
router.get   ('/serials',      ops.getSerials)
router.post  ('/serials',      canOperate, ops.createSerials)
router.put   ('/serials/:id',  canOperate, ops.updateSerial)
router.delete('/serials/:id',  canOperate, ops.deleteSerial)

// ── Đơn mua hàng ──────────────────────────────────────────────
router.post  ('/purchase-orders/from-suggestions', canOperate, ops.createPOFromSuggestions)
router.get   ('/purchase-orders',             ops.getPurchaseOrders)
router.get   ('/purchase-orders/:id',         ops.getPurchaseOrder)
router.post  ('/purchase-orders',             canOperate, ops.savePurchaseOrder)
router.put   ('/purchase-orders/:id',         canOperate, ops.savePurchaseOrder)
router.post  ('/purchase-orders/:id/order',   canOperate, ops.orderPurchaseOrder)
router.post  ('/purchase-orders/:id/receive', canOperate, ops.receivePurchaseOrder)
router.post  ('/purchase-orders/:id/cancel',  canOperate, ops.cancelPurchaseOrder)
router.delete('/purchase-orders/:id',         canOperate, ops.deletePurchaseOrder)

export default router
