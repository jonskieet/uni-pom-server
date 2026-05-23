// electron/surveyHandlers.ts
// IPC handlers: xuất phiếu báo cáo khảo sát ra file Word
//
// Cài đặt: npm install docx  (đã có sẵn trong devDeps nếu dùng electron-builder)
// Import trong ipcHandlers.ts: import { registerSurveyHandlers } from './surveyHandlers'

import { ipcMain, dialog, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel,
  VerticalAlign, LevelFormat,
} from 'docx'

// ── Types (mirror từ frontend) ────────────────────────────────────────────────

interface DeviceRow {
  stt: number
  ten_thiet_bi: string
  phan_loai: string
  so_luong: string
  chuc_nang: string
  bo_phan: string
}

interface LanSurveyForm {
  ten_don_vi: string
  thoi_gian: string
  nguoi_khao_sat: string
  devices: DeviceRow[]
  ht_ket_noi_internet: string
  ht_bao_mat: string
  ht_switch: string
  ht_wifi: string
  ht_cap_mang: string
  thuyet_minh: string
  proposed: Array<{ ten_thiet_bi: string; so_luong: string; chuc_nang: string; vi_tri: string }>
  ghi_chu: string
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const BRAND   = '3C3489'
const BORDER_COLOR = 'C5CAD5'
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 }

function border(color = BORDER_COLOR) {
  return { style: BorderStyle.SINGLE, size: 1, color }
}

function cellBorders(color = BORDER_COLOR) {
  const b = border(color)
  return { top: b, bottom: b, left: b, right: b }
}

// Text helpers
function bold(text: string, size = 22, color?: string) {
  return new TextRun({ text, bold: true, size, font: 'Times New Roman', color })
}

function normal(text: string, size = 22, color?: string) {
  return new TextRun({ text, size, font: 'Times New Roman', color })
}

function italic(text: string, size = 22) {
  return new TextRun({ text, italics: true, size, font: 'Times New Roman', color: '444444' })
}

// Paragraph helpers
function heading(text: string): Paragraph {
  return new Paragraph({
    children: [bold(text, 22, BRAND)],
    spacing: { before: 200, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND, space: 4 } },
  })
}

function subheading(text: string): Paragraph {
  return new Paragraph({
    children: [bold(text, 22)],
    spacing: { before: 120, after: 80 },
    indent: { left: 0 },
  })
}

function bodyParagraph(text: string): Paragraph {
  // Tách thành nhiều đoạn nếu text có xuống dòng
  return new Paragraph({
    children: [normal(text, 22)],
    spacing: { before: 60, after: 60 },
    indent: { left: 360 },
  })
}

function bulletItem(text: string): Paragraph {
  return new Paragraph({
    children: [normal(text, 22)],
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
  })
}

// Render multiline text (split by \n) thành list of Paragraphs
function multilineBody(text: string, indent = 360): Paragraph[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return [new Paragraph({ children: [italic('(Chưa có thông tin)', 22)], indent: { left: indent } })]
  return lines.map(line => new Paragraph({
    children: [normal(line, 22)],
    spacing: { before: 50, after: 50 },
    indent: { left: indent },
  }))
}

// Header row for tables
function headerRow(cells: { text: string; width: number }[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: cells.map(c => new TableCell({
      shading: { fill: BRAND, type: ShadingType.CLEAR },
      borders: cellBorders(BRAND),
      margins: CELL_MARGINS,
      width: { size: c.width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: c.text, bold: true, size: 20, color: 'FFFFFF', font: 'Times New Roman' })],
        alignment: AlignmentType.CENTER,
      })],
    })),
  })
}

function dataCell(text: string, width: number, align: string = AlignmentType.LEFT, shade = false): TableCell {
  return new TableCell({
    borders: cellBorders(),
    margins: CELL_MARGINS,
    width: { size: width, type: WidthType.DXA },
    shading: shade ? { fill: 'F8F9FC', type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: [normal(text || '—', 20)], alignment: align as any })],
  })
}

// ── Document builder ─────────────────────────────────────────────────────────

function buildLanReport(form: LanSurveyForm): Document {
  // Page setup: A4, margins 2cm
  const PAGE_W   = 11906
  const MARGIN   = 1134  // ~2cm
  const CONTENT  = PAGE_W - MARGIN * 2  // 9638

  // Column widths for device table (total = CONTENT)
  const devCols = [520, 1800, 1800, 800, 2800, 1918]  // sum = 9638
  const propCols = [2200, 900, 3438, 1800, 300]        // with del button hidden

  const sections = []

  // ══ Cover / Title ══
  sections.push(
    new Paragraph({
      children: [bold('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 22)],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
    }),
    new Paragraph({
      children: [bold('Độc lập – Tự do – Hạnh phúc', 22)],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 20 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '222222', space: 4 } },
    }),
    new Paragraph({ children: [], spacing: { before: 200, after: 0 } }),
    new Paragraph({
      children: [bold('PHIẾU BÁO CÁO KHẢO SÁT HIỆN TRẠNG MẠNG NỘI BỘ', 28, BRAND)],
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 60 },
    }),
    new Paragraph({ children: [], spacing: { before: 0, after: 0 } }),
  )

  // ══ I. Thông tin chung ══
  sections.push(
    heading('I. THÔNG TIN CHUNG'),
    new Paragraph({ children: [bold('Tên đơn vị khảo sát:  ', 22), normal(form.ten_don_vi || '...', 22)], spacing: { before: 80, after: 60 }, indent: { left: 360 } }),
    new Paragraph({ children: [bold('Thời gian khảo sát:  ', 22), normal(form.thoi_gian || '...', 22)], spacing: { before: 60, after: 60 }, indent: { left: 360 } }),
    new Paragraph({ children: [bold('Người thực hiện khảo sát:  ', 22), normal(form.nguoi_khao_sat || '...', 22)], spacing: { before: 60, after: 120 }, indent: { left: 360 } }),
  )

  // ══ II. Hiện trạng trang thiết bị ══
  sections.push(heading('II. KHẢO SÁT HIỆN TRẠNG TRANG THIẾT BỊ CÔNG NGHỆ THÔNG TIN'))

  // Device table
  const deviceRows = form.devices.map((d, idx) => new TableRow({
    children: [
      dataCell(String(d.stt || idx + 1), devCols[0], AlignmentType.CENTER, idx % 2 === 0),
      dataCell(d.ten_thiet_bi, devCols[1], AlignmentType.LEFT, idx % 2 === 0),
      dataCell(d.phan_loai, devCols[2], AlignmentType.LEFT, idx % 2 === 0),
      dataCell(d.so_luong, devCols[3], AlignmentType.CENTER, idx % 2 === 0),
      dataCell(d.chuc_nang, devCols[4], AlignmentType.LEFT, idx % 2 === 0),
      dataCell(d.bo_phan, devCols[5], AlignmentType.LEFT, idx % 2 === 0),
    ],
  }))

  sections.push(
    new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: devCols,
      rows: [
        headerRow([
          { text: 'STT',              width: devCols[0] },
          { text: 'Thiết bị',         width: devCols[1] },
          { text: 'Phân loại',        width: devCols[2] },
          { text: 'Số lượng',         width: devCols[3] },
          { text: 'Chức năng & Mô tả', width: devCols[4] },
          { text: 'Bộ phận sử dụng',  width: devCols[5] },
        ]),
        ...deviceRows,
      ],
    }),
    new Paragraph({ children: [], spacing: { before: 200, after: 0 } }),
  )

  // ══ III. Thông tin hiện trạng ══
  sections.push(heading('III. THÔNG TIN HIỆN TRẠNG'))

  const htSections = [
    { label: '1. Kết nối Internet',                     text: form.ht_ket_noi_internet },
    { label: '2. Hệ thống bảo mật an toàn thông tin',  text: form.ht_bao_mat },
    { label: '3. Hệ thống Switch',                     text: form.ht_switch },
    { label: '4. Hệ thống WiFi',                       text: form.ht_wifi },
    { label: '5. Hệ thống dây cáp mạng',               text: form.ht_cap_mang },
  ]

  for (const ht of htSections) {
    sections.push(
      subheading(ht.label),
      ...multilineBody(ht.text),
    )
  }

  // ══ IV. Đề xuất nâng cấp ══
  sections.push(
    heading('IV. NHU CẦU ĐỀ XUẤT NÂNG CẤP TRANG THIẾT BỊ MẠNG LAN'),
    subheading('1. Thuyết minh đề xuất'),
    ...multilineBody(form.thuyet_minh),
    new Paragraph({ children: [], spacing: { before: 120, after: 0 } }),
    subheading('2. Danh sách thiết bị đề xuất'),
  )

  // Proposed devices table
  const propColWidths = [2200, 900, 3538, 1800]  // sum ≈ CONTENT  (drop delete col)
  const propRows = form.proposed
    .filter(p => p.ten_thiet_bi)
    .map((p, idx) => new TableRow({
      children: [
        dataCell(p.ten_thiet_bi, propColWidths[0], AlignmentType.LEFT, idx % 2 === 0),
        dataCell(p.so_luong, propColWidths[1], AlignmentType.CENTER, idx % 2 === 0),
        dataCell(p.chuc_nang, propColWidths[2], AlignmentType.LEFT, idx % 2 === 0),
        dataCell(p.vi_tri, propColWidths[3], AlignmentType.LEFT, idx % 2 === 0),
      ],
    }))

  sections.push(
    new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: propColWidths,
      rows: [
        headerRow([
          { text: 'Tên thiết bị',      width: propColWidths[0] },
          { text: 'Số lượng',          width: propColWidths[1] },
          { text: 'Chức năng / Mô tả', width: propColWidths[2] },
          { text: 'Vị trí triển khai', width: propColWidths[3] },
        ]),
        ...propRows.length ? propRows : [new TableRow({
          children: propColWidths.map(w => dataCell('(Chưa có)', w, AlignmentType.CENTER)),
        })],
      ],
    }),
    new Paragraph({ children: [], spacing: { before: 200, after: 0 } }),
  )

  // ══ V. Ghi chú / Sơ đồ ══
  if (form.ghi_chu?.trim()) {
    sections.push(
      heading('V. GHI CHÚ / SƠ ĐỒ LẮP ĐẶT HẠ TẦNG MẠNG'),
      ...multilineBody(form.ghi_chu),
      new Paragraph({ children: [], spacing: { before: 100, after: 0 } }),
    )
  }

  // ══ Signature block ══
  const now = new Date()
  const dateStr = `${form.thoi_gian || `ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`}`

  sections.push(
    new Paragraph({ children: [], spacing: { before: 240, after: 0 } }),
    new Paragraph({
      children: [italic(`TP. Hồ Chí Minh, ${dateStr}`, 22)],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 80 },
      indent: { right: 720 },
    }),
    // Two-column signature via table
    new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: [CONTENT / 2, CONTENT / 2],
      borders: {
        top: { style: BorderStyle.NONE, size: 0 },
        bottom: { style: BorderStyle.NONE, size: 0 },
        left: { style: BorderStyle.NONE, size: 0 },
        right: { style: BorderStyle.NONE, size: 0 },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: { top: border('FFFFFF'), bottom: border('FFFFFF'), left: border('FFFFFF'), right: border('FFFFFF') },
              width: { size: CONTENT / 2, type: WidthType.DXA },
              children: [
                new Paragraph({ children: [bold('ĐẠI DIỆN ĐƠN VỊ', 22)], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [italic('(Ký, ghi rõ họ tên)', 20)], alignment: AlignmentType.CENTER, spacing: { before: 40, after: 280 } }),
                new Paragraph({ children: [bold(form.ten_don_vi || '...', 22)], alignment: AlignmentType.CENTER }),
              ],
            }),
            new TableCell({
              borders: { top: border('FFFFFF'), bottom: border('FFFFFF'), left: border('FFFFFF'), right: border('FFFFFF') },
              width: { size: CONTENT / 2, type: WidthType.DXA },
              children: [
                new Paragraph({ children: [bold('NGƯỜI KHẢO SÁT', 22)], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [italic('(Ký, ghi rõ họ tên)', 20)], alignment: AlignmentType.CENTER, spacing: { before: 40, after: 280 } }),
                new Paragraph({ children: [bold(form.nguoi_khao_sat || '...', 22)], alignment: AlignmentType.CENTER }),
              ],
            }),
          ],
        }),
      ],
    }),
  )

  return new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    styles: {
      default: { document: { run: { font: 'Times New Roman', size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN + 284 }, // left 2.5cm
        },
      },
      children: sections,
    }],
  })
}

// ── IPC Registration ──────────────────────────────────────────────────────────

export function registerSurveyHandlers(): void {

  ipcMain.handle('survey:exportLanReport', async (_evt, form: LanSurveyForm) => {
    try {
      const doc = buildLanReport(form)
      const buffer = await Packer.toBuffer(doc)

      // Suggest filename
      const safeName = (form.ten_don_vi || 'Bao_cao_khao_sat')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Lưu phiếu báo cáo khảo sát',
        defaultPath: path.join(app.getPath('documents'), `Phieu_BCKS_Mang_LAN_${safeName}.docx`),
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })

      if (canceled || !filePath) return { success: false, error: 'Đã huỷ lưu file' }

      fs.writeFileSync(filePath, buffer)
      return { success: true, path: filePath }

    } catch (err: any) {
      console.error('[survey:exportLanReport]', err)
      return { success: false, error: err?.message || 'Lỗi không xác định' }
    }
  })
}
