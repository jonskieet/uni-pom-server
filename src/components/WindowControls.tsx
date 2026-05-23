// src/components/WindowControls.tsx
import { useState, useEffect } from 'react'

interface Props {
  variant?: 'light' | 'dark'   // light = nút tối (dùng trên nền sáng), dark = nút sáng (dùng trên nền tối/gradient)
  showMaximize?: boolean
}

export default function WindowControls({ variant = 'light', showMaximize = true }: Props) {
  const [isMax, setIsMax] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMax)
  }, [])

  const minimize = () => window.api.window.minimize()
  const maximize = async () => {
    await window.api.window.maximize()
    setIsMax(await window.api.window.isMaximized())
  }
  const close = () => window.api.window.close()

  const btnBase: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 6,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .15s',
    background: 'transparent',
  }

  const getBg = (key: string) => {
    if (hovered !== key) return 'transparent'
    if (key === 'close') return variant === 'dark' ? 'rgba(255,255,255,0.2)' : '#fee2e2'
    return variant === 'dark' ? 'rgba(255,255,255,0.15)' : '#f3f4f6'
  }

  const iconColor = variant === 'dark' ? 'rgba(255,255,255,0.8)' : '#6b7280'
  const closeColor = hovered === 'close'
    ? (variant === 'dark' ? '#fff' : '#dc2626')
    : iconColor

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      WebkitAppRegion: 'no-drag',
    } as React.CSSProperties}>
      {/* Minimize */}
      <button
        style={{ ...btnBase, background: getBg('min') }}
        onMouseEnter={() => setHovered('min')}
        onMouseLeave={() => setHovered(null)}
        onClick={minimize}
        title="Thu nhỏ">
        <i className="ti ti-minus" style={{ fontSize: 14, color: iconColor }} />
      </button>

      {/* Maximize (optional) */}
      {showMaximize && (
        <button
          style={{ ...btnBase, background: getBg('max') }}
          onMouseEnter={() => setHovered('max')}
          onMouseLeave={() => setHovered(null)}
          onClick={maximize}
          title={isMax ? 'Khôi phục' : 'Phóng to'}>
          <i className={`ti ${isMax ? 'ti-window-minimize' : 'ti-window-maximize'}`}
            style={{ fontSize: 13, color: iconColor }} />
        </button>
      )}

      {/* Close */}
      <button
        style={{ ...btnBase, background: getBg('close') }}
        onMouseEnter={() => setHovered('close')}
        onMouseLeave={() => setHovered(null)}
        onClick={close}
        title="Đóng">
        <i className="ti ti-x" style={{ fontSize: 15, color: closeColor }} />
      </button>
    </div>
  )
}
