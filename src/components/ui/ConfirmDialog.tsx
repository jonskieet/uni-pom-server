// ============================================================
// src/components/ui/ConfirmDialog.tsx
// Thay thế window.confirm() mặc định của hệ điều hành
//
// Cách dùng:
//   const { confirm, ConfirmNode } = useConfirm()
//   ...
//   const ok = await confirm({
//     title:   'Xoá sản phẩm?',
//     message: 'Thao tác này không thể hoàn tác.',
//     variant: 'danger',         // 'danger' | 'warning' | 'info'
//     confirmLabel: 'Xoá',       // tuỳ chọn
//   })
//   if (!ok) return
//   ...
//   return <>{ConfirmNode}</>    // render vào JSX
// ============================================================
import { useState, useCallback } from 'react'
import { colors, radius } from '../../styles/theme'

// ── Types ────────────────────────────────────────────────────
export interface ConfirmOptions {
  title:         string
  message?:      string
  variant?:      'danger' | 'warning' | 'info'
  confirmLabel?: string
  cancelLabel?:  string
}

// ── Config theo variant ──────────────────────────────────────
const VARIANT_CFG = {
  danger: {
    iconBg:    '#fff1f2',
    iconColor: colors.danger,
    icon:      'ti-trash',
    btnStyle:  { background: colors.danger, color: '#fff' } as React.CSSProperties,
  },
  warning: {
    iconBg:    colors.warningLight,
    iconColor: colors.warning,
    icon:      'ti-alert-triangle',
    btnStyle:  { background: '#d97706', color: '#fff' } as React.CSSProperties,
  },
  info: {
    iconBg:    colors.infoLight,
    iconColor: colors.info,
    icon:      'ti-info-circle',
    btnStyle:  { background: colors.primary, color: '#fff' } as React.CSSProperties,
  },
} as const

// ── Component ────────────────────────────────────────────────
function ConfirmDialogUI({
  options,
  onConfirm,
  onCancel,
}: {
  options:   ConfirmOptions
  onConfirm: () => void
  onCancel:  () => void
}) {
  const variant = options.variant ?? 'danger'
  const cfg     = VARIANT_CFG[variant]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Fade-in khi mount
        animation: 'confirmOverlayIn 0.15s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* Inject keyframes một lần */}
      <style>{`
        @keyframes confirmOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes confirmDialogIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes spinIcon {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          background: colors.bgPrimary,
          borderRadius: radius.xl,
          width: '100%', maxWidth: 400,
          padding: '28px 28px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          animation: 'confirmDialogIn 0.18s cubic-bezier(.22,.68,0,1.2)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}
      >
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: cfg.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className={`ti ${cfg.icon}`}
            style={{ fontSize: 26, color: cfg.iconColor }} />
        </div>

        {/* Title + message */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.4 }}>
            {options.title}
          </div>
          {options.message && (
            <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 1.5 }}>
              {options.message}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500,
              borderRadius: radius.md, border: `0.5px solid ${colors.border}`,
              background: colors.bgPrimary, color: colors.textPrimary,
              cursor: 'pointer', transition: 'background .1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = colors.bgSecondary)}
            onMouseLeave={e => (e.currentTarget.style.background = colors.bgPrimary)}
          >
            {options.cancelLabel ?? 'Huỷ'}
          </button>

          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 500,
              borderRadius: radius.md, border: 'none',
              cursor: 'pointer', transition: 'opacity .1s',
              ...cfg.btnStyle,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {options.confirmLabel ?? 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hook ─────────────────────────────────────────────────────
interface ConfirmState {
  options:   ConfirmOptions
  resolve:   (value: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  const ConfirmNode = state ? (
    <ConfirmDialogUI
      options={state.options}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmNode }
}
