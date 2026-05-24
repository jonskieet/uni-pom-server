// src/types/form.ts — Custom Form Builder Types

export type FieldType =
  | 'text' | 'textarea' | 'number'
  | 'select' | 'checkbox' | 'radio'
  | 'date' | 'table' | 'image' | 'section'

export interface TableColumn {
  key:      string
  label:    string
  type:     'text' | 'number' | 'select'
  options?: string[]
  width?:   number   // flex ratio
}

export interface FormField {
  id:          string
  type:        FieldType
  label:       string
  key:         string
  required:    boolean
  width:       'full' | 'half'
  placeholder?: string
  helpText?:    string
  options?:    string[]      // select / checkbox / radio
  columns?:    TableColumn[] // table
  accept?:     string        // image: 'image/*'
  multiple?:   boolean       // image / checkbox
  minRows?:    number        // table default rows
}

export interface FormTemplate {
  id?:          number
  solution_id:  number
  name:         string
  description?: string
  fields:       FormField[]
  version:      number
  is_active:    boolean
  created_by?:  number
  created_at?:  string
  updated_at?:  string
}

// Runtime form data — key = field.key, value = any
export type FormData = Record<string, any>

// Field palette config (used in builder UI)
export const FIELD_PALETTE: { type: FieldType; label: string; icon: string; color: string }[] = [
  { type: 'text',     label: 'Văn bản',    icon: 'ti-forms',          color: '#6366f1' },
  { type: 'textarea', label: 'Đoạn văn',   icon: 'ti-align-left',     color: '#8b5cf6' },
  { type: 'number',   label: 'Số',         icon: 'ti-123',            color: '#0ea5e9' },
  { type: 'select',   label: 'Dropdown',   icon: 'ti-selector',       color: '#10b981' },
  { type: 'radio',    label: 'Chọn một',   icon: 'ti-circle-dot',     color: '#f59e0b' },
  { type: 'checkbox', label: 'Chọn nhiều', icon: 'ti-checkbox',       color: '#f97316' },
  { type: 'date',     label: 'Ngày tháng', icon: 'ti-calendar',       color: '#ec4899' },
  { type: 'table',    label: 'Bảng',       icon: 'ti-table',          color: '#14b8a6' },
  { type: 'image',    label: 'Hình ảnh',   icon: 'ti-photo',          color: '#a855f7' },
  { type: 'section',  label: 'Tiêu đề',    icon: 'ti-separator',      color: '#64748b' },
]

export function newField(type: FieldType): FormField {
  const base: FormField = {
    id:       `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label:    FIELD_PALETTE.find(p => p.type === type)?.label ?? type,
    key:      `field_${Date.now()}`,
    required: false,
    width:    'full',
  }
  if (type === 'select' || type === 'radio' || type === 'checkbox')
    base.options = ['Lựa chọn 1', 'Lựa chọn 2']
  if (type === 'table')
    base.columns = [
      { key: 'col1', label: 'Cột 1', type: 'text' },
      { key: 'col2', label: 'Cột 2', type: 'text' },
    ]
  if (type === 'image') {
    base.accept   = 'image/*'
    base.multiple = true
  }
  return base
}
