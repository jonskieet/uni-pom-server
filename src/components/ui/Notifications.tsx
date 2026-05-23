// ============================================================
// src/components/ui/Notifications.tsx — Toast notification container
// ============================================================

import { FC } from 'react'
import { useNotificationStore } from '../../hooks/useNotification'
import { colors } from '../../styles/theme'

const notificationConfig = {
  success: {
    icon: '✓',
    bgColor: '#f0fdf4',
    borderColor: '#86efac',
    textColor: '#166534',
    accentColor: '#22c55e'
  },
  error: {
    icon: '✕',
    bgColor: '#fef2f2',
    borderColor: '#fca5a5',
    textColor: '#7f1d1d',
    accentColor: '#ef4444'
  },
  info: {
    icon: 'ℹ',
    bgColor: '#eff6ff',
    borderColor: '#93c5fd',
    textColor: '#0c2d6b',
    accentColor: '#3b82f6'
  },
  warning: {
    icon: '⚠',
    bgColor: '#fffbeb',
    borderColor: '#fcd34d',
    textColor: '#78350f',
    accentColor: '#f59e0b'
  }
}

export const Notifications: FC = () => {
  const { notifications, removeNotification } = useNotificationStore()

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none'
      }}
    >
      {notifications.map((notif) => {
        const config = notificationConfig[notif.type]
        return (
          <div
            key={notif.id}
            onClick={() => removeNotification(notif.id)}
            style={{
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              color: config.textColor,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              animation: 'slideInRight 0.3s ease-out',
              backdropFilter: 'blur(4px)'
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: config.accentColor,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 'bold',
                flexShrink: 0
              }}
            >
              {config.icon}
            </div>
            <span style={{ flex: 1 }}>{notif.message}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeNotification(notif.id)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'currentColor',
                cursor: 'pointer',
                fontSize: 16,
                opacity: 0.6,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
              ✕
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
