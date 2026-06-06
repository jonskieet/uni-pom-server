// ============================================================
// src/routes/poms.ts — v2
// ============================================================

import { Router } from 'express'
import {
  getPoms,
  getPomById,
  createPom,
  updatePom,
  deletePom,
  submitPom,
  approvePom,
  returnPom,
  reapprovePom,
  pricePom,
  sendToClient,
  clientFeedback,
  returnToPrice,
  returnToTech,
  closePom,
  upsertPomItems,
  addPomItem,
  updatePomItem,
  deletePomItem,
  changePomStatus,
} from '../controllers/poms'
import {
  authMiddleware,
  adminOrTechLead,
  technicalRoles,
  adminOrSaleAdmin,
  adminOrSale,
  salesRoles,
  anyRole,
} from '../middleware/auth'

const router = Router()
router.use(authMiddleware)

// ── CRUD cơ bản ──────────────────────────────────────────────
router.get('/',    anyRole,        getPoms)
router.get('/:id', anyRole,        getPomById)
router.post('/',   technicalRoles, createPom)
router.put('/:id', technicalRoles, updatePom)
router.delete('/:id', technicalRoles, deletePom)

// ── State machine: Kỹ thuật ───────────────────────────────────
// Kỹ thuật nộp BOM lên TP KT (draft → submitted)
// Cũng dùng khi Kỹ thuật nộp lại sau khi sửa (revision_tech → submitted)
router.put('/:id/submit', technicalRoles, submitPom)

// ── State machine: Trưởng phòng KT ───────────────────────────
// TP KT duyệt BOM (submitted → tp_approved)
router.put('/:id/approve',   adminOrTechLead, approvePom)
// TP KT trả về Kỹ thuật (submitted → draft)
router.put('/:id/return',    adminOrTechLead, returnPom)
// TP KT duyệt lại sau khi Kỹ thuật sửa (submitted → tp_approved)
router.put('/:id/reapprove', adminOrTechLead, reapprovePom)

// ── State machine: Sale Admin ─────────────────────────────────
// Sale Admin định giá + giao cho Sale (tp_approved | revision_price → pricing_done)
router.put('/:id/price', adminOrSaleAdmin, pricePom)

// ── State machine: Sale ───────────────────────────────────────
// Sale gửi KH (pricing_done → sent_to_client)
router.put('/:id/send',         adminOrSale, sendToClient)
// Sale ghi nhận phản hồi KH (sent_to_client | negotiating → negotiating)
router.put('/:id/feedback',     adminOrSale, clientFeedback)
// Sale trả về Sale Admin sửa giá (negotiating → revision_price)
router.put('/:id/return-price', adminOrSale, returnToPrice)
// Sale trả về Kỹ thuật sửa phương án (negotiating → revision_tech)
router.put('/:id/return-tech',  adminOrSale, returnToTech)
// Sale chốt hợp đồng (negotiating | sent_to_client → closed_won | closed_lost)
router.put('/:id/close',        adminOrSale, closePom)

// ── Legacy (backward compat) ──────────────────────────────────
router.put('/:id/status', anyRole, changePomStatus)

// ── POM Items ─────────────────────────────────────────────────
router.put('/:id/items',       anyRole, upsertPomItems)
router.post('/:id/items',      anyRole, addPomItem)
router.put('/items/:itemId',   anyRole, updatePomItem)
router.delete('/items/:itemId', anyRole, deletePomItem)

export default router
