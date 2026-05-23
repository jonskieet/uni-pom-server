// ============================================================
// src/pages/survey/DynamicFormRenderer.tsx
// Render form động từ FormTemplate JSON — dùng trong wizard tạo phiếu
// ============================================================

import { colors, radius } from '../../styles/theme'
import type { FormSection, FormFieldDef } from '../../types'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export interface DynamicFormData {
  [sectionKey: string]: any
}

interface Props {
  sections:    FormSection[]
  data:        DynamicFormData
  onChange:    (data: DynamicFormData) => void
  readonly?:   boolean
  pomInfo?:    { pom_code?: string; project_name?: string; customer_name?: string } | null
}

// ─────────────────────────────────────────────────────────────
// SHARED STYLES
// ─────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: colors.textSecondary,
  display: 'block', marginBottom: 5,
}
const inp = (readonly?: boolean): React.CSSProperties => ({
  width: '100%', padding: '8px 11px', fontSize: 13,
  borderRadius: radius.md, border: `1px solid ${colors.border}`,
  background: readonly ? colors.bgSecondary : colors.bgPrimary,
  color: colors.textPrimary, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
  opacity: readonly ? 0.7 : 1,
})
const inpSm = (readonly?: boolean): React.CSSProperties => ({
  ...inp(readonly), padding: '6px 8px', fontSize: 12,
})
const ta = (readonly?: boolean): React.CSSProperties => ({
  ...inp(readonly), resize: 'vertical', minHeight: 68, lineHeight: 1.6,
})
const TH: React.CSSProperties = {
  background: colors.primary, color: '#fff',
  padding: '8px 10px', fontSize: 12, fontWeight: 600,
  textAlign: 'left', whiteSpace: 'nowrap', border: 'none',
}
const TD: React.CSSProperties = {
  padding: '5px 6px', verticalAlign: 'middle',
  borderBottom: `1px solid ${colors.borderLight}`,
}

// ─────────────────────────────────────────────────────────────
// SECTION CARD
// ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${colors.border}`,
      borderRadius: radius.lg, padding: '20px 24px', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        paddingBottom: 12, borderBottom: `1px solid ${colors.borderLight}`,
        fontSize: 11, fontWeight: 700, color: colors.primary,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15 }} />
        {title}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// FIELD RENDERER
// ─────────────────────────────────────────────────────────────
function FieldRenderer({ field, value, onChange, readonly }: {
  field:    FormFieldDef
  value:    any
  onChange: (v: any) => void
  readonly?: boolean
}) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value ?? ''}
        disabled={readonly}
        onChange={e => onChange(e.target.value)}
        style={ta(readonly)}
        placeholder={field.placeholder}
        rows={3}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <select
        value={value ?? ''}
        disabled={readonly}
        onChange={e => onChange(e.target.value)}
        style={inp(readonly)}
      >
        {(field.options ?? []).map(o => <option key={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'number') {
    return (
      <input
        type="number" min={0}
        value={value ?? 0}
        disabled={readonly}
        onChange={e => onChange(Number(e.target.value))}
        style={{ ...inp(readonly), textAlign: 'center' }}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={value ?? ''}
        disabled={readonly}
        onChange={e => onChange(e.target.value)}
        style={inp(readonly)}
      />
    )
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      disabled={readonly}
      onChange={e => onChange(e.target.value)}
      style={inp(readonly)}
      placeholder={field.placeholder}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// FIELDS SECTION
// ─────────────────────────────────────────────────────────────
function FieldsSection({ section, data, onChange, readonly }: {
  section:  FormSection
  data:     Record<string, any>
  onChange: (key: string, val: any) => void
  readonly?: boolean
}) {
  const fields = section.fields ?? []
  const hasMultiCol = fields.length > 1 && fields.every(f => f.type !== 'textarea')

  if (hasMultiCol && fields.length <= 3) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fields.length}, 1fr)`, gap: 16 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={lbl}>
              {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            <FieldRenderer
              field={f}
              value={data[f.key]}
              onChange={v => onChange(f.key, v)}
              readonly={readonly}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {fields.map(f => (
        <div key={f.key}>
          <label style={lbl}>
            {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <FieldRenderer
            field={f}
            value={data[f.key]}
            onChange={v => onChange(f.key, v)}
            readonly={readonly}
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TABLE SECTION
// ─────────────────────────────────────────────────────────────
function TableSection({ section, rows, onRowChange, onAddRow, onRemoveRow, readonly }: {
  section:     FormSection
  rows:        Record<string, any>[]
  onRowChange: (idx: number, key: string, val: any) => void
  onAddRow:    () => void
  onRemoveRow: (idx: number) => void
  readonly?:   boolean
}) {
  const columns = section.columns ?? []

  return (
    <div>
      <div style={{ overflowX: 'auto', borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 44, textAlign: 'center', borderRadius: '6px 0 0 0' }}>STT</th>
              {columns.map((col, ci) => (
                <th key={col.key} style={{
                  ...TH,
                  width: col.width || undefined,
                  borderRadius: ci === columns.length - 1 && !readonly ? '0' : ci === columns.length - 1 ? '0 6px 0 0' : undefined,
                }}>
                  {col.label}
                </th>
              ))}
              {!readonly && <th style={{ ...TH, width: 36, borderRadius: '0 6px 0 0' }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : colors.bgSecondary }}>
                <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: colors.textTertiary, fontSize: 12 }}>
                  {ri + 1}
                </td>
                {columns.map(col => (
                  <td key={col.key} style={TD}>
                    {col.type === 'select' ? (
                      <select
                        value={row[col.key] ?? (col.options?.[0] ?? '')}
                        disabled={readonly}
                        onChange={e => onRowChange(ri, col.key, e.target.value)}
                        style={{ ...inpSm(readonly), width: col.width ? col.width - 12 : '100%' }}
                      >
                        {(col.options ?? []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : col.type === 'number' ? (
                      <input
                        type="number" min={0}
                        value={row[col.key] ?? 0}
                        disabled={readonly}
                        onChange={e => onRowChange(ri, col.key, Number(e.target.value))}
                        style={{ ...inpSm(readonly), width: col.width ? col.width - 12 : 68, textAlign: 'center' }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={row[col.key] ?? ''}
                        disabled={readonly}
                        onChange={e => onRowChange(ri, col.key, e.target.value)}
                        style={inpSm(readonly)}
                        placeholder={col.placeholder}
                      />
                    )}
                  </td>
                ))}
                {!readonly && (
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <button
                      onClick={() => onRemoveRow(ri)}
                      title="Xóa dòng"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
                    >×</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readonly && (
        <button
          onClick={onAddRow}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 10, background: colors.primaryLight, color: colors.primary,
            border: `1px dashed #a5b4fc`, borderRadius: radius.md,
            padding: '7px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: 13 }} />
          {section.addLabel ?? 'Thêm dòng'}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN RENDERER
// ─────────────────────────────────────────────────────────────
export function buildDefaultData(sections: FormSection[], pomInfo?: Props['pomInfo']): DynamicFormData {
  const data: DynamicFormData = {}
  for (const sec of sections) {
    if (sec.type === 'table') {
      data[sec.key] = (sec.defaultRows ?? []).map(r => ({ ...r }))
    } else {
      data[sec.key] = {}
      for (const f of (sec.fields ?? [])) {
        // pre-fill từ pomInfo
        if (f.key === 'unit_name' && pomInfo?.customer_name) {
          data[sec.key][f.key] = pomInfo.customer_name
        } else if (f.key === 'survey_date') {
          data[sec.key][f.key] = new Date().toISOString().slice(0, 10)
        } else {
          data[sec.key][f.key] = f.type === 'number' ? 0 : ''
        }
      }
    }
  }
  return data
}

export default function DynamicFormRenderer({ sections, data, onChange, readonly, pomInfo }: Props) {
  function handleFieldChange(sectionKey: string, fieldKey: string, val: any) {
    onChange({
      ...data,
      [sectionKey]: { ...(data[sectionKey] ?? {}), [fieldKey]: val },
    })
  }

  function handleRowChange(sectionKey: string, rowIdx: number, colKey: string, val: any) {
    const rows = [...(data[sectionKey] ?? [])]
    rows[rowIdx] = { ...rows[rowIdx], [colKey]: val }
    onChange({ ...data, [sectionKey]: rows })
  }

  function handleAddRow(section: FormSection) {
    const emptyRow: Record<string, any> = {}
    for (const col of (section.columns ?? [])) {
      emptyRow[col.key] = col.type === 'number' ? 0 : col.type === 'select' ? (col.options?.[0] ?? '') : ''
    }
    const rows = [...(data[section.key] ?? []), emptyRow]
    onChange({ ...data, [section.key]: rows })
  }

  function handleRemoveRow(sectionKey: string, rowIdx: number) {
    const rows = (data[sectionKey] ?? []).filter((_: any, i: number) => i !== rowIdx)
    onChange({ ...data, [sectionKey]: rows })
  }

  return (
    <div>
      {/* Thông tin POM liên kết */}
      {pomInfo && (
        <div style={{
          background: colors.primaryLight, border: `1px solid #c7d2fe`,
          borderRadius: radius.md, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
        }}>
          <i className="ti ti-file-invoice" style={{ color: colors.primary, fontSize: 16 }} />
          <span>
            POM: <b style={{ color: colors.primary }}>{pomInfo.pom_code}</b>
            {pomInfo.project_name && <> · Dự án: <b>{pomInfo.project_name}</b></>}
            {pomInfo.customer_name && <> · Khách hàng: <b>{pomInfo.customer_name}</b></>}
          </span>
        </div>
      )}

      {sections.map(sec => (
        <SectionCard key={sec.key} icon={sec.icon} title={sec.title}>
          {sec.type === 'table' ? (
            <TableSection
              section={sec}
              rows={data[sec.key] ?? []}
              onRowChange={(ri, k, v) => handleRowChange(sec.key, ri, k, v)}
              onAddRow={() => handleAddRow(sec)}
              onRemoveRow={ri => handleRemoveRow(sec.key, ri)}
              readonly={readonly}
            />
          ) : (
            <FieldsSection
              section={sec}
              data={data[sec.key] ?? {}}
              onChange={(k, v) => handleFieldChange(sec.key, k, v)}
              readonly={readonly}
            />
          )}
        </SectionCard>
      ))}

      <style>{`
        input:focus, textarea:focus, select:focus {
          border-color: ${colors.primary} !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
      `}</style>
    </div>
  )
}
