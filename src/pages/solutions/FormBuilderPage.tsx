// src/pages/solutions/FormBuilderPage.tsx
// Drag & Drop Form Builder cho Trưởng phòng KT
import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSolutions, useFormTemplate } from '../../hooks'
import { useNotification, useConfirm, Button, LoadingSpinner } from '../../components/ui'
import { FormTemplateService } from '../../services'
import { PageTransition } from '../../components/PageTransition'
import { FormRenderer } from '../../components/FormRenderer'
import { colors } from '../../styles/theme'
import {
  FIELD_PALETTE, newField,
  type FormField, type FormTemplate, type FieldType,
} from '../../types/form'

// ── Field type display config ─────────────────────────────────
const cfg = (f: FormField) => FIELD_PALETTE.find(p => p.type === f.type)!

// ── Properties Panel ──────────────────────────────────────────
function PropertiesPanel({ field, onChange, onClose }: {
  field:    FormField
  onChange: (f: FormField) => void
  onClose:  () => void
}) {
  const s: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    borderRadius: 8, border: `0.5px solid ${colors.border}`,
    background: colors.bgPrimary, color: colors.textPrimary,
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const set = (patch: Partial<FormField>) => onChange({ ...field, ...patch })

  return (
    <div style={{
      width: 280, borderLeft: `0.5px solid ${colors.border}`,
      background: colors.bgPrimary, display: 'flex', flexDirection: 'column',
      height: '100%', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `0.5px solid ${colors.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: cfg(field).color + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`ti ${cfg(field).icon}`}
              style={{ fontSize: 14, color: cfg(field).color }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
            {cfg(field).label}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: colors.textTertiary, fontSize: 18, lineHeight: 1,
        }}>×</button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14,
        display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Label */}
        <div>
          <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
            Nhãn field *
          </label>
          <input style={s} value={field.label}
            onChange={e => set({ label: e.target.value })} />
        </div>

        {/* Key */}
        {field.type !== 'section' && (
          <div>
            <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
              Key (dùng lưu dữ liệu)
            </label>
            <input style={{ ...s, fontFamily: 'monospace', fontSize: 12 }}
              value={field.key}
              onChange={e => set({ key: e.target.value.replace(/\s/g, '_') })} />
          </div>
        )}

        {/* Placeholder */}
        {['text','textarea','number','select'].includes(field.type) && (
          <div>
            <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
              Placeholder
            </label>
            <input style={s} value={field.placeholder ?? ''}
              onChange={e => set({ placeholder: e.target.value })} />
          </div>
        )}

        {/* Help text */}
        <div>
          <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
            Ghi chú hướng dẫn
          </label>
          <textarea style={{ ...s, minHeight: 60, resize: 'vertical' }}
            value={field.helpText ?? ''}
            onChange={e => set({ helpText: e.target.value })} />
        </div>

        {/* Width */}
        {field.type !== 'section' && (
          <div>
            <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              Chiều rộng
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['full','half'] as const).map(w => (
                <button key={w} onClick={() => set({ width: w })}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 12, borderRadius: 8,
                    border: `1.5px solid ${field.width === w ? colors.primary : colors.border}`,
                    background: field.width === w ? colors.primaryLight : colors.bgPrimary,
                    color: field.width === w ? colors.primary : colors.textSecondary,
                    cursor: 'pointer', fontWeight: field.width === w ? 600 : 400,
                  }}>
                  {w === 'full' ? '⬛ Toàn bộ' : '▪▪ Nửa'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Required */}
        {field.type !== 'section' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={field.required}
              onChange={e => set({ required: e.target.checked })} />
            Bắt buộc nhập
          </label>
        )}

        {/* Options (select / radio / checkbox) */}
        {['select','radio','checkbox'].includes(field.type) && (
          <div>
            <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              Các lựa chọn
            </label>
            {(field.options ?? []).map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input style={{ ...s, flex: 1 }} value={opt}
                  onChange={e => {
                    const opts = [...(field.options ?? [])]
                    opts[i] = e.target.value
                    set({ options: opts })
                  }} />
                <button onClick={() => set({ options: (field.options ?? []).filter((_,j) => j !== i) })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: colors.danger, fontSize: 16 }}>×</button>
              </div>
            ))}
            <button onClick={() => set({ options: [...(field.options ?? []), `Lựa chọn ${(field.options?.length ?? 0) + 1}`] })}
              style={{ fontSize: 12, color: colors.primary, background: 'none',
                border: `0.5px dashed ${colors.primary}`, borderRadius: 6,
                padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
              + Thêm lựa chọn
            </button>
          </div>
        )}

        {/* Table columns */}
        {field.type === 'table' && (
          <div>
            <label style={{ fontSize: 12, color: colors.textSecondary, display: 'block', marginBottom: 6 }}>
              Cột trong bảng
            </label>
            {(field.columns ?? []).map((col, i) => (
              <div key={i} style={{
                background: colors.bgSecondary, borderRadius: 8,
                padding: 10, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: colors.textTertiary }}>Cột {i + 1}</span>
                  <button onClick={() => set({ columns: (field.columns ?? []).filter((_,j) => j !== i) })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: colors.danger, fontSize: 14 }}>×</button>
                </div>
                <input style={{ ...s, marginBottom: 6 }} placeholder="Tên cột"
                  value={col.label}
                  onChange={e => {
                    const cols = [...(field.columns ?? [])]
                    cols[i] = { ...cols[i], label: e.target.value }
                    set({ columns: cols })
                  }} />
                <select style={{ ...s, cursor: 'pointer' }} value={col.type}
                  onChange={e => {
                    const cols = [...(field.columns ?? [])]
                    cols[i] = { ...cols[i], type: e.target.value as any }
                    set({ columns: cols })
                  }}>
                  <option value="text">Văn bản</option>
                  <option value="number">Số</option>
                  <option value="select">Dropdown</option>
                </select>
              </div>
            ))}
            <button onClick={() => set({
              columns: [...(field.columns ?? []),
                { key: `col${Date.now()}`, label: `Cột ${(field.columns?.length ?? 0) + 1}`, type: 'text' }]
            })}
              style={{ fontSize: 12, color: colors.primary, background: 'none',
                border: `0.5px dashed ${colors.primary}`, borderRadius: 6,
                padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
              + Thêm cột
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Canvas Field Card ─────────────────────────────────────────
function FieldCard({ field, selected, isDragOver, onSelect, onDelete, onDragStart, onDragOver, onDrop }: {
  field:      FormField
  selected:   boolean
  isDragOver: boolean
  onSelect:   () => void
  onDelete:   () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver:  (e: React.DragEvent) => void
  onDrop:      (e: React.DragEvent) => void
}) {
  const c = cfg(field)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      style={{
        gridColumn: field.width === 'half' ? 'span 1' : '1 / -1',
        border: `1.5px solid ${selected ? colors.primary : isDragOver ? colors.secondary : colors.border}`,
        borderRadius: 10,
        background: selected ? colors.primaryLight : colors.bgPrimary,
        padding: '10px 14px',
        cursor: 'grab',
        transition: 'all .12s',
        position: 'relative',
        borderStyle: isDragOver ? 'dashed' : 'solid',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <i className="ti ti-grip-vertical"
          style={{ color: colors.textTertiary, fontSize: 14, cursor: 'grab' }} />
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: c.color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`ti ${c.icon}`} style={{ fontSize: 12, color: c.color }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary, flex: 1 }}>
          {field.label}
          {field.required && <span style={{ color: colors.danger, marginLeft: 3 }}>*</span>}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 9999,
          background: c.color + '18', color: c.color, fontWeight: 500,
        }}>{c.label}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: colors.textTertiary, fontSize: 15, padding: 2,
            borderRadius: 4, lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.danger)}
          onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
        >
          <i className="ti ti-trash" />
        </button>
      </div>

      {/* Mini preview */}
      <div style={{ pointerEvents: 'none' }}>
        {field.type === 'section' && (
          <div style={{ height: 2, background: colors.border, borderRadius: 2 }} />
        )}
        {(field.type === 'text' || field.type === 'number' || field.type === 'date') && (
          <div style={{
            height: 28, borderRadius: 6, background: colors.bgSecondary,
            border: `0.5px solid ${colors.border}`,
          }} />
        )}
        {field.type === 'textarea' && (
          <div style={{
            height: 52, borderRadius: 6, background: colors.bgSecondary,
            border: `0.5px solid ${colors.border}`,
          }} />
        )}
        {(field.type === 'select') && (
          <div style={{
            height: 28, borderRadius: 6, background: colors.bgSecondary,
            border: `0.5px solid ${colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
          }}>
            <i className="ti ti-chevron-down" style={{ fontSize: 12, color: colors.textTertiary }} />
          </div>
        )}
        {(field.type === 'radio' || field.type === 'checkbox') && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(field.options ?? []).slice(0, 3).map((opt, i) => (
              <div key={i} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                background: colors.bgSecondary, border: `0.5px solid ${colors.border}`,
                color: colors.textTertiary,
              }}>{opt}</div>
            ))}
            {(field.options?.length ?? 0) > 3 && (
              <div style={{ fontSize: 11, color: colors.textTertiary }}>
                +{(field.options?.length ?? 0) - 3}
              </div>
            )}
          </div>
        )}
        {field.type === 'table' && (
          <div style={{ fontSize: 11, color: colors.textTertiary }}>
            {(field.columns ?? []).map(c => c.label).join(' · ')}
          </div>
        )}
        {field.type === 'image' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 36, height: 36, borderRadius: 6,
                background: colors.bgSecondary, border: `0.5px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="ti ti-photo" style={{ fontSize: 14, color: colors.textTertiary }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main FormBuilderPage ──────────────────────────────────────
export default function FormBuilderPage() {
  const { solutionId } = useParams<{ solutionId: string }>()
  const navigate = useNavigate()
  const notify   = useNotification()
  const { confirm, ConfirmNode } = useConfirm()
  const { data: solutions } = useSolutions()

  const solution = solutions.find(s => s.id === Number(solutionId))

  // Template state
  const { data: templates, loading: tLoading } = useFormTemplate(Number(solutionId))
  const existingTemplate = templates?.[0] ?? null

  const [templateName, setTemplateName] = useState('Form khảo sát')
  const [fields,   setFields]   = useState<FormField[]>([])
  const [selected, setSelected] = useState<string | null>(null)  // selected field id
  const [preview,  setPreview]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [templateId, setTemplateId] = useState<number | null>(null)

  // Load existing template
  useEffect(() => {
    if (existingTemplate) {
      setTemplateId(existingTemplate.id!)
      setTemplateName(existingTemplate.name)
      setFields(existingTemplate.fields as FormField[])
    }
  }, [existingTemplate])

  // Drag state
  const dragSource = useRef<{ type: 'palette'; fieldType: FieldType } | { type: 'canvas'; fieldId: string; index: number } | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const selectedField = fields.find(f => f.id === selected) ?? null

  // ── Drag from palette ────────────────────────────────────────
  const onPaletteDragStart = (fieldType: FieldType) => (e: React.DragEvent) => {
    dragSource.current = { type: 'palette', fieldType }
    e.dataTransfer.effectAllowed = 'copy'
  }

  // ── Drag from canvas ─────────────────────────────────────────
  const onCanvasDragStart = (fieldId: string, index: number) => (e: React.DragEvent) => {
    dragSource.current = { type: 'canvas', fieldId, index }
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }

  const onFieldDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverIndex(index)
  }

  const onFieldDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragOverIndex(null)
    const src = dragSource.current
    if (!src) return

    if (src.type === 'palette') {
      const f = newField(src.fieldType)
      setFields(prev => {
        const next = [...prev]; next.splice(targetIndex, 0, f); return next
      })
      setSelected(f.id)
    } else {
      // Reorder
      setFields(prev => {
        const next = [...prev]
        const [moved] = next.splice(src.index, 1)
        const insertAt = targetIndex > src.index ? targetIndex - 1 : targetIndex
        next.splice(insertAt, 0, moved)
        return next
      })
    }
    dragSource.current = null
  }

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverIndex(null)
    const src = dragSource.current
    if (!src) return
    if (src.type === 'palette') {
      const f = newField(src.fieldType)
      setFields(prev => [...prev, f])
      setSelected(f.id)
    }
    dragSource.current = null
  }

  const deleteField = useCallback((id: string) => {
    setFields(prev => prev.filter(f => f.id !== id))
    if (selected === id) setSelected(null)
  }, [selected])

  const updateField = useCallback((updated: FormField) => {
    setFields(prev => prev.map(f => f.id === updated.id ? updated : f))
  }, [])

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!templateName.trim()) { notify.error('Nhập tên form'); return }
    setSaving(true)
    try {
      const payload = {
        solution_id: Number(solutionId),
        name:        templateName,
        schema:      fields,
        is_active:   true,
      }
      if (templateId) {
        await FormTemplateService.update(templateId, payload)
        notify.success('Đã lưu form template')
      } else {
        const res: any = await FormTemplateService.create(payload)
        setTemplateId(res?.id ?? null)
        notify.success('Tạo form template thành công')
      }
    } catch (err: any) {
      notify.error(err.message || 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (tLoading) return <LoadingSpinner label="Đang tải form..." />

  return (
    <PageTransition>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <button onClick={() => navigate('/lead-solutions')}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: colors.textSecondary, fontSize: 13, display: 'flex',
              alignItems: 'center', gap: 4 }}>
            <i className="ti ti-arrow-left" />Giải pháp
          </button>
          <i className="ti ti-chevron-right" style={{ fontSize: 12, color: colors.textTertiary }} />
          <span style={{ fontSize: 13, color: colors.textPrimary, fontWeight: 500 }}>
            {solution?.name ?? `Giải pháp #${solutionId}`}
          </span>

          {/* Form name */}
          <input
            style={{
              flex: 1, minWidth: 180, padding: '7px 12px', fontSize: 13,
              borderRadius: 8, border: `0.5px solid ${colors.border}`,
              background: colors.bgSecondary, color: colors.textPrimary,
              fontWeight: 500,
            }}
            placeholder="Tên form..."
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
          />

          <Button variant={preview ? 'primary' : 'secondary'}
            icon={preview ? 'ti-edit' : 'ti-eye'}
            onClick={() => setPreview(p => !p)}>
            {preview ? 'Thiết kế' : 'Preview'}
          </Button>
          <Button variant="primary" icon="ti-device-floppy" loading={saving} onClick={handleSave}>
            Lưu form
          </Button>
        </div>

        {/* ── Main area ── */}
        <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0,
          border: `0.5px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>

          {/* Left: Palette (hidden in preview) */}
          {!preview && (
            <div style={{
              width: 160, borderRight: `0.5px solid ${colors.border}`,
              background: colors.bgSecondary, padding: 12, flexShrink: 0,
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: colors.textTertiary,
                marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Loại field
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {FIELD_PALETTE.map(p => (
                  <div
                    key={p.type}
                    draggable
                    onDragStart={onPaletteDragStart(p.type)}
                    onClick={() => {
                      const f = newField(p.type)
                      setFields(prev => [...prev, f])
                      setSelected(f.id)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8,
                      background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
                      cursor: 'grab', transition: 'all .1s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = p.color
                      e.currentTarget.style.background = p.color + '10'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = colors.border
                      e.currentTarget.style.background = colors.bgPrimary
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      background: p.color + '20',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className={`ti ${p.icon}`} style={{ fontSize: 13, color: p.color }} />
                    </div>
                    <span style={{ fontSize: 12, color: colors.textPrimary }}>{p.label}</span>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 14, fontSize: 11, color: colors.textTertiary,
                textAlign: 'center', lineHeight: 1.5,
              }}>
                Kéo thả vào canvas hoặc click để thêm
              </div>
            </div>
          )}

          {/* Center: Canvas or Preview */}
          <div style={{ flex: 1, overflowY: 'auto', background: colors.bgSecondary }}>
            {preview ? (
              <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
                <div style={{
                  background: colors.bgPrimary, borderRadius: 12,
                  padding: 24, border: `0.5px solid ${colors.border}`,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary,
                    marginBottom: 20, paddingBottom: 12,
                    borderBottom: `1.5px solid ${colors.border}` }}>
                    {templateName}
                  </div>
                  {fields.length === 0 ? (
                    <div style={{ textAlign: 'center', color: colors.textTertiary,
                      fontSize: 13, padding: '40px 0' }}>
                      Chưa có field nào
                    </div>
                  ) : (
                    <FormRenderer
                      template={{ solution_id: Number(solutionId), name: templateName,
                        fields, version: 1, is_active: true }}
                      readOnly={false}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{ padding: 20, minHeight: '100%' }}
                onDragOver={e => e.preventDefault()}
                onDrop={onCanvasDrop}
              >
                {fields.length === 0 ? (
                  <div style={{
                    minHeight: 300, border: `2px dashed ${colors.border}`,
                    borderRadius: 12, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 10,
                    color: colors.textTertiary,
                  }}>
                    <i className="ti ti-drag-drop" style={{ fontSize: 36, opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Kéo field vào đây</div>
                    <div style={{ fontSize: 12 }}>hoặc click vào loại field bên trái</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {fields.map((field, i) => (
                      <FieldCard
                        key={field.id}
                        field={field}
                        selected={selected === field.id}
                        isDragOver={dragOverIndex === i}
                        onSelect={() => setSelected(field.id === selected ? null : field.id)}
                        onDelete={() => deleteField(field.id)}
                        onDragStart={onCanvasDragStart(field.id, i)}
                        onDragOver={onFieldDragOver(i)}
                        onDrop={onFieldDrop(i)}
                      />
                    ))}

                    {/* Drop zone at end */}
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        height: 40, borderRadius: 8,
                        border: `1.5px dashed ${dragOverIndex === fields.length ? colors.primary : colors.border}`,
                        background: dragOverIndex === fields.length ? colors.primaryLight : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: colors.textTertiary, fontSize: 12, transition: 'all .1s',
                      }}
                      onDragOver={onFieldDragOver(fields.length)}
                      onDrop={onFieldDrop(fields.length)}
                    >
                      <i className="ti ti-plus" style={{ marginRight: 4 }} />
                      Thêm vào cuối
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Properties Panel */}
          {!preview && selectedField && (
            <PropertiesPanel
              field={selectedField}
              onChange={updateField}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>
      {ConfirmNode}
    </PageTransition>
  )
}
