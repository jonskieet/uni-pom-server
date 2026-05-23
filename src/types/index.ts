// ============================================================
// src/types/index.ts — Toàn bộ interface dùng chung
// ============================================================

export type Role          = 'admin' | 'sales' | 'technical' | 'technical_lead'
export type ProductStatus = 'active' | 'discontinued' | 'draft'
export type PomStatus     = 'draft' | 'submitted' | 'reviewed' | 'exported'

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  is_active: number
  created_at: string
}

export interface Brand {
  id: number
  name: string
  short_name?: string
  country?: string
  website?: string
  is_active: number
  created_at: string
}

export interface Category {
  id: number
  name: string
  description?: string
  created_at: string
}

export interface Product {
  id: number
  brand_id: number
  category_id: number
  name: string
  part_number?: string
  unit: string
  price: number
  vat_rate: number
  status: ProductStatus
  description?: string
  spec?: string
  image_path?: string
  created_by?: number
  created_at: string
  updated_at: string
  // Joined fields
  brand_name?: string
  brand_short?: string
  category_name?: string
}

export interface Solution {
  id: number
  name: string
  code: string
  description?: string
  is_active: number
  created_at: string
}

export interface Pom {
  id: number
  pom_code: string
  solution_id?: number
  created_by: number
  reviewed_by?: number
  project_name: string
  customer_name?: string
  status: PomStatus
  note?: string
  exported_at?: string
  created_at: string
  updated_at: string
  // Joined fields
  solution_name?: string
  solution_code?: string
  created_by_name?: string
  item_count?: number
  total_amount?: number
}

export interface PomItem {
  id?: number
  pom_id?: number
  product_id: number
  quantity: number
  unit_price: number
  vat_rate: number
  note?: string
  sort_order?: number
  total_price?: number
  // Joined fields
  product_name?: string
  part_number?: string
  unit?: string
  brand_name?: string
  brand_short?: string
  category_name?: string
}

export interface PomDetail extends Pom {
  items: PomItem[]
}

export interface PriceHistory {
  id: number
  product_id: number
  old_price: number
  new_price: number
  changed_by?: number
  changed_by_name?: string
  changed_at: string
  note?: string
}

// Filter types
export interface ProductFilters {
  brand_id?: number
  category_id?: number
  status?: ProductStatus | ''
  search?: string
}

export interface PomFilters {
  status?: PomStatus | ''
  created_by?: number
  search?: string
}

// API response types
export interface ApiResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ── Survey Report types ──────────────────────────────────────
export type SurveyReportType   = 'site_survey' | 'as_built' | 'acceptance'
export type SurveyReportStatus = 'draft' | 'completed'

export interface SurveyReport {
  id: number
  report_code: string
  report_type: SurveyReportType
  pom_id: number
  created_by: number
  project_name: string
  customer_name?: string
  site_address?: string
  survey_date?: string
  surveyor_name?: string
  status: SurveyReportStatus
  general_note?: string
  created_at: string
  updated_at: string
  // Joined
  pom_code?: string
  pom_project?: string
  created_by_name?: string
  item_count?: number
}

export interface SurveyItem {
  id?: number
  report_id?: number
  product_id?: number
  product_name: string
  quantity_proposed: number
  quantity_actual: number
  unit: string
  location?: string
  condition_note?: string
  sort_order?: number
}

export interface SurveyDetail extends SurveyReport {
  items: SurveyItem[]
}

export interface SurveyFilters {
  status?: SurveyReportStatus | ''
  report_type?: SurveyReportType | ''
  created_by?: number
  search?: string
}

// ── Form Template types (Custom Form Builder) ────────────────

export type FormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'

export interface FormFieldDef {
  key:          string
  label:        string
  type:         FormFieldType
  required?:    boolean
  placeholder?: string
  options?:     string[]   // for select
  width?:       number     // px, 0 = flex
}

export interface FormColumnDef extends FormFieldDef {
  width: number
}

export interface FormSection {
  key:          string
  title:        string
  icon:         string
  type:         'fields' | 'table'
  fields?:      FormFieldDef[]
  columns?:     FormColumnDef[]
  addLabel?:    string
  defaultRows?: Record<string, any>[]
}

export interface SurveyFormTemplate {
  id:           number
  survey_type:  string
  name:         string
  description?: string
  icon?:        string
  sections:     FormSection[]
  is_active:    boolean
  created_by:   number
  created_at:   string
  updated_at:   string
  creator?:     { id: number; full_name: string }
}
