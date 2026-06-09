// ============================================================
// src/controllers/surveyExport.ts
// Export Survey Report → Word (.docx)
//
// KIẾN TRÚC: Schema-driven — không hardcode cấu trúc form.
// Đọc form_templates.schema (FormField[]) từ DB, duyệt tuần tự,
// render mỗi field type thành đoạn Word tương ứng.
// Khi kỹ thuật tạo form mới → tự động export đúng, không cần
// sửa code export.
// ============================================================

import { Request, Response } from 'express'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
} from 'docx'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../middleware/errorHandler'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ─── Types (mirror src/types/form.ts) ────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox'
  | 'radio' | 'date' | 'table' | 'image' | 'section'

interface TableColumn { key: string; label: string; type: string; options?: string[] }

interface FormField {
  id: string
  type: FieldType
  label: string
  key: string
  required: boolean
  width: number
  placeholder?: string
  helpText?: string
  options?: string[]
  columns?: TableColumn[]
  defaultRows?: Record<string, any>[]
}

// BASE_FIELDS keys — luôn có trong mọi form
const BASE_KEYS = ['unit_name', 'survey_date', 'surveyor_name', 'site_address']

// ─── Page layout constants (A4) ───────────────────────────────

const PAGE_W    = 11906
const MARGIN    = 1080
const CONTENT_W = PAGE_W - MARGIN * 2   // 9746

// ─── Style helpers ────────────────────────────────────────────

const FONT = 'Times New Roman'

const bdrSingle  = (color = '4472C4', sz = 4)  => ({ style: BorderStyle.SINGLE, size: sz, color })
const bdrNone    = () => ({ style: BorderStyle.NONE, size: 0, color: 'FFFFFF' })
const bordersBox = (color = '4472C4', sz = 4)  => ({ top: bdrSingle(color, sz), bottom: bdrSingle(color, sz), left: bdrSingle(color, sz), right: bdrSingle(color, sz) })
const bordersThin = () => bordersBox('C5CAE9', 1)
const bordersNone = () => ({ top: bdrNone(), bottom: bdrNone(), left: bdrNone(), right: bdrNone() })

const run = (text: string, opts: any = {}) =>
  new TextRun({ text: text ?? '', font: FONT, size: 20, ...opts })

const para = (children: TextRun[], opts: any = {}) =>
  new Paragraph({ children, spacing: { before: 60, after: 60 }, ...opts })

/** Tiêu đề section lớn (mỗi field type='section' hoặc nhóm BASE_FIELDS) */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 100 },
    border: { bottom: bdrSingle('4472C4', 6) },
    children: [run(text, { bold: true, size: 24, color: '1A237E', allCaps: true })],
  })
}

/** Label của field đơn */
function fieldLabel(label: string, required = false): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      run(label, { bold: true, size: 20, color: '37474F' }),
      ...(required ? [run(' *', { bold: true, color: 'C62828', size: 20 })] : []),
    ],
  })
}

/** Giá trị field đơn (text/number/date/select/radio) */
function fieldValue(value: any): Paragraph {
  const display = value !== undefined && value !== null && value !== ''
    ? String(value)
    : '—'
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    indent: { left: 200 },
    children: [run(display, { color: display === '—' ? '9E9E9E' : '212121' })],
  })
}

/** Bảng thông tin cơ bản (BASE_FIELDS) — 2 cột label / value */
function baseInfoTable(fd: Record<string, any>, fields: FormField[]): Table {
  const baseFields = fields.filter(f => BASE_KEYS.includes(f.key))
  const rows = baseFields.map(f =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          borders: bordersThin(),
          shading: { fill: 'E8EAF6', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 160, right: 160 },
          children: [para([run(f.label, { bold: true, size: 20 })])],
        }),
        new TableCell({
          width: { size: CONTENT_W - 3000, type: WidthType.DXA },
          borders: bordersThin(),
          margins: { top: 80, bottom: 80, left: 160, right: 160 },
          children: [para([run(fd[f.key] !== undefined && fd[f.key] !== '' ? String(fd[f.key]) : '—')])],
        }),
      ],
    })
  )

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [3000, CONTENT_W - 3000],
    rows,
  })
}

/** Header cell cho bảng (field type='table') */
function thCell(text: string, w: number): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: bordersBox('2E4057', 4),
    shading: { fill: '2E4057', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(text, { bold: true, color: 'FFFFFF', size: 18 })],
    })],
  })
}

/** Data cell cho bảng */
function tdCell(text: string, w: number, center = false): TableCell {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: bordersThin(),
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [run(text || '', { size: 18 })],
    })],
  })
}

/**
 * Render field type='table' thành Table Word.
 * columns đến từ FormField.columns (định nghĩa trong schema),
 * value là mảng rows từ form_data.
 */
function renderTableField(field: FormField, value: any): Table {
  const columns: TableColumn[] = field.columns ?? []
  const rows: Record<string, any>[] = Array.isArray(value) ? value : []

  if (columns.length === 0) {
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        borders: bordersThin(),
        margins: { top: 80, bottom: 80, left: 160, right: 160 },
        children: [para([run('(Không có cột được định nghĩa)', { italics: true, color: '9E9E9E' })])],
      })] })],
    })
  }

  // Tính độ rộng cột tự động — cột autoindex hẹp hơn
  const totalCols = columns.length
  const autoIndexCols = columns.filter(c => c.type === 'autoindex').length
  const normalCols = totalCols - autoIndexCols
  const indexW = 600
  const normalW = Math.floor((CONTENT_W - autoIndexCols * indexW) / Math.max(normalCols, 1))
  const colWidths = columns.map(c => c.type === 'autoindex' ? indexW : normalW)
  // Bù phần dư vào cột cuối
  const diff = CONTENT_W - colWidths.reduce((a, b) => a + b, 0)
  if (colWidths.length > 0) colWidths[colWidths.length - 1] += diff

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      // Header
      new TableRow({
        tableHeader: true,
        children: columns.map((col, i) => thCell(col.label, colWidths[i])),
      }),
      // Data rows
      ...(rows.length > 0
        ? rows.map((row, rowIdx) =>
            new TableRow({
              children: columns.map((col, i) => {
                const isCenter = col.type === 'autoindex' || col.type === 'number'
                const val = col.type === 'autoindex'
                  ? String(rowIdx + 1)
                  : row[col.key] !== undefined ? String(row[col.key]) : ''
                return tdCell(val, colWidths[i], isCenter)
              }),
            })
          )
        : [new TableRow({ children: [
            new TableCell({
              columnSpan: columns.length,
              width: { size: CONTENT_W, type: WidthType.DXA },
              borders: bordersThin(),
              margins: { top: 80, bottom: 80, left: 160, right: 160 },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run('(Không có dữ liệu)', { italics: true, color: '9E9E9E', size: 18 })],
              })],
            }),
          ] })]
      ),
    ],
  })
}

/**
 * Render checkbox / multi-select value (stored as string[] or comma-separated)
 */
function renderCheckboxValue(value: any): Paragraph[] {
  const vals: string[] = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? value.split(',').map(v => v.trim())
      : []
  if (vals.length === 0) return [fieldValue(null)]
  return vals.map(v =>
    new Paragraph({
      spacing: { before: 0, after: 40 },
      indent: { left: 200 },
      children: [run(`☑  ${v}`, { size: 20 })],
    })
  )
}

// ─── SCHEMA-DRIVEN RENDERER ───────────────────────────────────
/**
 * Duyệt qua FormField[] (schema), render từng field thành
 * mảng docx elements.  Không biết gì về cấu trúc form cụ thể.
 */
function renderFields(
  fields: FormField[],
  formData: Record<string, any>,
  skipKeys: string[] = []
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = []

  for (const field of fields) {
    if (skipKeys.includes(field.key)) continue

    const value = formData[field.key]

    switch (field.type) {
      case 'section':
        elements.push(sectionHeading(field.label))
        if (field.helpText) {
          elements.push(para([run(field.helpText, { italics: true, color: '607D8B', size: 18 })]))
        }
        break

      case 'table':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(renderTableField(field, value))
        elements.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }))
        break

      case 'textarea':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(
          new Paragraph({
            spacing: { before: 0, after: 80 },
            indent: { left: 200 },
            children: [run(value || '—', { color: value ? '212121' : '9E9E9E' })],
          })
        )
        break

      case 'checkbox':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(...renderCheckboxValue(value))
        break

      case 'image':
        // Ảnh: chỉ ghi URL — embedding ảnh từ URL từ xa cần fetch riêng
        elements.push(fieldLabel(field.label, field.required))
        if (value) {
          elements.push(para([run('[Xem ảnh tại: ' + value + ']', { color: '1565C0', size: 18 })]))
        } else {
          elements.push(fieldValue(null))
        }
        break

      // text | number | date | select | radio → plain value
      default:
        elements.push(fieldLabel(field.label, field.required))
        elements.push(fieldValue(value))
        break
    }
  }

  return elements
}

// ─── MAIN EXPORT HANDLER ─────────────────────────────────────

export const exportSurveyWord = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid ID' }); return }

  // 1. Lấy survey + form template
  const survey = await prisma.surveyReport.findUniqueOrThrow({
    where: { id },
    include: {
      pom: true,
      creator: true,
      items: { include: { product: true }, orderBy: { sort_order: 'asc' } },
    },
  })

  let templateFields: FormField[] = []
  let templateName = ''

  if (survey.form_template_id) {
    const tpl = await prisma.formTemplate.findUnique({
      where: { id: survey.form_template_id },
      select: { name: true, schema: true },
    })
    if (tpl) {
      templateName = tpl.name
      // schema lưu dạng FormField[] trong jsonb
      templateFields = (tpl.schema as any) ?? []
    }
  }

  // 2. Chuẩn bị dữ liệu
  const fd: Record<string, any> = (survey.form_data as any) ?? {}

  // Nếu không có template (form thủ công kiểu cũ hoặc form LAN hardcode),
  // vẫn render được nhờ phần fallback BASE_FIELDS ở dưới.

  // BASE_FIELDS luôn hiển thị đầu tiên
  const baseFieldDefs: FormField[] = [
    { id: '__base_unit_name__',    type: 'text', label: 'Tên đơn vị khảo sát', key: 'unit_name',    required: true,  width: 50 },
    { id: '__base_survey_date__',  type: 'date', label: 'Ngày khảo sát',        key: 'survey_date',  required: true,  width: 50 },
    { id: '__base_surveyor_name__',type: 'text', label: 'Người thực hiện KS',   key: 'surveyor_name',required: true,  width: 50 },
    { id: '__base_site_address__', type: 'text', label: 'Địa chỉ đơn vị',       key: 'site_address', required: false, width: 50 },
  ]

  // Merge data từ survey fields nếu form_data không có
  if (!fd.unit_name)     fd.unit_name    = survey.customer_name ?? ''
  if (!fd.survey_date)   fd.survey_date  = survey.survey_date   ?? ''
  if (!fd.surveyor_name) fd.surveyor_name= survey.surveyor_name ?? ''
  if (!fd.site_address)  fd.site_address = survey.site_address  ?? ''

  // Lọc bỏ BASE_FIELDS khỏi templateFields để tránh render 2 lần
  const customFields = templateFields.filter(f => !BASE_KEYS.includes(f.key))

  // 3. Build document
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        // ── Tiêu đề ──────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [run('Độc lập – Tự do – Hạnh phúc', { bold: true, size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 280 },
          border: { bottom: bdrSingle('000000', 4) },
          children: [run('─────────────────────────', { size: 18, color: '666666' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [run('PHIẾU BÁO CÁO KHẢO SÁT', { bold: true, size: 34, allCaps: true })],
        }),
        ...(templateName ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [run(templateName, { bold: true, size: 24, color: '1A237E' })],
        })] : []),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 360 },
          children: [run(`Mã phiếu: ${survey.report_code}`, { size: 20, color: '555555' })],
        }),

        // ── I. THÔNG TIN CHUNG (BASE_FIELDS — luôn có) ───────
        sectionHeading('I. Thông tin chung'),
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        baseInfoTable(fd, baseFieldDefs),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),

        // ── II. NỘI DUNG KHẢO SÁT (custom fields từ schema) ──
        ...(customFields.length > 0
          ? [
              sectionHeading('II. Nội dung khảo sát'),
              ...renderFields(customFields, fd),
            ]
          : []
        ),

        // ── Fallback: nếu form_data có dữ liệu nhưng không có schema ──
        // (Form kiểu cũ / LAN hardcode lưu trực tiếp vào form_data)
        ...(customFields.length === 0 && Object.keys(fd).filter(k => !BASE_KEYS.includes(k)).length > 0
          ? [
              sectionHeading('II. Nội dung khảo sát'),
              ...Object.entries(fd)
                .filter(([k]) => !BASE_KEYS.includes(k))
                .flatMap(([k, v]) => {
                  if (Array.isArray(v)) {
                    // Bảng: đoán columns từ keys của row đầu tiên
                    if (v.length > 0 && typeof v[0] === 'object') {
                      const cols: TableColumn[] = Object.keys(v[0]).map(key => ({ key, label: key, type: 'text' }))
                      const syntheticField: FormField = {
                        id: k, type: 'table', label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        key: k, required: false, width: 100, columns: cols,
                      }
                      return [fieldLabel(syntheticField.label), renderTableField(syntheticField, v)]
                    }
                    return [fieldLabel(k), para([run(v.join(', ') || '—')])]
                  }
                  if (typeof v === 'object' && v !== null) {
                    // Object lồng nhau: render từng key con
                    return [
                      fieldLabel(k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
                      ...Object.entries(v).flatMap(([subK, subV]) => [
                        para([run(`${subK}: `, { bold: true }), run(String(subV) || '—')], { indent: { left: 200 } }),
                      ]),
                    ]
                  }
                  return [fieldLabel(k.replace(/_/g, ' ')), fieldValue(v)]
                }),
            ]
          : []
        ),

        // ── Ghi chú chung ─────────────────────────────────────
        ...(survey.general_note ? [
          sectionHeading('Ghi chú chung'),
          para([run(survey.general_note, { color: '37474F' })], { indent: { left: 200 } }),
        ] : []),

        // ── Chữ ký ────────────────────────────────────────────
        new Paragraph({ spacing: { before: 440, after: 0 }, children: [] }),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
          rows: [new TableRow({ children: [
            new TableCell({
              width: { size: CONTENT_W / 2, type: WidthType.DXA },
              borders: bordersNone(),
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run('ĐẠI DIỆN ĐƠN VỊ KHẢO SÁT', { bold: true, size: 22 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run('(Ký, ghi rõ họ tên)', { italics: true, size: 18, color: '777777' })] }),
                new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER, children: [run(fd.surveyor_name || '', { size: 22 })] }),
              ],
            }),
            new TableCell({
              width: { size: CONTENT_W / 2, type: WidthType.DXA },
              borders: bordersNone(),
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run('NGƯỜI LẬP PHIẾU', { bold: true, size: 22 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [run('(Ký, ghi rõ họ tên)', { italics: true, size: 18, color: '777777' })] }),
                new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER, children: [run(survey.creator?.full_name || '', { size: 22 })] }),
              ],
            }),
          ] })],
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const unitName = (fd.unit_name || survey.project_name || 'export').replace(/\s+/g, '_').slice(0, 40)
  const filename = `PBCKS_${survey.report_code}_${unitName}.docx`

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(buffer)
})