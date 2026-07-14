// src/types/form.ts

export type FieldType =
  | 'text' | 'textarea' | 'number'
  | 'select' | 'checkbox' | 'radio'
  | 'date' | 'table' | 'image' | 'section'

// 12-column grid: 25=span3, 33=span4, 50=span6, 66=span8, 75=span9, 100=span12
export type FieldWidth = 25 | 33 | 50 | 66 | 75 | 100

export const WIDTH_SPAN: Record<FieldWidth, number> = {
  25: 3, 33: 4, 50: 6, 66: 8, 75: 9, 100: 12,
}

export const WIDTH_OPTIONS: { value: FieldWidth; label: string }[] = [
  { value: 25,  label: '1/4'  },
  { value: 33,  label: '1/3'  },
  { value: 50,  label: '1/2'  },
  { value: 66,  label: '2/3'  },
  { value: 75,  label: '3/4'  },
  { value: 100, label: 'Full' },
]

export interface TableColumn {
  key:      string
  label:    string
  type:     'text' | 'number' | 'select' | 'autoindex'
  options?: string[]
  width?:   number
}

export interface FormField {
  id:           string
  type:         FieldType
  label:        string
  key:          string
  required:     boolean
  width:        FieldWidth
  placeholder?: string
  helpText?:    string
  options?:     string[]
  columns?:     TableColumn[]
  defaultRows?: Record<string, any>[]
  accept?:      string
  multiple?:    boolean
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

export type FormData = Record<string, any>
// ── Trường cơ bản CỐ ĐỊNH ────────────────────────────────────
// Luôn hiển thị ở đầu mọi form — không thể xóa/di chuyển
// key phải khớp với SurveyReportPage.handleSave
export const BASE_FIELDS: FormField[] = [
  {
    id:          '__base_unit_name__',
    type:        'text' as const,
    label:       'Tên đơn vị khảo sát',
    key:         'unit_name',
    required:    true,
    width:       50 as const,
    placeholder: 'Nhập tên đơn vị / dự án...',
  },
  {
    id:          '__base_survey_date__',
    type:        'date' as const,
    label:       'Ngày khảo sát',
    key:         'survey_date',
    required:    true,
    width:       50 as const,
  },
  {
    id:          '__base_surveyor_name__',
    type:        'text' as const,
    label:       'Người thực hiện khảo sát',
    key:         'surveyor_name',
    required:    true,
    width:       50 as const,
    placeholder: 'Họ tên kỹ thuật viên',
  },
  {
    id:          '__base_site_address__',
    type:        'text' as const,
    label:       'Địa chỉ đơn vị',
    key:         'site_address',
    required:    false,
    width:       50 as const,
    placeholder: 'Địa chỉ cụ thể của đơn vị khảo sát',
  },
]

// Helper — kiểm tra field có phải base field không
export const isBaseField = (id: string) => id.startsWith('__base_')


export const FIELD_PALETTE: {
  type: FieldType; label: string; icon: string; color: string; desc: string
}[] = [
  { type: 'text',     label: 'Văn bản',    icon: 'ti-forms',      color: '#6366f1', desc: 'Nhập 1 dòng'   },
  { type: 'textarea', label: 'Đoạn văn',   icon: 'ti-align-left', color: '#8b5cf6', desc: 'Nhiều dòng'    },
  { type: 'number',   label: 'Số',         icon: 'ti-123',        color: '#0ea5e9', desc: 'Chỉ nhập số'   },
  { type: 'select',   label: 'Dropdown',   icon: 'ti-selector',   color: '#10b981', desc: 'Chọn 1 từ list'},
  { type: 'radio',    label: 'Chọn một',   icon: 'ti-circle-dot', color: '#f59e0b', desc: 'Radio buttons' },
  { type: 'checkbox', label: 'Chọn nhiều', icon: 'ti-checkbox',   color: '#f97316', desc: 'Checkboxes'    },
  { type: 'date',     label: 'Ngày tháng', icon: 'ti-calendar',   color: '#ec4899', desc: 'Date picker'   },
  { type: 'table',    label: 'Bảng',       icon: 'ti-table',      color: '#14b8a6', desc: 'Bảng nhiều cột'},
  { type: 'image',    label: 'Hình ảnh',   icon: 'ti-photo',      color: '#a855f7', desc: 'Upload ảnh'    },
  { type: 'section',  label: 'Tiêu đề',    icon: 'ti-separator',  color: '#64748b', desc: 'Phân nhóm'     },
]

export function newField(type: FieldType): FormField {
  const base: FormField = {
    id:       `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    type,
    label:    FIELD_PALETTE.find(p => p.type === type)?.label ?? type,
    key:      `${type}_${Date.now()}`,
    required: false,
    width:    100,
  }
  if (['select','radio','checkbox'].includes(type))
    base.options = ['Lựa chọn 1','Lựa chọn 2']
  if (type === 'table') {
    base.columns = [
      { key:'device', label:'Thiết bị',  type:'text'   },
      { key:'model',  label:'Model',     type:'text'   },
      { key:'qty',    label:'Số lượng',  type:'number' },
      { key:'note',   label:'Ghi chú',   type:'text'   },
    ]
  }
  if (type === 'image') { base.accept='image/*'; base.multiple=true }
  return base
}

export function duplicateField(f: FormField): FormField {
  return {
    ...JSON.parse(JSON.stringify(f)),
    id:  `f_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    key: `${f.key}_copy`,
  }
}
