// ============================================================
// src/components/ui/Skeleton.tsx — Loading skeleton component
// ============================================================

import { FC, CSSProperties } from 'react'
import { colors } from '../../styles/theme'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: number
  count?: number
  style?: CSSProperties
}

export const Skeleton: FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  count = 1,
  style
}) => {
  const skeletons = Array.from({ length: count })

  return (
    <>
      {skeletons.map((_, i) => (
        <div
          key={i}
          style={{
            width,
            height,
            borderRadius,
            background: `linear-gradient(90deg, ${colors.bgSecondary} 0%, ${colors.border} 50%, ${colors.bgSecondary} 100%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite',
            marginBottom: i < count - 1 ? 12 : 0,
            ...style
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  )
}

// Skeleton table row
export const SkeletonRow: FC<{ cols?: number }> = ({ cols = 5 }) => {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <Skeleton height={16} />
        </td>
      ))}
    </tr>
  )
}

// Skeleton card
export const SkeletonCard: FC = () => (
  <div
    style={{
      background: '#fff',
      border: `0.5px solid ${colors.border}`,
      borderRadius: 12,
      padding: 16,
      gap: 12,
      display: 'flex',
      flexDirection: 'column'
    }}
  >
    <Skeleton height={200} borderRadius={8} />
    <Skeleton height={16} />
    <Skeleton height={16} width="80%" />
    <Skeleton height={32} borderRadius={6} />
  </div>
)
