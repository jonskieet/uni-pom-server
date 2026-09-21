import JSZip from 'jszip'

export interface TemplateDeviceRow {
  index: number
  name: string
  proposed_quantity: number | string
  actual_quantity: number | string
  unit: string
  location: string
  note: string
  part_number: string
}

const xmlEntities: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

function decodeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, match => xmlEntities[match] ?? match)
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function plainText(xml: string): string {
  return decodeXml(xml.replace(/<[^>]+>/g, ''))
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Word thường chia một placeholder thành nhiều run (<w:r>/<w:t>).
// Regex cho phép các thẻ XML chen giữa từng ký tự để người dùng không phải
// sửa lại template chỉ vì Word tự động tách run khi định dạng.
function splitRunPattern(literal: string): RegExp {
  const body = Array.from(literal).map(char => regexEscape(char)).join('(?:<[^>]+>)*')
  return new RegExp(body, 'g')
}

function replaceToken(xml: string, token: string, value: unknown): string {
  return xml.replace(splitRunPattern(`{{${token}}}`), escapeXml(value))
}

function displayValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ')
  if (typeof value === 'object') return ''
  return String(value)
}

export async function inspectDocxTemplate(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)
  const found = new Set<string>()
  const files = Object.keys(zip.files).filter(name => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name))
  for (const name of files) {
    const xml = await zip.file(name)?.async('string')
    if (!xml) continue
    const text = plainText(xml)
    for (const match of text.matchAll(/{{\s*([#/]?)([a-zA-Z0-9_.]+)\s*}}/g)) {
      found.add(`${match[1]}${match[2]}`)
    }
  }
  return Array.from(found).sort()
}

export async function renderDocxTemplate(
  buffer: Buffer,
  values: Record<string, unknown>,
  devices: TemplateDeviceRow[],
): Promise<{ buffer: Buffer; warnings: string[] }> {
  const zip = await JSZip.loadAsync(buffer)
  const warnings = new Set<string>()
  const files = Object.keys(zip.files).filter(name => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name))

  for (const name of files) {
    const file = zip.file(name)
    if (!file) continue
    let xml = await file.async('string')

    // Một dòng thiết bị mẫu phải chứa cả {{#devices}} và {{/devices}}.
    // Toàn bộ định dạng, border, font và độ rộng cột của dòng gốc được giữ lại.
    xml = xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, rowXml => {
      const text = plainText(rowXml)
      if (!text.includes('{{#devices}}') || !text.includes('{{/devices}}')) return rowXml
      return devices.map(device => {
        let row = replaceToken(rowXml, '#devices', '')
        row = replaceToken(row, '/devices', '')
        Object.entries(device).forEach(([key, value]) => {
          row = replaceToken(row, `device.${key}`, displayValue(value))
        })
        return row
      }).join('')
    })

    Object.entries(values).forEach(([key, value]) => {
      xml = replaceToken(xml, key, displayValue(value))
    })

    const remaining = plainText(xml).matchAll(/{{\s*([#/]?)([a-zA-Z0-9_.]+)\s*}}/g)
    for (const match of remaining) warnings.add(`${match[1]}${match[2]}`)
    zip.file(name, xml)
  }

  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    warnings: Array.from(warnings).sort(),
  }
}
