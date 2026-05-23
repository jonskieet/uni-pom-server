// ============================================================
// src/components/ui/toast.tsx — Toast notification system
// Thay thế alert() bằng toast đẹp, không chặn UI
// ============================================================

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { colors, radius } from '../../styles/theme'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
  removing?: boolean
}

interface ToastCtx {
  success: (msg: string) => void
  error:   (msg: string) => void
  warning: (msg: string) => void
  info:    (msg: string) => void
}

const ToastContext = createContext<ToastCtx>({
  success: () => {}, error: () => {}, warning: () => {}, info: () => {}
})

export function useToast() { return useContext(ToastContext) }

const TOAST_CFG: Record<ToastType, { bg: string; color: string; border: string; icon: string }> = {
  success: { bg: colors.successLight, color: colors.success,  border: '#bbf7d0', icon: 'ti-circle-check' },
  error:   { bg: colors.dangerLight,  color: colors.danger,   border: '#fecaca', icon: 'ti-circle-x'    },
  warning: { bg: colors.warningLight, color: colors.warning,  border: '#fde68a', icon: 'ti-alert-triangle' },
  info:    { bg: colors.infoLight,    color: colors.info,     border: '#bfdbfe', icon: 'ti-info-circle'  },
}

let _idSeq = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    // trigger remove animation first
    setToasts(prev => prev.map(t => t.id === id ? { ...t, removing: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++_idSeq
    setToasts(prev => [...prev, { id, type, message }])
    const timer = setTimeout(() => remove(id), 3500)
    timers.current.set(id, timer)
  }, [remove])

  const ctx: ToastCtx = {
    success: (msg) => add('success', msg),
    error:   (msg) => add('error',   msg),
    warning: (msg) => add('warning', msg),
    info:    (msg) => add('info',    msg),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 9999, pointerEvents: 'none',
      }}>
        <style>{`
          @keyframes toast-in  { from { opacity:0; transform:translateX(60px) scale(.96) } to { opacity:1; transform:translateX(0) scale(1) } }
          @keyframes toast-out { from { opacity:1; transform:translateX(0) scale(1) }      to { opacity:0; transform:translateX(60px) scale(.96) } }
        `}</style>
        {toasts.map(t => {
          const cfg = TOAST_CFG[t.type]
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: radius.md,
              padding: '10px 14px',
              minWidth: 260, maxWidth: 380,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              pointerEvents: 'auto',
              animation: `${t.removing ? 'toast-out' : 'toast-in'} .3s ease forwards`,
              cursor: 'pointer',
            }}
              onClick={() => remove(t.id)}
            >
              <i className={`ti ${cfg.icon}`} style={{ fontSize: 16, color: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: cfg.color, flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <i className="ti ti-x" style={{ fontSize: 13, color: cfg.color, opacity: 0.6, flexShrink: 0 }} />
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
