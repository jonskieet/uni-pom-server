// ============================================================
// src/components/ui/LoadingOverlay.tsx — Global loading overlay
// ============================================================

import { FC } from 'react'
import { useLoadingStore } from '../../hooks/useLoading'
import { colors } from '../../styles/theme'

export const LoadingOverlay: FC = () => {
  const { isLoading, loadingText } = useLoadingStore()

  if (!isLoading) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        {/* Spinner */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: `3px solid ${colors.borderLight}`,
            borderTopColor: colors.primary,
            animation: 'spin 1s linear infinite'
          }}
        />
        <div style={{ fontSize: 14, color: colors.textSecondary, fontWeight: 500 }}>
          {loadingText}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
