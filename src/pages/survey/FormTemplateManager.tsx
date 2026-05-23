// ============================================================
// src/pages/survey/FormTemplateManager.tsx
// Quản lý custom form template — chỉ technical_lead & admin
// Technical Lead có thể: xem, tạo, sửa, xóa loại phiếu khảo sát
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useNotification, useLoading, Button, LoadingSpinner, EmptyState } from '../../components/ui'
import { PageTransition } from '../../components/PageTransition'
import { colors, radius, commonStyles } from '../../styles/theme'
import { FormTemplateService } from '../../services'
import type { SurveyFormTemplate, FormSection, FormFieldDef, FormColumnDef } from '../../types'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'text',     label: 'Văn bản ngắn' },
  { value: 'textarea', label: 'Văn bản dài'  },
  { value: 'number',   label: 'Số'           },
  { value: 'date',     label: 'Ngày'         },
  { value: 'select',   label: 'Chọn từ danh sách' },
]
const ICONS = [
  'ti-network', 'ti-device-tv', 'ti-camera', 'ti-presentation',
  'ti-shield', 'ti-server', 'ti-wifi', 'ti-clipboard', 'ti-file-description',
  'ti-tools', 'ti-building', 'ti-phone', 'ti-device-laptop',
]

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function makeId() { return `f${Date.now().toString(36)}` }

function emptyField(): FormFieldDef & { _id: string } {
  return { _id: makeId(), key: '', label: '', type: 'text', required: false, placeholder: '' }
}

function emptyColumn(): FormColumnDef & { _id: string } {
  return { _id: makeId(), key: '', label: '', type: 'text', width: 0, placeholder: '' }
}

function emptySection(type: 'fields' | 'table'): FormSection & { _id: string } {
  return {
    _id:      makeId(),
    key:      '',
    title:    '',
    icon:     'ti-clipboard',
    type,
    fields:   type === 'fields' ? [emptyField()] : undefined,
    columns:  type === 'table'  ? [emptyColumn()] : undefined,
    addLabel: type === 'table'  ? 'Thêm dòng' : undefined,
    defaultRows: type === 'table' ? [] : undefined,
  }
}

// ─────────────────────────────────────────────────────────────
// SHARED STYLE
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  borderRadius: radius.md, border: `1px solid ${colors.border}`,
  background: colors.bgPrimary, color: colors.textPrimary,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: colors.textSecondary,
  display: 'block', marginBottom: 4,
}
const chip = (active: boolean): React.CSSProperties => ({
  padding: '3px 10px', borderRadius: radius.full,
  fontSize: 11, fontWeight: 500, cursor: 'pointer', border: 'none',
  background: active ? colors.primary : colors.bgTertiary,
  color: active ? '#fff' : colors.textSecondary,
})

// ─────────────────────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────────────────────
function TemplateCard({
  tpl, onEdit, onDelete, onToggle,
}: {
  tpl: SurveyFormTemplate
  onEdit:   (t: SurveyFormTemplate) => void
  onDelete: (t: SurveyFormTemplate) => void
  onToggle: (t: SurveyFormTemplate) => void
}) {
  const sectionCount = tpl.sections?.length ?? 0
  const fieldCount   = tpl.sections?.reduce((s, sec) => {
    if (sec.type === 'table') return s + (sec.columns?.length ?? 0)
    return s + (sec.fields?.length ?? 0)
  }, 0) ?? 0

  return (
    <div style={{
      background: '#fff', border: `1px solid ${colors.border}`,
      borderRadius: radius.lg, padding: '16px 20px',
      display: 'flex', alignItems: 'flex-start', gap: 14,
      opacity: tpl.is_active ? 1 : 0.6,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: radius.md,
        background: tpl.is_active ? colors.primaryLight : colors.bgTertiary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <i className={`ti ${tpl.icon ?? 'ti-clipboard'}`}
          style={{ fontSize: 22, color: tpl.is_active ? colors.primary : colors.textTertiary }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{tpl.name}</span>
          <span style={{
            padding: '1px 7px', borderRadius: radius.full, fontSize: 10, fontWeight: 600,
            background: tpl.is_active ? '#EAF3DE' : colors.bgTertiary,
            color: tpl.is_active ? colors.success : colors.textTertiary,
          }}>
            {tpl.is_active ? 'Đang dùng' : 'Tắt'}
          </span>
          <span style={{
            padding: '1px 7px', borderRadius: radius.full, fontSize: 10,
            background: colors.primaryLight, color: colors.primary,
          }}>
            {tpl.survey_type}
          </span>
        </div>
        {tpl.description && (
          <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 6px' }}>{tpl.description}</p>
        )}
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: colors.textTertiary }}>
          <span><i className="ti ti-layout-rows" style={{ marginRight: 4 }} />{sectionCount} section</span>
          <span><i className="ti ti-input-check" style={{ marginRight: 4 }} />{fieldCount} trường</span>
          {tpl.creator && <span><i className="ti ti-user" style={{ marginRight: 4 }} />{tpl.creator.full_name}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onToggle(tpl)}
          title={tpl.is_active ? 'Tắt template' : 'Bật template'}
          style={{ ...commonStyles.btnSecondary, padding: '6px 10px' }}
        >
          <i className={`ti ${tpl.is_active ? 'ti-toggle-right' : 'ti-toggle-left'}`} style={{ fontSize: 16, color: tpl.is_active ? colors.success : colors.textTertiary }} />
        </button>
        <button
          onClick={() => onEdit(tpl)}
          style={{ ...commonStyles.btnSecondary, padding: '6px 10px' }}
        >
          <i className="ti ti-edit" style={{ fontSize: 15 }} />
        </button>
        <button
          onClick={() => onDelete(tpl)}
          style={{ ...commonStyles.btnSecondary, padding: '6px 10px', color: colors.danger }}
        >
          <i className="ti ti-trash" style={{ fontSize: 15 }} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SECTION EDITOR
// ─────────────────────────────────────────────────────────────
function SectionEditor({
  section, idx, total,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  section:    FormSection & { _id?: string }
  idx:        number
  total:      number
  onChange:   (s: FormSection & { _id?: string }) => void
  onRemove:   () => void
  onMoveUp:   () => void
  onMoveDown: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  function updateField(fi: number, key: string, val: any) {
    const fields = [...(section.fields ?? [])]
    fields[fi] = { ...fields[fi], [key]: val }
    onChange({ ...section, fields })
  }

  function addField() {
    onChange({ ...section, fields: [...(section.fields ?? []), emptyField()] })
  }

  function removeField(fi: number) {
    onChange({ ...section, fields: (section.fields ?? []).filter((_, i) => i !== fi) })
  }

  function updateColumn(ci: number, key: string, val: any) {
    const columns = [...(section.columns ?? [])]
    columns[ci] = { ...columns[ci], [key]: val }
    onChange({ ...section, columns })
  }

  function addColumn() {
    onChange({ ...section, columns: [...(section.columns ?? []), emptyColumn()] })
  }

  function removeColumn(ci: number) {
    onChange({ ...section, columns: (section.columns ?? []).filter((_, i) => i !== ci) })
  }

  return (
    <div style={{
      border: `1px solid ${colors.border}`, borderRadius: radius.lg,
      background: '#fff', marginBottom: 12, overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', background: colors.bgSecondary,
        borderBottom: collapsed ? 'none' : `1px solid ${colors.border}`,
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: radius.sm, background: colors.primaryLight,
          color: colors.primary, fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{idx + 1}</span>

        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
          {section.title || <em style={{ color: colors.textTertiary }}>Chưa đặt tên</em>}
        </span>
        <span style={{ fontSize: 11, color: colors.textTertiary, background: colors.bgTertiary, padding: '2px 8px', borderRadius: radius.full }}>
          {section.type === 'table' ? '📊 Bảng' : '📝 Trường'}
        </span>

        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onMoveUp} disabled={idx === 0} style={{ ...commonStyles.btnSecondary, padding: '3px 7px', opacity: idx === 0 ? 0.3 : 1 }}>
            <i className="ti ti-arrow-up" style={{ fontSize: 13 }} />
          </button>
          <button onClick={onMoveDown} disabled={idx === total - 1} style={{ ...commonStyles.btnSecondary, padding: '3px 7px', opacity: idx === total - 1 ? 0.3 : 1 }}>
            <i className="ti ti-arrow-down" style={{ fontSize: 13 }} />
          </button>
          <button onClick={() => setCollapsed(c => !c)} style={{ ...commonStyles.btnSecondary, padding: '3px 7px' }}>
            <i className={`ti ${collapsed ? 'ti-chevron-down' : 'ti-chevron-up'}`} style={{ fontSize: 13 }} />
          </button>
          <button onClick={onRemove} style={{ ...commonStyles.btnSecondary, padding: '3px 7px', color: colors.danger }}>
            <i className="ti ti-trash" style={{ fontSize: 13 }} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: 16 }}>
          {/* Meta fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Key (không dấu, không khoảng trắng) *</label>
              <input value={section.key} onChange={e => onChange({ ...section, key: e.target.value.replace(/\s/g, '_') })}
                style={inp} placeholder="vd: general_info" />
            </div>
            <div>
              <label style={lbl}>Tiêu đề hiển thị *</label>
              <input value={section.title} onChange={e => onChange({ ...section, title: e.target.value })}
                style={inp} placeholder="vd: Thông tin chung" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Icon (Tabler icon class)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => onChange({ ...section, icon: ic })}
                    title={ic}
                    style={{
                      width: 30, height: 30, borderRadius: radius.sm, border: `1px solid ${colors.border}`,
                      background: section.icon === ic ? colors.primaryLight : '#fff',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <i className={`ti ${ic}`} style={{ fontSize: 16, color: section.icon === ic ? colors.primary : colors.textSecondary }} />
                  </button>
                ))}
              </div>
              <input value={section.icon ?? ''} onChange={e => onChange({ ...section, icon: e.target.value })}
                style={{ ...inp, fontSize: 11 }} placeholder="ti-clipboard" />
            </div>

            {section.type === 'table' && (
              <div>
                <label style={lbl}>Label nút thêm dòng</label>
                <input value={section.addLabel ?? ''} onChange={e => onChange({ ...section, addLabel: e.target.value })}
                  style={inp} placeholder="Thêm dòng" />
              </div>
            )}
          </div>

          {/* Fields (for type=fields) */}
          {section.type === 'fields' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>
                Danh sách trường
              </div>
              {(section.fields ?? []).map((f: any, fi) => (
                <div key={f._id ?? fi} style={{
                  border: `1px solid ${colors.borderLight}`, borderRadius: radius.md,
                  padding: '10px 12px', marginBottom: 8, background: colors.bgSecondary,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div>
                      <label style={lbl}>Key *</label>
                      <input value={f.key} onChange={e => updateField(fi, 'key', e.target.value.replace(/\s/g, '_'))}
                        style={inp} placeholder="vd: unit_name" />
                    </div>
                    <div>
                      <label style={lbl}>Label *</label>
                      <input value={f.label} onChange={e => updateField(fi, 'label', e.target.value)}
                        style={inp} placeholder="vd: Tên đơn vị" />
                    </div>
                    <button onClick={() => removeField(fi)}
                      style={{ ...commonStyles.btnSecondary, padding: '7px 10px', color: colors.danger, flexShrink: 0, alignSelf: 'flex-end' }}>
                      <i className="ti ti-trash" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                    <div>
                      <label style={lbl}>Kiểu</label>
                      <select value={f.type} onChange={e => updateField(fi, 'type', e.target.value)} style={inp}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Placeholder</label>
                      <input value={f.placeholder ?? ''} onChange={e => updateField(fi, 'placeholder', e.target.value)}
                        style={inp} placeholder="Gợi ý nhập..." />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                      <input type="checkbox" id={`req-${f._id ?? fi}`} checked={f.required ?? false}
                        onChange={e => updateField(fi, 'required', e.target.checked)} />
                      <label htmlFor={`req-${f._id ?? fi}`} style={{ fontSize: 12, cursor: 'pointer' }}>Bắt buộc</label>
                    </div>
                  </div>
                  {f.type === 'select' && (
                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>Các lựa chọn (mỗi dòng 1 giá trị)</label>
                      <textarea
                        value={(f.options ?? []).join('\n')}
                        onChange={e => updateField(fi, 'options', e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean))}
                        style={{ ...inp, height: 60, resize: 'vertical', fontFamily: 'monospace' }}
                        placeholder={'Cái\nBộ\nLicense'}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addField} style={{ ...commonStyles.btnSecondary, fontSize: 12 }}>
                <i className="ti ti-plus" style={{ fontSize: 13 }} /> Thêm trường
              </button>
            </div>
          )}

          {/* Columns (for type=table) */}
          {section.type === 'table' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, marginBottom: 8 }}>
                Cột bảng
              </div>
              {(section.columns ?? []).map((c: any, ci) => (
                <div key={c._id ?? ci} style={{
                  border: `1px solid ${colors.borderLight}`, borderRadius: radius.md,
                  padding: '10px 12px', marginBottom: 8, background: colors.bgSecondary,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px auto', gap: 10, alignItems: 'end' }}>
                    <div>
                      <label style={lbl}>Key *</label>
                      <input value={c.key} onChange={e => updateColumn(ci, 'key', e.target.value.replace(/\s/g, '_'))}
                        style={inp} placeholder="vd: device_type" />
                    </div>
                    <div>
                      <label style={lbl}>Tiêu đề cột *</label>
                      <input value={c.label} onChange={e => updateColumn(ci, 'label', e.target.value)}
                        style={inp} placeholder="vd: Tên thiết bị" />
                    </div>
                    <div>
                      <label style={lbl}>Rộng (px, 0=tự)</label>
                      <input type="number" min={0} value={c.width ?? 0}
                        onChange={e => updateColumn(ci, 'width', Number(e.target.value))}
                        style={inp} />
                    </div>
                    <button onClick={() => removeColumn(ci)}
                      style={{ ...commonStyles.btnSecondary, padding: '7px 10px', color: colors.danger, alignSelf: 'flex-end' }}>
                      <i className="ti ti-trash" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    <div>
                      <label style={lbl}>Kiểu</label>
                      <select value={c.type} onChange={e => updateColumn(ci, 'type', e.target.value)} style={inp}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Placeholder</label>
                      <input value={c.placeholder ?? ''} onChange={e => updateColumn(ci, 'placeholder', e.target.value)}
                        style={inp} placeholder="Gợi ý..." />
                    </div>
                  </div>
                  {c.type === 'select' && (
                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>Các lựa chọn (mỗi dòng 1 giá trị)</label>
                      <textarea
                        value={(c.options ?? []).join('\n')}
                        onChange={e => updateColumn(ci, 'options', e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean))}
                        style={{ ...inp, height: 60, resize: 'vertical', fontFamily: 'monospace' }}
                        placeholder={'Cái\nBộ\nLicense'}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addColumn} style={{ ...commonStyles.btnSecondary, fontSize: 12 }}>
                <i className="ti ti-plus" style={{ fontSize: 13 }} /> Thêm cột
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE EDITOR MODAL
// ─────────────────────────────────────────────────────────────
interface EditorState {
  survey_type:  string
  name:         string
  description:  string
  icon:         string
  is_active:    boolean
  sections:     (FormSection & { _id?: string })[]
}

function cleanSections(sections: EditorState['sections']): FormSection[] {
  return sections.map(({ _id, ...sec }) => ({
    ...sec,
    fields:  sec.fields?.map(({ _id: _, ...f }: any) => f),
    columns: sec.columns?.map(({ _id: _, ...c }: any) => c),
  }))
}

function TemplateEditorModal({
  initial, onSave, onClose,
}: {
  initial?: SurveyFormTemplate | null
  onSave:  (data: any) => Promise<void>
  onClose: () => void
}) {
  const notify = useNotification()
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<EditorState>(() => {
    if (initial) {
      return {
        survey_type: initial.survey_type,
        name:        initial.name,
        description: initial.description ?? '',
        icon:        initial.icon ?? 'ti-clipboard',
        is_active:   initial.is_active,
        sections:    (initial.sections ?? []).map(s => ({
          ...s,
          _id: makeId(),
          fields:  s.fields?.map(f => ({ ...f, _id: makeId() })),
          columns: s.columns?.map(c => ({ ...c, _id: makeId() })),
        })),
      }
    }
    return {
      survey_type: '',
      name:        '',
      description: '',
      icon:        'ti-clipboard',
      is_active:   true,
      sections:    [],
    }
  })

  function addSection(type: 'fields' | 'table') {
    setState(s => ({ ...s, sections: [...s.sections, emptySection(type)] }))
  }

  function updateSection(idx: number, sec: FormSection & { _id?: string }) {
    setState(s => ({ ...s, sections: s.sections.map((x, i) => i === idx ? sec : x) }))
  }

  function removeSection(idx: number) {
    setState(s => ({ ...s, sections: s.sections.filter((_, i) => i !== idx) }))
  }

  function moveSection(idx: number, dir: -1 | 1) {
    setState(s => {
      const secs = [...s.sections]
      const target = idx + dir
      if (target < 0 || target >= secs.length) return s
      ;[secs[idx], secs[target]] = [secs[target], secs[idx]]
      return { ...s, sections: secs }
    })
  }

  async function handleSave() {
    if (!state.survey_type.trim()) { notify.error('Nhập mã loại khảo sát (vd: LAN, CCTV)'); return }
    if (!state.name.trim())         { notify.error('Nhập tên hiển thị'); return }
    if (state.sections.length === 0) { notify.error('Phải có ít nhất 1 section'); return }

    const badSection = state.sections.find(s => !s.key.trim() || !s.title.trim())
    if (badSection) { notify.error(`Section "${badSection.title || badSection.key || 'chưa đặt tên'}" thiếu key hoặc tiêu đề`); return }

    setSaving(true)
    try {
      await onSave({
        survey_type: state.survey_type.trim().toUpperCase(),
        name:        state.name.trim(),
        description: state.description.trim() || null,
        icon:        state.icon,
        is_active:   state.is_active,
        sections:    cleanSections(state.sections),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={commonStyles.overlay}>
      <div style={{
        background: '#fff', borderRadius: radius.xl,
        width: '90vw', maxWidth: 820, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
              {initial ? 'Chỉnh sửa template' : 'Tạo template mới'}
            </div>
            <div style={{ fontSize: 12, color: colors.textSecondary }}>Thiết kế cấu trúc form khảo sát</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: colors.textSecondary }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Meta */}
          <div style={{
            background: colors.bgSecondary, borderRadius: radius.lg,
            padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Thông tin loại khảo sát
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Mã loại *</label>
                <input
                  value={state.survey_type}
                  onChange={e => setState(s => ({ ...s, survey_type: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() }))}
                  disabled={!!initial}
                  style={{ ...inp, opacity: initial ? 0.6 : 1, fontFamily: 'monospace', fontWeight: 600 }}
                  placeholder="LAN"
                />
              </div>
              <div>
                <label style={lbl}>Tên hiển thị *</label>
                <input value={state.name} onChange={e => setState(s => ({ ...s, name: e.target.value }))}
                  style={inp} placeholder="Mạng LAN" />
              </div>
              <div>
                <label style={lbl}>Icon</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {ICONS.map(ic => (
                    <button key={ic} onClick={() => setState(s => ({ ...s, icon: ic }))} title={ic}
                      style={{
                        width: 28, height: 28, borderRadius: radius.sm, border: `1px solid ${colors.border}`,
                        background: state.icon === ic ? colors.primaryLight : '#fff',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <i className={`ti ${ic}`} style={{ fontSize: 15, color: state.icon === ic ? colors.primary : colors.textSecondary }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <label style={lbl}>Mô tả</label>
                <input value={state.description} onChange={e => setState(s => ({ ...s, description: e.target.value }))}
                  style={inp} placeholder="Mô tả ngắn về loại khảo sát này..." />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="tpl-active" checked={state.is_active}
                  onChange={e => setState(s => ({ ...s, is_active: e.target.checked }))} />
                <label htmlFor="tpl-active" style={{ fontSize: 13, cursor: 'pointer' }}>Đang kích hoạt</label>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Cấu trúc form ({state.sections.length} section)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => addSection('fields')} style={{ ...commonStyles.btnSecondary, fontSize: 12 }}>
                <i className="ti ti-plus" style={{ fontSize: 13 }} /> Thêm nhóm trường
              </button>
              <button onClick={() => addSection('table')} style={{ ...commonStyles.btnSecondary, fontSize: 12 }}>
                <i className="ti ti-table-plus" style={{ fontSize: 13 }} /> Thêm bảng
              </button>
            </div>
          </div>

          {state.sections.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: colors.textTertiary, fontSize: 13 }}>
              <i className="ti ti-layout-rows" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
              Chưa có section — hãy thêm nhóm trường hoặc bảng
            </div>
          )}

          {state.sections.map((sec, idx) => (
            <SectionEditor
              key={sec._id ?? idx}
              section={sec}
              idx={idx}
              total={state.sections.length}
              onChange={s => updateSection(idx, s)}
              onRemove={() => removeSection(idx)}
              onMoveUp={() => moveSection(idx, -1)}
              onMoveDown={() => moveSection(idx, 1)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${colors.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
        }}>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" icon="ti-device-floppy" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu template'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function FormTemplateManager() {
  const notify = useNotification()
  const { withLoading } = useLoading()

  const [templates, setTemplates] = useState<SurveyFormTemplate[]>([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState<SurveyFormTemplate | null | 'new'>('closed' as any)
  const [showEditor, setShowEditor] = useState(false)
  const [seeding, setSeeding]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await FormTemplateService.getAll()
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSeed() {
    setSeeding(true)
    try {
      await FormTemplateService.seed()
      notify.success('Đã tạo template LAN mặc định')
      load()
    } catch (e: any) {
      notify.error(e.message)
    } finally {
      setSeeding(false)
    }
  }

  async function handleSave(data: any) {
    try {
      if (editing && typeof editing === 'object') {
        await FormTemplateService.update(editing.id, data)
        notify.success('Cập nhật template thành công')
      } else {
        await FormTemplateService.create(data)
        notify.success('Tạo template thành công')
      }
      setShowEditor(false)
      setEditing(null)
      load()
    } catch (e: any) {
      notify.error(e.message)
      throw e
    }
  }

  async function handleToggle(tpl: SurveyFormTemplate) {
    try {
      await withLoading(
        () => FormTemplateService.update(tpl.id, { is_active: !tpl.is_active }),
        tpl.is_active ? 'Đang tắt template...' : 'Đang bật template...'
      )
      notify.success(tpl.is_active ? 'Đã tắt template' : 'Đã bật template')
      load()
    } catch (e: any) {
      notify.error(e.message)
    }
  }

  async function handleDelete(tpl: SurveyFormTemplate) {
    if (!confirm(`Xóa template "${tpl.name}"? Hành động này không thể hoàn tác.`)) return
    try {
      await withLoading(() => FormTemplateService.delete(tpl.id), 'Đang xóa...')
      notify.success('Đã xóa template')
      load()
    } catch (e: any) {
      notify.error(e.message)
    }
  }

  return (
    <PageTransition>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
              Quản lý mẫu phiếu khảo sát
            </h2>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: '2px 0 0' }}>
              Thiết kế form tùy chỉnh cho từng loại khảo sát — kỹ thuật viên sẽ điền theo mẫu này
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {templates.length === 0 && !loading && (
              <Button variant="secondary" icon="ti-download" onClick={handleSeed} disabled={seeding}>
                {seeding ? 'Đang tạo...' : 'Tạo mẫu LAN mặc định'}
              </Button>
            )}
            <Button variant="primary" icon="ti-plus" onClick={() => { setEditing(null); setShowEditor(true) }}>
              Tạo loại mới
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          background: colors.infoLight, border: `1px solid #bfdbfe`,
          borderRadius: radius.md, padding: '10px 14px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12,
        }}>
          <i className="ti ti-info-circle" style={{ color: colors.info, fontSize: 16, flexShrink: 0, marginTop: 1 }} />
          <div style={{ color: '#1e40af' }}>
            <b>Hướng dẫn:</b> Mỗi template ứng với một loại khảo sát (Mạng LAN, Camera CCTV...). 
            Kỹ thuật viên khi tạo phiếu sẽ điền theo đúng mẫu bạn thiết kế ở đây.
            Template đang tắt sẽ không hiển thị khi tạo phiếu mới.
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <LoadingSpinner />
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon="ti-template"
            title="Chưa có template nào"
            description="Tạo template để kỹ thuật viên có thể điền phiếu khảo sát theo đúng mẫu"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(tpl => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                onEdit={t => { setEditing(t); setShowEditor(true) }}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {/* Editor Modal */}
        {showEditor && (
          <TemplateEditorModal
            initial={editing && typeof editing === 'object' ? editing : null}
            onSave={handleSave}
            onClose={() => { setShowEditor(false); setEditing(null) }}
          />
        )}
      </div>
    </PageTransition>
  )
}
