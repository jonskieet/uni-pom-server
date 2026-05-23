// ============================================================
// src/controllers/formTemplates.ts
// CRUD cho Survey Form Templates — chỉ technical_lead được write
// ============================================================

import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { successResponse } from '../utils/response'
import { AppError, asyncHandler } from '../middleware/errorHandler'

const prisma = new PrismaClient()

// ── Seed data mặc định cho Mạng LAN ─────────────────────────
const LAN_DEFAULT_SECTIONS = [
  {
    key: 'general_info',
    title: 'Thông tin chung',
    icon: 'ti-info-circle',
    type: 'fields',
    fields: [
      { key: 'unit_name',     label: 'Tên đơn vị khảo sát', type: 'text',     required: true,  placeholder: 'Tên công ty / đơn vị' },
      { key: 'survey_date',   label: 'Thời gian khảo sát',  type: 'date',     required: false, placeholder: '' },
      { key: 'surveyor_name', label: 'Người thực hiện khảo sát', type: 'text', required: true,  placeholder: 'Họ tên kỹ thuật viên' },
      { key: 'site_address',  label: 'Địa chỉ đơn vị',      type: 'textarea', required: false, placeholder: 'Địa chỉ cụ thể của đơn vị khảo sát' },
    ],
  },
  {
    key: 'current_devices',
    title: 'Hiện trạng trang thiết bị CNTT',
    icon: 'ti-device-laptop',
    type: 'table',
    addLabel: 'Thêm thiết bị',
    defaultRows: [
      { device_type: 'Cân bằng tải',     model: '',       quantity: 0, function_desc: 'Phân luồng & Tối ưu đường truyền Internet', location: '' },
      { device_type: 'Tường lửa',        model: 'Chưa có', quantity: 0, function_desc: 'Bảo mật đường truyền nội bộ', location: '-' },
      { device_type: 'Switch 24 Port',   model: '',       quantity: 0, function_desc: 'Kết nối thiết bị vào mạng nội bộ', location: '' },
      { device_type: 'Switch 16 Port',   model: '',       quantity: 0, function_desc: 'Kết nối thiết bị vào mạng nội bộ', location: '' },
      { device_type: 'Bộ phát Wifi (AP)', model: '',      quantity: 0, function_desc: 'Kết nối mạng không dây', location: '' },
      { device_type: 'Router / Modem',   model: '',       quantity: 0, function_desc: 'Kết nối Internet từ nhà mạng cung cấp', location: '' },
    ],
    columns: [
      { key: 'device_type',   label: 'Thiết bị',            type: 'text',   width: 180 },
      { key: 'model',         label: 'Phân loại / Model',   type: 'text',   width: 160, placeholder: 'Model / Mô tả' },
      { key: 'quantity',      label: 'Số lượng',            type: 'number', width: 84  },
      { key: 'function_desc', label: 'Chức năng & Mô tả',  type: 'text',   width: 0   },
      { key: 'location',      label: 'Bộ phận sử dụng',    type: 'text',   width: 190, placeholder: 'Khu vực / Phòng ban' },
    ],
  },
  {
    key: 'current_status',
    title: 'Đánh giá hiện trạng hệ thống mạng',
    icon: 'ti-chart-bar',
    type: 'fields',
    fields: [
      { key: 'internet_connection', label: 'Đường truyền Internet', type: 'textarea', required: false, placeholder: 'Mô tả hiện trạng đường truyền...' },
      { key: 'security_system',     label: 'Hệ thống bảo mật',     type: 'textarea', required: false, placeholder: 'Mô tả hiện trạng bảo mật...' },
      { key: 'switch_system',       label: 'Hệ thống Switch',       type: 'textarea', required: false, placeholder: 'Mô tả hiện trạng switch...' },
      { key: 'wifi_system',         label: 'Hệ thống Wifi',         type: 'textarea', required: false, placeholder: 'Mô tả hiện trạng wifi...' },
      { key: 'cable_system',        label: 'Hệ thống cáp mạng',    type: 'textarea', required: false, placeholder: 'Mô tả hiện trạng cáp mạng...' },
    ],
  },
  {
    key: 'proposed_devices',
    title: 'Đề xuất thiết bị',
    icon: 'ti-list-check',
    type: 'table',
    addLabel: 'Thêm thiết bị đề xuất',
    defaultRows: [
      { device_name: 'Thiết bị cân bằng tải',         quantity: 1, unit: 'Cái', function_desc: 'Kết nối & cân bằng nhiều đường truyền Internet', deploy_location: 'Phòng thiết bị' },
      { device_name: 'Thiết bị tường lửa (Firewall)', quantity: 1, unit: 'Cái', function_desc: 'Kiểm soát truy cập & ngăn chặn xâm nhập', deploy_location: 'Phòng thiết bị' },
      { device_name: 'Switch 24 cổng',                quantity: 1, unit: 'Cái', function_desc: 'Switch Layer 2, quản lý tập trung', deploy_location: 'Phòng thiết bị' },
    ],
    columns: [
      { key: 'device_name',      label: 'Tên thiết bị',       type: 'text',   width: 0   },
      { key: 'quantity',         label: 'Số lượng',           type: 'number', width: 84  },
      { key: 'unit',             label: 'ĐVT',                type: 'select', width: 84, options: ['Cái', 'Bộ', 'Cuộn', 'Thùng', 'License', 'Hộp', 'Gói'] },
      { key: 'function_desc',    label: 'Chức năng / Mô tả', type: 'text',   width: 0   },
      { key: 'deploy_location',  label: 'Vị trí triển khai', type: 'text',   width: 190, placeholder: 'Phòng / Khu vực' },
    ],
  },
  {
    key: 'general_note',
    title: 'Ghi chú / Sơ đồ lắp đặt',
    icon: 'ti-notes',
    type: 'fields',
    fields: [
      { key: 'general_note', label: 'Ghi chú', type: 'textarea', required: false, placeholder: 'Ghi chú thêm, mô tả sơ đồ lắp đặt, lưu ý đặc biệt...' },
    ],
  },
]

// ── GET /form-templates ──────────────────────────────────────
export const getFormTemplates = asyncHandler(async (req: Request, res: Response) => {
  const includeInactive = req.query.all === 'true' && (req.user?.role === 'admin' || req.user?.role === 'technical_lead')

  const templates = await prisma.surveyFormTemplate.findMany({
    where: includeInactive ? {} : { is_active: true },
    include: { creator: { select: { id: true, full_name: true } } },
    orderBy: { created_at: 'asc' },
  })

  res.json(successResponse(templates))
})

// ── GET /form-templates/:type ────────────────────────────────
export const getFormTemplateByType = asyncHandler(async (req: Request, res: Response) => {
  const template = await prisma.surveyFormTemplate.findUnique({
    where: { survey_type: req.params.type },
    include: { creator: { select: { id: true, full_name: true } } },
  })

  if (!template) throw new AppError(404, `Template "${req.params.type}" không tồn tại`)

  res.json(successResponse(template))
})

// ── POST /form-templates ─────────────────────────────────────
export const createFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw new AppError(401, 'Unauthorized')

  const { survey_type, name, description, icon, sections, is_active } = req.body

  if (!survey_type?.trim()) throw new AppError(400, 'survey_type là bắt buộc')
  if (!name?.trim())         throw new AppError(400, 'name là bắt buộc')
  if (!Array.isArray(sections) || sections.length === 0)
    throw new AppError(400, 'sections phải là mảng và có ít nhất 1 section')

  const template = await prisma.surveyFormTemplate.create({
    data: {
      survey_type: survey_type.trim().toUpperCase(),
      name:        name.trim(),
      description: description ?? null,
      icon:        icon ?? 'ti-clipboard',
      sections,
      is_active:   is_active !== false,
      created_by:  userId,
    },
    include: { creator: { select: { id: true, full_name: true } } },
  })

  res.status(201).json(successResponse(template, 'Tạo template thành công'))
})

// ── PUT /form-templates/:id ──────────────────────────────────
export const updateFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw new AppError(401, 'Unauthorized')

  const id = parseInt(req.params.id)
  const { name, description, icon, sections, is_active } = req.body

  const existing = await prisma.surveyFormTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Template không tồn tại')

  if (sections !== undefined && (!Array.isArray(sections) || sections.length === 0))
    throw new AppError(400, 'sections phải là mảng và có ít nhất 1 section')

  const template = await prisma.surveyFormTemplate.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(icon        !== undefined && { icon }),
      ...(sections    !== undefined && { sections }),
      ...(is_active   !== undefined && { is_active }),
      updated_by: userId,
    },
    include: { creator: { select: { id: true, full_name: true } } },
  })

  res.json(successResponse(template, 'Cập nhật template thành công'))
})

// ── DELETE /form-templates/:id ───────────────────────────────
export const deleteFormTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)

  const existing = await prisma.surveyFormTemplate.findUnique({ where: { id } })
  if (!existing) throw new AppError(404, 'Template không tồn tại')

  await prisma.surveyFormTemplate.delete({ where: { id } })

  res.json(successResponse(null, 'Xóa template thành công'))
})

// ── POST /form-templates/seed ────────────────────────────────
// Tạo template LAN mặc định nếu chưa có (chỉ admin / technical_lead)
export const seedDefaultTemplates = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) throw new AppError(401, 'Unauthorized')

  const existing = await prisma.surveyFormTemplate.findUnique({ where: { survey_type: 'LAN' } })

  if (existing) {
    return res.json(successResponse(existing, 'Template LAN đã tồn tại'))
  }

  const template = await prisma.surveyFormTemplate.create({
    data: {
      survey_type: 'LAN',
      name:        'Mạng LAN',
      description: 'Khảo sát hạ tầng mạng nội bộ, Switch, Wifi, Firewall, cáp mạng',
      icon:        'ti-network',
      sections:    LAN_DEFAULT_SECTIONS as any,
      is_active:   true,
      created_by:  userId,
    },
    include: { creator: { select: { id: true, full_name: true } } },
  })

  res.status(201).json(successResponse(template, 'Đã tạo template LAN mặc định'))
})
