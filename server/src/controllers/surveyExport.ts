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
  ImageRun, LevelFormat,
} from 'docx'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../middleware/errorHandler'
import sizeOf from 'image-size'

const globalForPrisma = global as typeof global & { _prisma?: PrismaClient }
if (!globalForPrisma._prisma) globalForPrisma._prisma = new PrismaClient()
const prisma = globalForPrisma._prisma

// ─── Types (mirror src/types/form.ts) ────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox'
  | 'radio' | 'date' | 'table' | 'image' | 'section' | 'richtext' | 'group_table'

interface TableColumn { key: string; label: string; type: string; options?: string[] }

// mirror src/types/form.ts — GroupTableGroup
interface GroupTableGroup {
  id:   string
  name: string
  rows: Record<string, any>[]
}

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

// Các field key kiểu cũ (form_data) từng dùng để nhập tay danh sách thiết
// bị đề xuất — nay đã bị thay bằng bảng thiết bị lấy LIVE từ POM (xem
// renderDeviceTable). Lọc các key này ra khỏi customFields/fallback để
// không render trùng 2 bảng thiết bị trong 1 file Word.
const DEVICE_TABLE_KEYS = ['proposed_devices', 'danh_sach_thiet_bi', 'thiet_bi_de_xuat']

/**
 * Render bảng "Danh sách thiết bị đề xuất" LIVE từ SurveyItem + PomItem/Product.
 * Đây là nguồn dữ liệu duy nhất cho bảng thiết bị trong file Word xuất ra —
 * không đọc từ form_data nữa, nên không còn tình trạng lệch với POM hay phải
 * gõ lại tay khi POM thay đổi (chỉ cần bấm "Đồng bộ" trong app rồi xuất lại).
 */
function renderDeviceTable(items: any[]): Table {
  const activeItems = items.filter(i => !i.is_removed_from_pom)
  const cols = [
    { label: 'STT',            w: 500  },
    { label: 'Tên thiết bị',   w: 4200 },
    { label: 'SL đề xuất',     w: 1400 },
    { label: 'SL thực tế',     w: 1400 },
    { label: 'Vị trí lắp đặt', w: 2200 },
    { label: 'Ghi chú',        w: 0    }, // lấy phần dư
  ]
  const fixedW = cols.reduce((s, c) => s + c.w, 0)
  cols[cols.length - 1].w = CONTENT_W - fixedW

  const rows = activeItems.map((item, idx) => {
    const productName = item.pomItem?.product?.name ?? item.product?.name ?? item.product_name ?? '—'
    const proposedQty = item.pomItem?.quantity != null ? String(item.pomItem.quantity) : '—'
    return new TableRow({
      children: [
        tdCell(String(idx + 1), cols[0].w, true),
        tdCell(productName, cols[1].w),
        tdCell(proposedQty, cols[2].w, true),
        tdCell(String(item.quantity_actual ?? 0), cols[3].w, true),
        tdCell(item.location ?? '', cols[4].w),
        tdCell(item.condition_note ?? '', cols[5].w),
      ],
    })
  })

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: cols.map(c => c.w),
    rows: [
      new TableRow({ tableHeader: true, children: cols.map(c => thCell(c.label, c.w)) }),
      ...(rows.length > 0 ? rows : [new TableRow({ children: [
        new TableCell({
          columnSpan: cols.length,
          width: { size: CONTENT_W, type: WidthType.DXA },
          borders: bordersThin(),
          margins: { top: 80, bottom: 80, left: 160, right: 160 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run('(Chưa có thiết bị nào)', { italics: true, color: '9E9E9E', size: 18 })],
          })],
        }),
      ] })]),
    ],
  })
}

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

/**
 * Tách text nhiều dòng (chứa \n) thành mảng TextRun có `break`.
 * docx KHÔNG tự hiểu ký tự \n trong 1 TextRun — phải khai báo break
 * tường minh, nếu không toàn bộ nội dung sẽ bị in dính liền thành
 * một khối văn bản duy nhất.
 */
function multilineRuns(text: string, opts: any = {}): TextRun[] {
  const lines = String(text ?? '').split(/\r?\n/)
  return lines.flatMap((line, i) =>
    i === 0 ? [run(line, opts)] : [run(line, { ...opts, break: 1 })]
  )
}

const MAX_IMG_WIDTH_PX = 480

/**
 * Tải ảnh từ URL (vd. Supabase Storage public URL) về buffer và
 * tạo ImageRun để nhúng trực tiếp vào docx, thay vì chỉ in URL ra text.
 * Trả về null nếu tải lỗi (URL chết, không phải ảnh, mạng lỗi...).
 */
async function fetchImageRun(url: string): Promise<ImageRun | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const arrBuf = await res.arrayBuffer()
    const buffer = Buffer.from(arrBuf)

    const dim = sizeOf(buffer)
    if (!dim.width || !dim.height) return null

    const scale = dim.width > MAX_IMG_WIDTH_PX ? MAX_IMG_WIDTH_PX / dim.width : 1
    const width = Math.round(dim.width * scale)
    const height = Math.round(dim.height * scale)

    return new ImageRun({
      data: buffer,
      transformation: { width, height },
    })
  } catch (err) {
    console.error('[surveyExport] fetchImageRun failed for', url, err)
    return null
  }
}

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
    children: display === '—'
      ? [run(display, { color: '9E9E9E' })]
      : multilineRuns(display, { color: '212121' }),
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
 * Render field type='group_table' thành Table Word — ô "Nhóm" GỘP
 * (rowSpan) theo chiều dọc trên toàn bộ hàng con của từng nhóm, STT
 * đánh số LIÊN TỤC xuyên suốt các nhóm (không reset về 1).
 *
 * Kỹ thuật: thư viện `docx` hỗ trợ rowSpan kiểu "khai báo 1 lần" —
 * chỉ cần set `rowSpan: N` ở TableCell của HÀNG ĐẦU nhóm, các hàng
 * sau trong cùng nhóm KHÔNG được thêm cell cho cột đó nữa (bỏ hẳn),
 * thư viện tự tính toán merge khi ghi ra OOXML — không cần cell
 * "continue" như viết OOXML tay.
 */
function renderGroupTableField(field: FormField, value: any): Table {
  const columns: TableColumn[] = field.columns ?? []
  const groups: any[] = Array.isArray(value) ? value : []

  const totalRows = groups.reduce((sum, g) => sum + (Array.isArray(g.rows) ? g.rows.length : 0), 0)
  if (columns.length === 0 || totalRows === 0) {
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        borders: bordersThin(),
        margins: { top: 80, bottom: 80, left: 160, right: 160 },
        children: [para([run('(Không có dữ liệu)', { italics: true, color: '9E9E9E' })])],
      })] })],
    })
  }

  // Độ rộng cột: Nhóm | STT | các cột thường
  const groupW = 1800
  const sttW = 600
  const normalW = Math.floor((CONTENT_W - groupW - sttW) / columns.length)
  const colWidths = columns.map(() => normalW)
  const diff = CONTENT_W - groupW - sttW - colWidths.reduce((a, b) => a + b, 0)
  if (colWidths.length > 0) colWidths[colWidths.length - 1] += diff

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      thCell('Nhóm', groupW),
      thCell('STT', sttW),
      ...columns.map((c, i) => thCell(c.label, colWidths[i])),
    ],
  })

  const dataRows: TableRow[] = []
  let stt = 0
  for (const group of groups) {
    const rows: Record<string, any>[] = Array.isArray(group.rows) ? group.rows : []
    rows.forEach((row, ri) => {
      stt += 1
      const cells: TableCell[] = []
      if (ri === 0) {
        // Hàng đầu nhóm — cell "Nhóm" gộp xuống rows.length hàng
        cells.push(new TableCell({
          width: { size: groupW, type: WidthType.DXA },
          borders: bordersThin(),
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          rowSpan: rows.length,
          children: [new Paragraph({ children: [run(group.name || '(Chưa đặt tên nhóm)', { bold: true, size: 18 })] })],
        }))
      }
      cells.push(tdCell(String(stt), sttW, true))
      columns.forEach((col, ci) => {
        const isCenter = col.type === 'number' || col.type === 'select'
        const val = row[col.key] !== undefined ? String(row[col.key]) : ''
        cells.push(tdCell(val, colWidths[ci], isCenter))
      })
      dataRows.push(new TableRow({ children: cells }))
    })
  }

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [groupW, sttW, ...colWidths],
    rows: [headerRow, ...dataRows],
  })
}


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

// ─── RICH TEXT (field type='richtext') → docx ─────────────────
// Nội dung field richtext lưu dạng TipTap/ProseMirror JSON doc (xem
// RichTextEditor.tsx phía frontend) — KHÔNG phải HTML thô. Vì schema
// JSON này do chính app kiểm soát (chỉ sinh ra từ editor, không phải
// người dùng upload file tuỳ ý) nên convert 1-1 sang docx an toàn,
// không cần parse HTML/OOXML rủi ro vỡ định dạng.
//
// Numbering reference dùng chung cho MỌI field richtext trong 1 file
// export — xem khai báo `numbering.config` khi tạo `Document` bên dưới.
const RTE_BULLET_REF  = 'rte-bullet'
const RTE_ORDERED_REF = 'rte-ordered'
const RTE_MAX_LEVELS  = 4

/** Convert mảng inline node (text + marks) của TipTap → TextRun[] */
function rteInlineRuns(nodes: any[] = []): TextRun[] {
  const runs: TextRun[] = []
  for (const n of nodes) {
    if (n.type !== 'text') continue
    const marks: string[] = (n.marks ?? []).map((m: any) => m.type)
    runs.push(run(n.text ?? '', {
      bold:          marks.includes('bold'),
      italics:       marks.includes('italic'),
      underline:     marks.includes('underline') ? {} : undefined,
      strike:        marks.includes('strike'),
    }))
  }
  return runs.length > 0 ? runs : [run('')]
}

/** Map giá trị textAlign của TipTap (extension TextAlign) → AlignmentType của docx */
const RTE_ALIGN_MAP: Record<string, any> = {
  left:    AlignmentType.LEFT,
  center:  AlignmentType.CENTER,
  right:   AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

/**
 * Convert 1 node paragraph (bên trong listItem hoặc top-level) → Paragraph,
 * gắn numbering nếu nằm trong list. Heading được xử lý riêng ở
 * renderRichTextField (listItem của TipTap chỉ chứa paragraph/list con,
 * không chứa heading, nên hàm này không cần xử lý case đó).
 */
function rteBlockParagraph(node: any, listCtx?: { ref: string; level: number }): Paragraph {
  const opts: any = { spacing: { before: 0, after: 60 } }
  if (listCtx) {
    opts.numbering = { reference: listCtx.ref, level: Math.min(listCtx.level, RTE_MAX_LEVELS - 1) }
  }
  if (node.attrs?.textAlign) {
    opts.alignment = RTE_ALIGN_MAP[node.attrs.textAlign] ?? AlignmentType.LEFT
  }
  return new Paragraph({ ...opts, children: rteInlineRuns(node.content) })
}

/** Runs cho heading — merge style heading vào từng run in đậm/nghiêng gốc của user */
function rteHeadingRuns(nodes: any[] = [], style: any): TextRun[] {
  const inline = nodes.filter(n => n.type === 'text')
  if (inline.length === 0) return [run('', style)]
  return inline.map(n => {
    const marks: string[] = (n.marks ?? []).map((m: any) => m.type)
    return run(n.text ?? '', {
      ...style,
      bold: true, // heading luôn đậm, không phụ thuộc mark gốc
      italics: marks.includes('italic'),
      underline: marks.includes('underline') ? {} : undefined,
    })
  })
}

/**
 * Duyệt đệ quy list node (bulletList/orderedList) → mảng Paragraph.
 * Mỗi listItem có thể chứa paragraph(s) + list con lồng bên trong —
 * list con tăng `level` lên 1, dùng đúng reference (bullet/ordered)
 * theo type của chính nó tại điểm đó (Word cho phép trộn bullet/số
 * lồng nhau).
 */
function rteListParagraphs(listNode: any, level: number): Paragraph[] {
  const ref = listNode.type === 'orderedList' ? RTE_ORDERED_REF : RTE_BULLET_REF
  const out: Paragraph[] = []
  for (const item of listNode.content ?? []) {
    if (item.type !== 'listItem') continue
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...rteListParagraphs(child, level + 1))
      } else if (child.type === 'paragraph') {
        out.push(rteBlockParagraph(child, { ref, level }))
      }
    }
  }
  return out
}

/**
 * Nội dung 1 ô bảng (tableCell/tableHeader) có thể chứa nhiều paragraph con
 * (Word cho phép xuống dòng trong 1 ô) — giữ nguyên từng dòng thành 1
 * Paragraph riêng trong TableCell.children thay vì gộp lại, để giống bản
 * gốc Word nhất. Header luôn in đậm + canh giữa bất kể mark gốc của user.
 */
/**
 * Nội dung 1 ô bảng (tableCell/tableHeader). Hỗ trợ nhiều paragraph con
 * (Word cho xuống dòng trong ô — giữ nguyên từng dòng), VÀ ảnh (dùng cho ô
 * chứa ảnh trong bảng "gallery ảnh" — xem groupConsecutiveImages ở
 * RichTextEditor.tsx, hoặc ảnh nằm sẵn trong ô bảng gốc của Word). Async vì
 * ảnh cần fetchImageRun tải về từ Supabase Storage trước khi nhúng vào docx.
 */
async function rteCellParagraphs(node: any, isHeader: boolean): Promise<Paragraph[]> {
  const children: any[] = node.content ?? []
  const out: Paragraph[] = []
  for (const c of children) {
    if (c.type === 'paragraph') {
      const inline = (c.content ?? []).filter((n: any) => n.type === 'text')
      const runs = isHeader
        ? (inline.length > 0 ? inline : [{ text: '' }]).map((n: any) => {
            const marks: string[] = (n.marks ?? []).map((m: any) => m.type)
            return run(n.text ?? '', {
              bold: true,
              italics: marks.includes('italic'),
              underline: marks.includes('underline') ? {} : undefined,
              size: 18,
            })
          })
        : rteInlineRuns(c.content)
      out.push(new Paragraph({
        spacing: { before: 0, after: 0 },
        alignment: isHeader
          ? AlignmentType.CENTER
          : (c.attrs?.textAlign ? RTE_ALIGN_MAP[c.attrs.textAlign] ?? AlignmentType.LEFT : AlignmentType.LEFT),
        children: runs,
      }))
    } else if (c.type === 'image' && c.attrs?.src) {
      const imgRun = await fetchImageRun(c.attrs.src)
      if (imgRun) {
        out.push(new Paragraph({
          spacing: { before: 0, after: 0 },
          alignment: AlignmentType.CENTER,
          children: [imgRun],
        }))
      }
    }
  }
  return out.length > 0 ? out : [new Paragraph({ children: [] })]
}

/** Ô chỉ chứa đúng 1 ảnh, không có chữ — dùng để tự bỏ viền (bảng "gallery
 *  ảnh" gom nhiều ảnh cạnh nhau không cần viền như bảng dữ liệu thật). */
function rteCellIsImageOnly(node: any): boolean {
  const children: any[] = node.content ?? []
  return children.length === 1 && children[0].type === 'image'
}

/**
 * TipTap table node (do người dùng chèn tay qua toolbar, hoặc do nhập file
 * .docx qua mammoth — mammoth convert bảng Word thật, kể cả ô gộp ngang/dọc,
 * thành <table> chuẩn với colspan/rowspan) → docx Table.
 * Chia đều độ rộng cột theo CONTENT_W (docx không cần biết độ rộng gốc từ
 * Word, chỉ cần tổng khớp trang A4).
 */
async function renderRteTable(tableNode: any): Promise<Table> {
  const rows: any[] = (tableNode.content ?? []).filter((r: any) => r.type === 'tableRow')
  if (rows.length === 0) {
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [new TableRow({ children: [new TableCell({
        width: { size: CONTENT_W, type: WidthType.DXA },
        borders: bordersThin(),
        children: [para([run('(Bảng trống)', { italics: true, color: '9E9E9E', size: 18 })])],
      })] })],
    })
  }

  const colCount = Math.max(
    1,
    ...rows.map((r: any) => (r.content ?? []).reduce((sum: number, c: any) => sum + (c.attrs?.colspan ?? 1), 0))
  )
  const colWidth = Math.floor(CONTENT_W / colCount)

  const docxRows: TableRow[] = []
  for (const r of rows) {
    const cells: any[] = r.content ?? []
    const hasHeader = cells.some((c: any) => c.type === 'tableHeader')
    const tableCells: TableCell[] = []
    for (const c of cells) {
      const isHeader = c.type === 'tableHeader'
      const colspan = c.attrs?.colspan ?? 1
      const rowspan = c.attrs?.rowspan ?? 1
      const imageOnly = rteCellIsImageOnly(c)
      tableCells.push(new TableCell({
        width: { size: colWidth * colspan, type: WidthType.DXA },
        ...(colspan > 1 ? { columnSpan: colspan } : {}),
        ...(rowspan > 1 ? { rowSpan: rowspan } : {}),
        borders: imageOnly ? bordersNone() : bordersThin(),
        margins: imageOnly
          ? { top: 40, bottom: 40, left: 40, right: 40 }
          : { top: 60, bottom: 60, left: 100, right: 100 },
        verticalAlign: VerticalAlign.CENTER,
        shading: isHeader ? { fill: 'E8EAF6', type: ShadingType.CLEAR } : undefined,
        children: await rteCellParagraphs(c, isHeader),
      }))
    }
    docxRows.push(new TableRow({ tableHeader: hasHeader, children: tableCells }))
  }

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: docxRows,
  })
}

/** Entry point: TipTap doc JSON → mảng Paragraph/Table để chèn vào docx.
 *  Async vì node ảnh (dán từ Word) cần fetchImageRun (async) để tải ảnh
 *  từ Supabase Storage về buffer trước khi nhúng vào docx. */
async function renderRichTextField(doc: any): Promise<(Paragraph | Table)[]> {
  const content: any[] = Array.isArray(doc?.content) ? doc.content : []
  const out: (Paragraph | Table)[] = []
  for (const node of content) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      out.push(...rteListParagraphs(node, 0))
    } else if (node.type === 'heading') {
      const level = node.attrs?.level ?? 2
      const style = level <= 2
        ? { size: 24, color: '1A237E' }
        : level === 3
          ? { size: 22, color: '283593' }
          : { size: 20, color: '37474F' }
      out.push(new Paragraph({
        spacing: { before: 160, after: 60 },
        alignment: node.attrs?.textAlign ? RTE_ALIGN_MAP[node.attrs.textAlign] ?? undefined : undefined,
        children: rteHeadingRuns(node.content, style),
      }))
    } else if (node.type === 'paragraph') {
      // Bỏ qua paragraph rỗng liên tiếp để tránh nhiều dòng trắng thừa khi export
      const hasText = (node.content ?? []).some((n: any) => n.type === 'text' && n.text)
      if (hasText) out.push(rteBlockParagraph(node))
    } else if (node.type === 'image') {
      // Node ảnh của extension @tiptap/extension-image — cấp block, ngang
      // hàng với paragraph/heading trong doc.content (không lồng trong
      // paragraph). src là public URL Supabase Storage (đã upload lúc paste).
      const src = node.attrs?.src
      if (src) {
        const imgRun = await fetchImageRun(src)
        if (imgRun) {
          out.push(new Paragraph({
            spacing: { before: 80, after: 80 },
            alignment: AlignmentType.CENTER,
            children: [imgRun],
          }))
        }
      }
    } else if (node.type === 'table') {
      // Node bảng của extension @tiptap/extension-table — cấp block, ngang
      // hàng với paragraph/heading/image. Dùng chung được cho cả bảng chèn
      // tay lẫn bảng nhập từ file .docx qua mammoth (kể cả ô gộp).
      out.push(await renderRteTable(node))
    }
    // blockquote/codeBlock/horizontalRule: chưa hỗ trợ toolbar phía FE nên
    // hiếm khi xuất hiện — nếu có, bỏ qua thay vì crash export.
  }
  return out.length > 0 ? out : [para([run('—', { color: '9E9E9E' })])]
}

// ─── SCHEMA-DRIVEN RENDERER ───────────────────────────────────
/**
 * Duyệt qua FormField[] (schema), render từng field thành
 * mảng docx elements.  Không biết gì về cấu trúc form cụ thể.
 */
async function renderFields(
  fields: FormField[],
  formData: Record<string, any>,
  skipKeys: string[] = []
): Promise<(Paragraph | Table)[]> {
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

      case 'group_table':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(renderGroupTableField(field, value))
        elements.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }))
        break

      case 'textarea':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(
          new Paragraph({
            spacing: { before: 0, after: 80 },
            indent: { left: 200 },
            children: value
              ? multilineRuns(value, { color: '212121' })
              : [run('—', { color: '9E9E9E' })],
          })
        )
        break

      case 'checkbox':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(...renderCheckboxValue(value))
        break

      case 'richtext':
        elements.push(fieldLabel(field.label, field.required))
        elements.push(...(await renderRichTextField(value)))
        elements.push(new Paragraph({ spacing: { before: 0, after: 60 }, children: [] }))
        break

      case 'image': {
        elements.push(fieldLabel(field.label, field.required))
        if (value) {
          const imgRun = await fetchImageRun(value)
          if (imgRun) {
            elements.push(new Paragraph({
              spacing: { before: 0, after: 120 },
              alignment: AlignmentType.CENTER,
              children: [imgRun],
            }))
          } else {
            elements.push(para([run('[Không tải được ảnh: ' + value + ']', { color: 'C62828', size: 18 })]))
          }
        } else {
          elements.push(fieldValue(null))
        }
        break
      }

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
      items: { include: { product: true, pomItem: { include: { product: true } } }, orderBy: { sort_order: 'asc' } },
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

  // Lọc bỏ BASE_FIELDS + field bảng thiết bị kiểu cũ khỏi templateFields
  // (bảng thiết bị nay render riêng từ SurveyItem, xem renderDeviceTable)
  const customFields = templateFields.filter(f => !BASE_KEYS.includes(f.key) && !DEVICE_TABLE_KEYS.includes(f.key))

  // ── Nhận diện URL ảnh trong các giá trị text thô (form cũ / LAN
  // hardcode không khai báo field type='image' nhưng vẫn lưu URL ảnh
  // dạng chuỗi, vd. "Xem ảnh tại: https://...supabase.co/.../xxx.jpg") ──
  const IMG_URL_RE = /(https?:\/\/\S+\.(?:png|jpe?g|webp|gif))/i

  async function renderRawValue(k: string, v: any): Promise<(Paragraph | Table)[]> {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === 'object') {
        const cols: TableColumn[] = Object.keys(v[0]).map(key => ({ key, label: key, type: 'text' }))
        const syntheticField: FormField = {
          id: k, type: 'table', label,
          key: k, required: false, width: 100, columns: cols,
        }
        return [fieldLabel(syntheticField.label), renderTableField(syntheticField, v)]
      }
      return [fieldLabel(label), para([run(v.join(', ') || '—')])]
    }

    if (typeof v === 'object' && v !== null) {
      return [
        fieldLabel(label),
        ...Object.entries(v).flatMap(([subK, subV]) => [
          para([run(`${subK}: `, { bold: true }), run(String(subV) || '—')], { indent: { left: 200 } }),
        ]),
      ]
    }

    // Chuỗi text có chứa URL ảnh → fetch & nhúng ảnh thay vì chỉ in URL
    const str = v !== undefined && v !== null ? String(v) : ''
    const imgMatch = str.match(IMG_URL_RE)
    if (imgMatch) {
      const imgRun = await fetchImageRun(imgMatch[1])
      if (imgRun) {
        return [
          fieldLabel(label),
          new Paragraph({
            spacing: { before: 0, after: 120 },
            alignment: AlignmentType.CENTER,
            children: [imgRun],
          }),
        ]
      }
      return [fieldLabel(label), para([run('[Không tải được ảnh: ' + imgMatch[1] + ']', { color: 'C62828', size: 18 })])]
    }

    return [fieldLabel(label), fieldValue(v)]
  }

  // 3. Render trước các phần phụ thuộc async (field schema + fallback),
  //    rồi mới build Document — docx không hỗ trợ Promise trong children.
  const customFieldElements = customFields.length > 0
    ? await renderFields(customFields, fd)
    : []

  const fallbackKeys = Object.keys(fd).filter(k => !BASE_KEYS.includes(k) && !DEVICE_TABLE_KEYS.includes(k))
  const fallbackElements = customFields.length === 0 && fallbackKeys.length > 0
    ? (await Promise.all(fallbackKeys.map(k => renderRawValue(k, fd[k])))).flat()
    : []

  // 4. Build document
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
    },
    numbering: {
      config: [
        {
          reference: RTE_BULLET_REF,
          levels: ['●', '○', '▪', '‣'].map((char, level) => ({
            level, format: LevelFormat.BULLET, text: char,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
          })),
        },
        {
          reference: RTE_ORDERED_REF,
          levels: [0, 1, 2, 3].map(level => ({
            level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
          })),
        },
      ],
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
        ...(customFieldElements.length > 0
          ? [
              sectionHeading('II. Nội dung khảo sát'),
              ...customFieldElements,
            ]
          : []
        ),

        // ── Fallback: nếu form_data có dữ liệu nhưng không có schema ──
        // (Form kiểu cũ / LAN hardcode lưu trực tiếp vào form_data)
        ...(fallbackElements.length > 0
          ? [
              sectionHeading('II. Nội dung khảo sát'),
              ...fallbackElements,
            ]
          : []
        ),

        // ── III. DANH SÁCH THIẾT BỊ ĐỀ XUẤT (LIVE từ POM) ─────
        // Nguồn dữ liệu duy nhất: SurveyItem liên kết PomItem — không đọc
        // từ form_data nên luôn khớp với POM tại thời điểm xuất file.
        sectionHeading('III. Danh sách thiết bị đề xuất'),
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        renderDeviceTable(survey.items as any[]),
        new Paragraph({ spacing: { before: 0, after: 0 }, children: [] }),

        // ── Ghi chú chung ─────────────────────────────────────
        ...(survey.general_note ? [
          sectionHeading('Ghi chú chung'),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            indent: { left: 200 },
            children: multilineRuns(survey.general_note, { color: '37474F' }),
          }),
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