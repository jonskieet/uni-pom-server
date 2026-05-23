// src/components/MainLayout.tsx
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import type { Role } from '../store/auth'  // includes 'technical_lead'
import WindowControls from './WindowControls'
import logo from '../../src/assets/logo.png'

interface NavItem { key: string; label: string; icon: string; path: string; roles: Role[] }

const NAV: NavItem[] = [
  { key: 'products',    label: 'Sản phẩm',      icon: 'ti-box',              path: '/products',    roles: ['admin','sales'] },
  { key: 'pricing',     label: 'Bảng giá',      icon: 'ti-tag',              path: '/pricing',     roles: ['admin','sales'] },
  { key: 'my-pom',      label: 'POM của tôi',   icon: 'ti-file-invoice',     path: '/my-pom',      roles: ['admin','sales'] },
  { key: 'brands',      label: 'Hãng sản xuất', icon: 'ti-building-factory', path: '/brands',      roles: ['admin','sales'] },
  { key: 'create-pom',  label: 'Tạo POM',       icon: 'ti-layout-grid',      path: '/create-pom',  roles: ['admin','technical'] },
  { key: 'solutions',   label: 'Giải pháp',     icon: 'ti-network',          path: '/solutions',   roles: ['admin','technical'] },
  { key: 'pom-history', label: 'POM của tôi',   icon: 'ti-history',          path: '/pom-history', roles: ['admin','technical'] },
  { key: 'survey',      label: 'Báo cáo KS',   icon: 'ti-map-search',       path: '/survey',      roles: ['admin','technical'] },
  { key: 'users',       label: 'Người dùng',    icon: 'ti-users',            path: '/users',       roles: ['admin'] },
  // Trưởng phòng KT
  { key: 'lead-pom',    label: 'Duyệt POM',     icon: 'ti-clipboard-check',  path: '/lead-pom',    roles: ['admin','technical_lead'] },
  { key: 'lead-solutions', label: 'Giải pháp',  icon: 'ti-network',          path: '/lead-solutions', roles: ['admin','technical_lead'] },
  { key: 'lead-form-templates', label: 'Mẫu phiếu KS', icon: 'ti-template', path: '/lead-form-templates', roles: ['admin','technical_lead'] },

  { key: 'settings',    label: 'Cài đặt',       icon: 'ti-settings',         path: '/settings',    roles: ['admin'] },
]

const SECTIONS = [
  { label: 'Kinh doanh', keys: ['products','pricing','my-pom','brands'] },
  { label: 'Kỹ thuật',   keys: ['create-pom','solutions','pom-history','survey'] },
  { label: 'Trưởng phòng KT', keys: ['lead-pom','lead-solutions','lead-form-templates'] },
  { label: 'Quản trị',   keys: ['users','settings'] },
]

const ROLE_META: Record<Role, { label: string; icon: string }> = {
  admin:     { label: 'Quản trị viên', icon: 'ti-shield'    },
  sales:     { label: 'Kinh doanh',   icon: 'ti-briefcase'  },
  technical: { label: 'Kỹ thuật',    icon: 'ti-tool'       },
  technical_lead: { label: 'Trưởng phòng KT', icon: 'ti-shield-check' },
}

export default function MainLayout({ children, title, subtitle }: {
  children: React.ReactNode; title?: string; subtitle?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  if (!user) return null

  const activeKey = NAV.find(i => location.pathname.startsWith(i.path))?.key
  const visible   = NAV.filter(i => i.roles.includes(user.role))
  const meta      = ROLE_META[user.role]

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside style={{ width: 220, flexShrink: 0, background: 'linear-gradient(160deg,#3C3489 0%,#185FA5 100%)', display: 'flex', flexDirection: 'column' }}>

        {/* Logo + drag region trong sidebar */}
        <div style={{ padding: '0 16px', borderBottom: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, height: 52, WebkitAppRegion: 'drag', flexShrink: 0 } as React.CSSProperties}>
          <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <img src={logo} alt="UNI" style={{ width:38, height:38, objectFit:'contain', filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.15))' }} />
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.2 }}>UNI</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>POM System</div>
          </div>
        </div>

        {/* User badge */}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`ti ${meta.icon}`} style={{ fontSize: 13, color: '#fff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{meta.label}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
          {SECTIONS.map(sec => {
            const items = sec.keys.map(k => visible.find(i => i.key === k)).filter(Boolean) as NavItem[]
            if (!items.length) return null
            return (
              <div key={sec.label}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', padding: '10px 8px 4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sec.label}</div>
                {items.map(item => {
                  const active = activeKey === item.key
                  return (
                    <button key={item.key} onClick={() => navigate(item.path)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', marginBottom: 2, borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', background: active ? 'rgba(255,255,255,0.16)' : 'transparent', transition: 'background .1s' }}>
                      <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: active ? '#fff' : 'rgba(255,255,255,0.6)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: active ? '#fff' : 'rgba(255,255,255,0.75)', fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '10px 10px 14px', borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
          <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <i className="ti ti-logout" style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f3f4f6', minWidth: 0, overflow: 'hidden' }}>

        {/* Titlebar — drag region + window controls */}
        <div style={{
          height: 52, flexShrink: 0, background: '#fff',
          borderBottom: '0.5px solid #e5e7eb',
          display: 'flex', alignItems: 'center',
          padding: '0 16px 0 20px',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}>
          {/* Title */}
          <div style={{ flex: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {title    && <div style={{ fontSize: 15, fontWeight: 500, color: '#111827', lineHeight: 1.2 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 11, color: '#9ca3af' }}>{subtitle}</div>}
          </div>

          {/* Window controls — no-drag */}
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <WindowControls variant="light" showMaximize />
          </div>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</main>
      </div>
    </div>
  )
}
