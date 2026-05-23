// ============================================================
// src/components/ui/index.tsx — Component UI dùng chung
// Tất cả Button, Badge, Modal, Table... ở đây
// ============================================================

import React from 'react'
import { colors, radius, commonStyles, STATUS_PRODUCT, STATUS_POM } from '../../styles/theme'
import type { ProductStatus, PomStatus } from '../../types'

// Export new components
export { LoadingOverlay } from './LoadingOverlay'
export { Notifications } from './Notifications'
export { Skeleton, SkeletonRow, SkeletonCard } from './Skeleton'
export { useLoading } from '../../hooks/useLoading'
export { useNotification } from '../../hooks/useNotification'
export { useConfirm } from './ConfirmDialog'  // ← Custom confirm dialog

// ── Global CSS keyframes (inject once) ──────────────────────
if (typeof document !== 'undefined' && !document.getElementById('uni-pom-ui-styles')) {
  const style = document.createElement('style')
  style.id = 'uni-pom-ui-styles'
  style.textContent = `
    @keyframes uniSpin {
      from { transform: rotate(0deg);   }
      to   { transform: rotate(360deg); }
    }
    @keyframes uniPulse {
      0%, 100% { opacity: 1;   }
      50%       { opacity: 0.4; }
    }
    @keyframes uniSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
  `
  document.head.appendChild(style)
}

// ── Button ───────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
  size?: 'sm' | 'md'
  icon?: string
  loading?: boolean
}

export function Button({
  variant = 'secondary', size = 'md', icon, loading,
  children, disabled, style, ...rest
}: ButtonProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: radius.md, border: 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap',
    opacity: disabled || loading ? 0.65 : 1,
    transition: 'opacity .15s',
    ...(size === 'sm'
      ? { padding: '4px 10px', fontSize: 12 }
      : { padding: '7px 16px', fontSize: 13 }),
  }

  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: colors.gradientPrimary, color: '#fff' },
    secondary: { background: colors.bgPrimary, border: `0.5px solid ${colors.border}`, color: colors.textPrimary },
    danger:    { background: colors.dangerLight, border: `0.5px solid #fecaca`, color: colors.danger },
    success:   { background: colors.success, color: '#fff' },
    ghost:     { background: 'transparent', color: colors.textSecondary },
  }

  return (
    <button disabled={disabled || loading} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {loading
        ? <i className="ti ti-loader-2" style={{ fontSize: size === 'sm' ? 13 : 15 }} />
        : icon && <i className={`ti ${icon}`} style={{ fontSize: size === 'sm' ? 13 : 15 }} />}
      {children}
    </button>
  )
}

// ── Badge ────────────────────────────────────────────────────
export function ProductBadge({ status }: { status: ProductStatus | string }) {
  const cfg = STATUS_PRODUCT[status as ProductStatus] ?? STATUS_PRODUCT.draft
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, padding: '3px 8px', borderRadius: radius.full,
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>{cfg.label}</span>
  )
}

export function PomBadge({ status }: { status: PomStatus | string }) {
  const cfg = STATUS_POM[status as PomStatus] ?? STATUS_POM.draft
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, fontSize: 11,
      padding: '3px 8px', borderRadius: radius.full, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <i className={`ti ${cfg.icon}`} style={{ fontSize: 11 }} />
      {cfg.label}
    </span>
  )
}

export function BrandBadge({ label }: { label?: string }) {
  if (!label) return <span style={{ color: colors.textTertiary }}>—</span>
  return (
    <span style={{
      background: colors.primaryLight, color: colors.primary,
      fontSize: 11, padding: '2px 8px', borderRadius: radius.sm, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Modal ────────────────────────────────────────────────────
interface ModalProps {
  title: string
  width?: number
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ title, width = 640, onClose, children, footer }: ModalProps) {
  return (
    <div style={commonStyles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: colors.bgPrimary, borderRadius: radius.lg,
        width: '90%', maxWidth: width, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `0.5px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.textSecondary, padding: 4, borderRadius: radius.sm,
          }}>
            <i className="ti ti-x" style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: `0.5px solid ${colors.border}`,
            display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form Field ───────────────────────────────────────────────
interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

export function Field({ label, required, error, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        fontSize: 12, fontWeight: 500, color: colors.textPrimary,
        display: 'block', marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: colors.danger, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: colors.danger, marginTop: 3 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 11, marginRight: 3 }} />
          {error}
        </div>
      )}
    </div>
  )
}

export function Input({ error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      style={{
        ...commonStyles.input,
        ...(error ? { borderColor: colors.danger } : {}),
        ...(props.style ?? {}),
      }}
    />
  )
}

export function Select({ error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select
      {...props}
      style={{
        ...commonStyles.input,
        cursor: 'pointer',
        ...(error ? { borderColor: colors.danger } : {}),
        ...(props.style ?? {}),
      }}
    >
      {children}
    </select>
  )
}

export function Textarea({ error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <textarea
      {...props}
      style={{
        ...commonStyles.input,
        resize: 'vertical',
        ...(error ? { borderColor: colors.danger } : {}),
        ...(props.style ?? {}),
      }}
    />
  )
}

// ── Table helpers ────────────────────────────────────────────
export function Th({ children, width, align = 'left' }: {
  children?: React.ReactNode; width?: string; align?: 'left' | 'center' | 'right'
}) {
  return (
    <th style={{
      padding: '10px 12px', textAlign: align,
      fontSize: 12, fontWeight: 500, color: colors.textSecondary,
      width, whiteSpace: 'nowrap', background: colors.bgSecondary,
    }}>{children}</th>
  )
}

export function Td({ children, align = 'left', style }: {
  children?: React.ReactNode; align?: 'left' | 'center' | 'right'; style?: React.CSSProperties
}) {
  return (
    <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: align, ...style }}>
      {children}
    </td>
  )
}

// ── Empty State ──────────────────────────────────────────────
export function EmptyState({ icon = 'ti-inbox', message, subMessage, title, desc }: {
  icon?: string; message?: string; subMessage?: string; title?: string; desc?: string
}) {
  const main = message ?? title ?? ''
  const sub = subMessage ?? desc
  return (
    <div style={commonStyles.emptyState}>
      <i className={`ti ${icon}`} style={{ fontSize: 36, color: '#d1d5db', marginBottom: 8 }} />
      <div style={{ fontSize: 13, color: colors.textTertiary }}>{main}</div>
      {sub && (
        <div style={{ fontSize: 12, color: '#d1d5db' }}>{sub}</div>
      )}
    </div>
  )
}

// ── Loading spinner ──────────────────────────────────────────
export function LoadingSpinner({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 0', gap: 10,
    }}>
      <div style={{ position: 'relative', width: size + 8, height: size + 8 }}>
        {/* Static ghost ring */}
        <i className="ti ti-loader-2" style={{
          fontSize: size + 8, color: colors.primary, opacity: 0.12,
          position: 'absolute', top: 0, left: 0,
        }} />
        {/* Spinning ring */}
        <i className="ti ti-loader-2" style={{
          fontSize: size + 8, color: colors.primary,
          position: 'absolute', top: 0, left: 0,
          animation: 'uniSpin 0.85s linear infinite',
          transformOrigin: 'center',
        }} />
      </div>
      {label && (
        <span style={{
          fontSize: 12, color: colors.textTertiary,
          animation: 'uniPulse 1.5s ease infinite',
        }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ── Select Prompt — khi panel chưa có selection ──────────────
export function SelectPrompt({ icon = 'ti-hand-click', message, subMessage }: {
  icon?: string; message: string; subMessage?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 240, gap: 14,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: `linear-gradient(135deg, ${colors.primaryLight} 0%, #e0e7ff 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 20px rgba(60,52,137,0.10)`,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 32, color: colors.primary, opacity: 0.7 }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: colors.textSecondary }}>{message}</div>
        {subMessage && (
          <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 5 }}>{subMessage}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: colors.primary,
            opacity: 0.2 + i * 0.25,
            animation: `uniPulse 1.4s ease ${i * 0.22}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Stat Card ────────────────────────────────────────────────
export function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div style={{
      background: colors.bgPrimary, border: `0.5px solid ${colors.border}`,
      borderRadius: radius.md, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: accent ?? colors.textPrimary }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Grid layouts ─────────────────────────────────────────────
export function Grid2({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...style }}>
      {children}
    </div>
  )
}

export function Grid3({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, ...style }}>
      {children}
    </div>
  )
}
