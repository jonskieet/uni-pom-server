// ============================================================
// server/src/routes/warehouse.ts — UNI IMS (Quản lý kho)
// ============================================================

import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import { errorResponse } from '../utils/response'
import * as wh from '../controllers/warehouse'

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

export default router
