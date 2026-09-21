import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { successResponse } from '../utils/response'
import { renderDocxTemplate, TemplateDeviceRow } from '../utils/docxTemplate'
import {
  buildGeneratedSurveyKey, getWordFileBuffer, uploadWordFile,
} from '../utils/storageR2'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function documentState(document: any, pomUpdatedAt?: Date | null, surveyUpdatedAt?: Date | null, templateVersion?: number | null) {
  const pomStale = !!pomUpdatedAt && (!document.generated_from_pom_at || pomUpdatedAt > document.generated_from_pom_at)
  const surveyStale = !!surveyUpdatedAt && (!document.generated_from_survey_at || surveyUpdatedAt > document.generated_from_survey_at)
  const templateStale = !!templateVersion && (!document.template_version || templateVersion > document.template_version)
  return { ...document, is_stale: pomStale || surveyStale || templateStale, pom_stale: pomStale, survey_stale: surveyStale, template_stale: templateStale }
}

export const getSurveyDocuments = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const survey = await prisma.surveyReport.findUnique({
    where: { id: reportId },
    include: { pom: { select: { items_updated_at: true } }, documents: { orderBy: { version: 'desc' } } },
  })
  if (!survey) throw new AppError(404, 'Không tìm thấy hồ sơ khảo sát')
  const template = survey.form_template_id
    ? await prisma.formTemplate.findUnique({ where: { id: survey.form_template_id }, select: { version: true } })
    : null
  res.json(successResponse(survey.documents.map(doc => documentState(doc, survey.pom.items_updated_at, survey.updated_at, template?.version))))
})

export const generateSurveyDocument = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const survey = await prisma.surveyReport.findUnique({
    where: { id: reportId },
    include: {
      pom: true,
      creator: true,
      items: {
        where: { is_removed_from_pom: false },
        include: { product: true, pomItem: { include: { product: true } } },
        orderBy: { sort_order: 'asc' },
      },
    },
  })
  if (!survey) throw new AppError(404, 'Không tìm thấy hồ sơ khảo sát')
  if (!survey.form_template_id) throw new AppError(400, 'Hồ sơ chưa liên kết biểu mẫu khảo sát')

  const template = await prisma.formTemplate.findUnique({ where: { id: survey.form_template_id } })
  if (!template?.word_template_key) {
    throw new AppError(400, 'Loại khảo sát này chưa có mẫu Word chính thức. Hãy tải mẫu lên trong Form Builder.')
  }

  const formData = (survey.form_data && typeof survey.form_data === 'object' ? survey.form_data : {}) as Record<string, unknown>
  const values: Record<string, unknown> = {
    ...formData,
    report_code: survey.report_code,
    report_type: survey.report_type,
    project_name: survey.project_name,
    customer_name: survey.customer_name ?? '',
    site_address: survey.site_address ?? '',
    survey_date: survey.survey_date ?? '',
    surveyor_name: survey.surveyor_name ?? '',
    pom_code: survey.pom.pom_code,
    creator_name: survey.creator.full_name,
    generated_date: new Date().toLocaleDateString('vi-VN'),
  }
  const devices: TemplateDeviceRow[] = survey.items.map((item, index) => ({
    index: index + 1,
    name: item.pomItem?.product?.name ?? item.product?.name ?? item.product_name ?? '',
    proposed_quantity: item.pomItem?.quantity ?? '',
    actual_quantity: item.quantity_actual ?? '',
    unit: item.pomItem?.product?.unit ?? item.product?.unit ?? item.unit ?? 'Cái',
    location: item.location ?? '',
    note: item.condition_note ?? '',
    part_number: item.pomItem?.product?.part_number ?? item.product?.part_number ?? '',
  }))

  const templateBuffer = await getWordFileBuffer(template.word_template_key)
  const rendered = await renderDocxTemplate(templateBuffer, values, devices)
  const latest = await prisma.surveyDocumentVersion.aggregate({
    where: { report_id: reportId }, _max: { version: true },
  })
  const version = (latest._max.version ?? 0) + 1
  const fileName = `BCKS_${survey.report_code}_v${version}.docx`
  const key = buildGeneratedSurveyKey(survey.report_code, version)
  await uploadWordFile(key, rendered.buffer, DOCX_MIME)

  const document = await prisma.surveyDocumentVersion.create({
    data: {
      report_id: reportId,
      form_template_id: template.id,
      version,
      file_key: key,
      file_name: fileName,
      file_size: rendered.buffer.length,
      generated_from_pom_at: survey.pom.items_updated_at ?? new Date(),
      generated_from_survey_at: survey.updated_at,
      template_version: template.version,
      created_by: req.user?.id ?? null,
    },
  })

  res.status(201).json(successResponse({ ...document, is_stale: false, warnings: rendered.warnings },
    rendered.warnings.length ? `Đã tạo phiên bản ${version}, còn ${rendered.warnings.length} placeholder chưa có dữ liệu` : `Đã tạo phiên bản ${version}`))
})

export const downloadSurveyDocument = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const documentId = parseInt(req.params.documentId)
  const document = await prisma.surveyDocumentVersion.findFirst({ where: { id: documentId, report_id: reportId } })
  if (!document) throw new AppError(404, 'Không tìm thấy phiên bản tài liệu')
  const buffer = await getWordFileBuffer(document.file_key)
  res.setHeader('Content-Type', DOCX_MIME)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.file_name)}`)
  res.send(buffer)
})

export const finalizeSurveyDocument = asyncHandler(async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id)
  const documentId = parseInt(req.params.documentId)
  const exists = await prisma.surveyDocumentVersion.findFirst({ where: { id: documentId, report_id: reportId } })
  if (!exists) throw new AppError(404, 'Không tìm thấy phiên bản tài liệu')
  await prisma.$transaction([
    prisma.surveyDocumentVersion.updateMany({ where: { report_id: reportId }, data: { is_final: false } }),
    prisma.surveyDocumentVersion.update({ where: { id: documentId }, data: { is_final: true } }),
  ])
  res.json(successResponse(null, `Đã chốt phiên bản ${exists.version} làm bản chính thức`))
})
