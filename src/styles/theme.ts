// ============================================================
// src/styles/theme.ts — Màu sắc & style dùng chung toàn app
// Muốn đổi màu chỉ sửa 1 chỗ này
// ============================================================

export const colors = {
  primary:        '#3C3489',
  primaryLight:   '#EEEDFE',
  secondary:      '#185FA5',
  gradientPrimary:'linear-gradient(90deg, #3C3489, #185FA5)',
  gradientSidebar:'linear-gradient(160deg, #3C3489 0%, #185FA5 100%)',

  success:        '#3B6D11',
  successLight:   '#EAF3DE',
  warning:        '#854F0B',
  warningLight:   '#FAEEDA',
  danger:         '#dc2626',
  dangerLight:    '#fff5f5',
  info:           '#185FA5',
  infoLight:      '#E0EDFF',

  textPrimary:    '#111827',
  textSecondary:  '#6b7280',
  textTertiary:   '#9ca3af',

  bgPrimary:      '#ffffff',
  bgSecondary:    '#f9fafb',
  bgTertiary:     '#f3f4f6',

  border:         '#e5e7eb',
  borderLight:    '#f3f4f6',
} as const

export const radius = {
  sm:  6,
  md:  8,
  lg:  12,
  xl:  16,
  full: 9999,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const

// Tái sử dụng style thường dùng
export const commonStyles = {
  card: {
    background: colors.bgPrimary,
    border: `0.5px solid ${colors.border}`,
    borderRadius: radius.lg,
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    fontSize: 13,
    borderRadius: radius.md,
    border: `0.5px solid #d1d5db`,
    background: colors.bgPrimary,
    color: colors.textPrimary,
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    fontSize: 13,
    borderRadius: radius.md,
    border: 'none',
    cursor: 'pointer',
    background: colors.gradientPrimary,
    color: '#fff',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    fontSize: 13,
    borderRadius: radius.md,
    border: `0.5px solid ${colors.border}`,
    background: colors.bgPrimary,
    color: colors.textPrimary,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 0',
    gap: 4,
  },
} as const

// Badge configs
export const STATUS_PRODUCT = {
  active:       { label: 'Đang bán',  color: '#3B6D11', bg: '#EAF3DE' },
  discontinued: { label: 'Ngừng bán', color: '#854F0B', bg: '#FAEEDA' },
  draft:        { label: 'Nháp',      color: '#444441', bg: '#F1EFE8' },
} as const

export const STATUS_POM = {
  draft:     { label: 'Nháp',      color: '#444441', bg: '#F1EFE8', icon: 'ti-pencil'       },
  submitted: { label: 'Chờ duyệt', color: '#854F0B', bg: '#FAEEDA', icon: 'ti-clock'        },
  reviewed:  { label: 'Đã duyệt',  color: '#185FA5', bg: '#E0EDFF', icon: 'ti-circle-check' },
  exported:  { label: 'Đã xuất',   color: '#3B6D11', bg: '#EAF3DE', icon: 'ti-file-check'   },
} as const

export const SOLUTION_ICONS: Record<string, string> = {
  LAN: 'ti-network', CONF: 'ti-video', CCTV: 'ti-camera',
  WIFI: 'ti-wifi',   VOIP: 'ti-phone', SEC: 'ti-shield', DC: 'ti-server',
}

export const PRODUCT_UNITS = ['Cái', 'Bộ', 'Cặp', 'License', 'Cuộn', 'Hộp', 'Gói']

export function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)
}
