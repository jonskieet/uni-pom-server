// src/components/FormRenderer.tsx
// Render một FormTemplate thành form thực tế (dùng trong SurveyReport)
import { useState, useRef } from 'react'
import type { FormTemplate, FormField, FormData } from '../types/form'
import { colors } from '../styles/theme'

// ── Input styles ──────────────────────────────────────────────
const input: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  borderRadius: 8, border: `0.5px solid ${colors.border}`,
  background: colors.bgPrimary, color: colors.textPrimary,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
}

// ── Single field renderer ─────────────────────────────────────
function FieldRenderer({ field, value, onChange, readOnly }: {
  field:    FormField
  value:    any
  onChange: (val: any) => void
  readOnly?: boolean
}) {
  const [tableRows, setTableRows] = useState<Record<string, any>[]>(
    Array.isArray(value) ? value : (field.columns ? [{}] : [])
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const updateTable = (rows: Record<string, any>[]) => {
    setTableRows(rows); onChange(rows)
  }

  if (field.type === 'section') return (
    <div style={{
      gridColumn: '1 / -1',
      borderBottom: `2px solid ${colors.primary}`,
      paddingBottom: 6, marginBottom: 4,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.primary }}>{field.label}</span>
      {field.helpText && (
        <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>{field.helpText}</div>
      )}
    </div>
  )

  const label = (
    <div style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, marginBottom: 4 }}>
      {field.label}
      {field.required && <span style={{ color: colors.danger, marginLeft: 3 }}>*</span>}
    </div>
  )

  const help = field.helpText && (
    <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>{field.helpText}</div>
  )

  const content = (() => {
    switch (field.type) {

      case 'text':
        return <input style={input} type="text" placeholder={field.placeholder}
          value={value ?? ''} readOnly={readOnly}
          onChange={e => onChange(e.target.value)} />

      case 'textarea':
        return <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }}
          placeholder={field.placeholder} value={value ?? ''} readOnly={readOnly}
          onChange={e => onChange(e.target.value)} />

      case 'number':
        return <input style={input} type="number" placeholder={field.placeholder}
          value={value ?? ''} readOnly={readOnly}
          onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />

      case 'date':
        return <input style={input} type="date" value={value ?? ''} readOnly={readOnly}
          onChange={e => onChange(e.target.value)} />

      case 'select':
        return (
          <select style={{ ...input, cursor: 'pointer' }} value={value ?? ''} disabled={readOnly}
            onChange={e => onChange(e.target.value)}>
            <option value="">{field.placeholder ?? '-- Chọn --'}</option>
            {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        )

      case 'radio':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            {(field.options ?? []).map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, cursor: readOnly ? 'default' : 'pointer' }}>
                <input type="radio" name={field.key} value={opt}
                  checked={value === opt} readOnly={readOnly}
                  onChange={() => !readOnly && onChange(opt)} />
                {opt}
              </label>
            ))}
          </div>
        )

      case 'checkbox': {
        const checked: string[] = Array.isArray(value) ? value : []
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            {(field.options ?? []).map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, cursor: readOnly ? 'default' : 'pointer' }}>
                <input type="checkbox" checked={checked.includes(opt)} disabled={readOnly}
                  onChange={e => {
                    if (readOnly) return
                    onChange(e.target.checked
                      ? [...checked, opt]
                      : checked.filter(v => v !== opt))
                  }} />
                {opt}
              </label>
            ))}
          </div>
        )
      }

      case 'table': {
        const cols = field.columns ?? []
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c.key} style={{
                      padding: '6px 10px', background: colors.bgSecondary,
                      borderBottom: `1.5px solid ${colors.border}`,
                      textAlign: 'left', fontWeight: 500, fontSize: 12,
                      color: colors.textSecondary, whiteSpace: 'nowrap',
                    }}>{c.label}</th>
                  ))}
                  {!readOnly && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `0.5px solid ${colors.borderLight}` }}>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '4px 6px' }}>
                        {c.type === 'select' ? (
                          <select style={{ ...input, padding: '5px 8px' }}
                            value={row[c.key] ?? ''} disabled={readOnly}
                            onChange={e => {
                              const r = [...tableRows]; r[ri] = { ...r[ri], [c.key]: e.target.value }
                              updateTable(r)
                            }}>
                            <option value="">—</option>
                            {(c.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input style={{ ...input, padding: '5px 8px' }}
                            type={c.type === 'number' ? 'number' : 'text'}
                            value={row[c.key] ?? ''} readOnly={readOnly}
                            onChange={e => {
                              const r = [...tableRows]; r[ri] = { ...r[ri], [c.key]: e.target.value }
                              updateTable(r)
                            }} />
                        )}
                      </td>
                    ))}
                    {!readOnly && (
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button onClick={() => updateTable(tableRows.filter((_, i) => i !== ri))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: colors.danger, fontSize: 14 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <button onClick={() => updateTable([...tableRows, {}])}
                style={{ marginTop: 8, fontSize: 12, color: colors.primary,
                  background: 'none', border: `0.5px dashed ${colors.primary}`,
                  borderRadius: 6, padding: '5px 14px', cursor: 'pointer', width: '100%' }}>
                <i className="ti ti-plus" style={{ marginRight: 4 }} />Thêm hàng
              </button>
            )}
          </div>
        )
      }

      case 'image': {
        const files: string[] = Array.isArray(value) ? value : []
        return (
          <div>
            <input ref={fileRef} type="file" accept={field.accept ?? 'image/*'}
              multiple={field.multiple} style={{ display: 'none' }}
              onChange={e => {
                const newFiles = Array.from(e.target.files ?? []).map(f => URL.createObjectURL(f))
                onChange(field.multiple ? [...files, ...newFiles] : newFiles.slice(0, 1))
              }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {files.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={src} alt="" style={{ width: 80, height: 80, objectFit: 'cover',
                    borderRadius: 8, border: `0.5px solid ${colors.border}` }} />
                  {!readOnly && (
                    <button onClick={() => onChange(files.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -6, right: -6,
                        background: colors.danger, color: '#fff', border: 'none',
                        borderRadius: '50%', width: 18, height: 18, cursor: 'pointer',
                        fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button onClick={() => fileRef.current?.click()}
                  style={{ width: 80, height: 80, borderRadius: 8, cursor: 'pointer',
                    border: `1.5px dashed ${colors.border}`, background: colors.bgSecondary,
                    color: colors.textTertiary, fontSize: 22, display: 'flex',
                    alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ti ti-plus" />
                </button>
              )}
            </div>
          </div>
        )
      }

      default: return null
    }
  })()

  return (
    <div style={{
      gridColumn: field.width === 'half' ? 'span 1' : '1 / -1',
    }}>
      {label}
      {content}
      {help}
    </div>
  )
}

// ── Main FormRenderer ─────────────────────────────────────────
export function FormRenderer({ template, data = {}, onChange, readOnly }: {
  template:  FormTemplate
  data?:     FormData
  onChange?: (data: FormData) => void
  readOnly?: boolean
}) {
  const handleChange = (key: string, val: any) => {
    onChange?.({ ...data, [key]: val })
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: 16,
    }}>
      {template.fields.map(field => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={data[field.key]}
          onChange={val => handleChange(field.key, val)}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}
