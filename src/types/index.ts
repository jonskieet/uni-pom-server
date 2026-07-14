// ============================================================
// src/types/index.ts — v2
// ============================================================

export type Role          = 'admin' | 'sales_admin' | 'sales' | 'technical' | 'technical_lead'
export type ProductStatus = 'active' | 'discontinued' | 'draft'

// PomStatus mở rộng từ 4 → 10 trạng thái
export type PomStatus =
  | 'draft'
  | 'submitted'
  | 'reviewed'           // old name for tp_approved
  | 'tp_approved'        // (v1: reviewed)
  | 'exported'           // old name for pricing_done
  | 'pricing_done'       // (v1: exported)
  | 'sent_to_client'
  | 'negotiating'
  | 'revision_price'
  | 'revision_tech'
  | 'closed_won'
  | 'closed_lost'
  | 'won'                // alternative name
  | 'lost'               // alternative name

export type AuditAction =
  | 'created' | 'submitted' | 'tp_approved' | 'tp_returned'
  | 'pricing_done' | 'sent_to_client' | 'client_feedback'
  | 'return_to_price' | 'return_to_tech' | 'price_revised'
  | 'tech_revised' | 'tp_reapproved' | 'closed_won' | 'closed_lost'

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
  sell_price?: number | null
  vat_rate: number
  status: ProductStatus
  description?: string
  spec?: string
  image_path?: string
  origin?: string
  warranty?: string
  created_by?: number
  created_at: string
  updated_at: string
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
  assigned_sale_id?: number    // Sale phụ trách (v2)
  sale_admin_id?: number       // Sale Admin định giá (v2)
  project_name: string
  customer_name?: string
  status: PomStatus
  note?: string
  return_reason?: string
  revision_count?: number      // v2
  exported_at?: string
  closed_at?: string           // v2
  items_updated_at?: string | null  // mốc thời gian PomItem thay đổi gần nhất
  created_at: string
  updated_at: string
  // Joined
  solution_name?: string
  solution_code?: string
  created_by_name?: string
  reviewer_name?: string
  assigned_sale_name?: string
  sale_admin_name?: string
  item_count?: number
  total_amount?: number
}

export interface PomItem {
  id?: number
  pom_id?: number
  product_id: number
  quantity: number
  unit_price: number
  sale_price?: number | null   // v2: giá Sale Admin điều chỉnh
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
  spec?: string
  warranty?: string
  origin?: string
}

export interface PomDetail extends Pom {
  items: PomItem[]
  auditLogs?: AuditLog[]
}

// v2: AuditLog
export interface AuditLog {
  id: number
  pom_id: number
  actor_id?: number
  from_status?: PomStatus | null
  to_status: PomStatus
  action: AuditAction
  note?: string | null
  metadata?: Record<string, any> | null
  created_at: string
  actor?: { id: number; full_name: string; role: Role }
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

// v2: Admin dashboard types
export interface DashboardSummary {
  total_poms: number
  close_rate_30d_pct: number | null
  closed_won_30d: number
  closed_lost_30d: number
  sent_to_client_30d: number
}

export interface StuckAlert {
  pom_id: number
  pom_code: string
  project_name: string
  tech_name?: string
  sale_admin_name?: string
  sale_name?: string
  waiting_since: string
  days_waiting: number
}

export interface DashboardData {
  summary: DashboardSummary
  by_status: Record<PomStatus, number>
  alerts: {
    stuck_waiting_tp: StuckAlert[]
    stuck_waiting_price: StuckAlert[]
    stuck_negotiating: StuckAlert[]
  }
  revision_stats: {
    avg_per_pom: number
    max: number
    total: number
    top_revisioned: Array<{ id: number; pom_code: string; project_name: string; customer_name?: string; status: PomStatus; revision_count: number }>
  }
}

export interface KpiUser {
  user_id: number
  full_name: string
  role: Role
  metrics: {
    boms_created: number
    boms_approved: number
    boms_returned: number
    boms_priced: number
    boms_sent: number
    boms_closed_won: number
    boms_closed_lost: number
    price_revisions: number
    tech_revisions: number
  }
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
  assigned_sale_id?: number
  search?: string
}

export interface ApiResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Survey types
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
  form_template_id?: number | null
  form_data?: Record<string, any> | null
  // File Word upload thẳng (.docx) — Cloudflare R2
  word_file_key?: string | null
  word_file_name?: string | null
  word_file_size?: number | null
  word_file_uploaded_by?: number | null
  word_file_uploaded_at?: string | null
  items_synced_at?: string | null  // lần gần nhất đồng bộ thiết bị từ POM
  created_at: string
  updated_at: string
  pom_code?: string
  pom_project?: string
  created_by_name?: string
  item_count?: number
  // Joined khi lấy chi tiết
  pom?: Pom
}

export interface SurveyItem {
  id?: number
  report_id?: number
  pom_item_id?: number | null
  product_id?: number | null
  product_name?: string | null   // chỉ có giá trị khi item KHÔNG liên kết POM (thêm tay)
  quantity_actual: number
  unit: string
  location?: string
  condition_note?: string
  is_removed_from_pom?: boolean
  sort_order?: number
  // Joined — nguồn "đề xuất" chính thức khi item liên kết POM
  pomItem?: { id: number; quantity: number; product?: { id: number; name: string; unit?: string } } | null
  product?: { id: number; name: string; unit?: string } | null
}

/** Tên + số lượng đề xuất hiển thị, ưu tiên đọc LIVE từ pomItem (POM là nguồn gốc) */
export function surveyItemDisplayName(item: SurveyItem): string {
  return item.pomItem?.product?.name ?? item.product?.name ?? item.product_name ?? '—'
}
export function surveyItemProposedQty(item: SurveyItem): number | null {
  return item.pomItem?.quantity ?? null
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

export interface UserFilters {
  role?: Role | ''
  search?: string
  is_active?: boolean
}
