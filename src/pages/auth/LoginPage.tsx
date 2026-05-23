// ============================================================
// src/pages/auth/LoginPage.tsx — với animation
// ============================================================
import { useState } from 'react'
import { useAuth } from '../../store/auth'
import type { AuthUser } from '../../store/auth'
import WindowControls from '../../components/WindowControls'
import logo from '../../assets/logo.png'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.')
      return
    }
    setLoading(true); setError('')
    try {
      const result = await window.api.users.login(username.trim(), password.trim())
      if (!result || result.error) {
        setError(result?.error || 'Tên đăng nhập hoặc mật khẩu không đúng.')
      } else if (!result.role) {
        setError('Phản hồi từ server không hợp lệ. Vui lòng thử lại.')
      } else {
        login(result as AuthUser)
      }
    } catch (e: any) {
      setError(e?.message || 'Có lỗi xảy ra. Vui lòng thử lại.')
    }
    setLoading(false)
  }

  const fillDemo = (u: string) => { setUsername(u); setPassword('CHANGE_ME') }

  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'flex', overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      WebkitAppRegion: 'drag',
    } as React.CSSProperties}>

      {/* Window controls */}
      <div style={{
        position: 'absolute', top: 10, right: 12,
        zIndex: 100, WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}>
        <WindowControls variant="light" showMaximize={false} />
      </div>

      {/* ── Left panel — branding ── */}
      <div
        className="login-left"
        style={{
          width: '38%', flexShrink: 0,
          background: 'linear-gradient(155deg, #3C3489 0%, #185FA5 55%, #0F6E56 100%)',
          display: 'flex', flexDirection: 'column',
          padding: '48px 44px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:40 }}>
          <img src={logo} alt="UNI" style={{ width:38, height:38, objectFit:'contain', filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.2))' }} />
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', letterSpacing:'0.05em', lineHeight:1 }}>UNI</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:2 }}>BOM Management System</div>
          </div>
        </div>

        {/* Heading */}
        <div style={{ fontSize:28, fontWeight:700, color:'#fff', lineHeight:1.3, marginBottom:12 }}>
          Quản lý BOM<br />chuyên nghiệp
        </div>
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.65)', lineHeight:1.7, marginBottom:48 }}>
          Hệ thống quản lý danh sách vật tư thiết bị<br />dành cho đội ngũ kỹ thuật và kinh doanh.
        </div>

        {/* Features — staggered animation */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {[
            { icon:'ti-box',              text:'Quản lý sản phẩm & bảng giá',   cls:'login-feature-0' },
            { icon:'ti-layout-grid',      text:'Tạo BOM theo từng giải pháp',   cls:'login-feature-1' },
            { icon:'ti-file-spreadsheet', text:'Xuất Excel theo mẫu chuẩn',     cls:'login-feature-2' },
            { icon:'ti-users',            text:'Phân quyền 3 cấp độ rõ ràng',  cls:'login-feature-3' },
          ].map(f => (
            <div key={f.icon} className={f.cls} style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.13)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className={`ti ${f.icon}`} style={{ fontSize:17, color:'rgba(255,255,255,0.9)' }} />
              </div>
              <span style={{ fontSize:14, color:'rgba(255,255,255,0.82)' }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop:'auto', fontSize:11, color:'rgba(255,255,255,0.3)' }}>
          v1.0.0 · UNI Technology
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div
        className="login-right"
        style={{
          flex:1, background:'#f8f9fc',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'0 60px',
          WebkitAppRegion:'no-drag',
        } as React.CSSProperties}
      >
        <div style={{ width:'100%', maxWidth:380 }} className="slide-up">

          {/* Tiêu đề */}
          <div style={{ marginBottom:36 }}>
            <div style={{ fontSize:28, fontWeight:700, color:'#111827', marginBottom:8 }}>Đăng nhập</div>
            <div style={{ fontSize:14, color:'#6b7280', lineHeight:1.5 }}>
              Chào mừng trở lại!<br />Vui lòng đăng nhập để tiếp tục.
            </div>
          </div>

          {/* Error — animated */}
          {error && (
            <div
              className="slide-up"
              style={{ display:'flex', gap:10, alignItems:'center', background:'#fff5f5', border:'1px solid #fecaca', color:'#dc2626', fontSize:13, padding:'12px 16px', borderRadius:10, marginBottom:20 }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize:16, flexShrink:0 }} />
              {error}
            </div>
          )}

          {/* Username */}
          <div style={{ marginBottom:18 }}>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:8 }}>Tên đăng nhập</label>
            <div style={{ position:'relative' }}>
              <i className="ti ti-user" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'#9ca3af', pointerEvents:'none' }} />
              <input
                style={{ width:'100%', padding:'13px 14px 13px 44px', fontSize:14, borderRadius:12, border:'1.5px solid #e5e7eb', background:'#fff', color:'#111827', boxSizing:'border-box', outline:'none', transition:'border-color .15s, box-shadow .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}
                placeholder="Nhập tên đăng nhập..."
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                onFocus={e => { e.target.style.borderColor='#3C3489'; e.target.style.boxShadow='0 0 0 3px rgba(60,52,137,.15)' }}
                onBlur={e  => { e.target.style.borderColor='#e5e7eb'; e.target.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)' }}
                autoFocus
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom:28 }}>
            <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:8 }}>Mật khẩu</label>
            <div style={{ position:'relative' }}>
              <i className="ti ti-lock" style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'#9ca3af', pointerEvents:'none' }} />
              <input
                style={{ width:'100%', padding:'13px 46px 13px 44px', fontSize:14, borderRadius:12, border:'1.5px solid #e5e7eb', background:'#fff', color:'#111827', boxSizing:'border-box', outline:'none', transition:'border-color .15s, box-shadow .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}
                type={showPass ? 'text' : 'password'}
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                onFocus={e => { e.target.style.borderColor='#3C3489'; e.target.style.boxShadow='0 0 0 3px rgba(60,52,137,.15)' }}
                onBlur={e  => { e.target.style.borderColor='#e5e7eb'; e.target.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)' }}
              />
              <button type="button"
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:6, borderRadius:6, color:'#9ca3af', transition:'color .12s' }}
                onClick={() => setShowPass(p => !p)}
                onMouseEnter={e => (e.currentTarget.style.color = '#3C3489')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize:18 }} />
              </button>
            </div>
          </div>

          {/* Submit button — loading spinner */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width:'100%', padding:'14px', fontSize:15, fontWeight:600,
              borderRadius:12, border:'none', cursor:loading ? 'not-allowed' : 'pointer',
              background:'linear-gradient(90deg, #3C3489, #185FA5)', color:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              opacity: loading ? 0.85 : 1,
              boxShadow: loading ? 'none' : '0 4px 14px rgba(60,52,137,0.35)',
              transition:'opacity .15s, box-shadow .15s, transform .08s',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <i
              className={`ti ${loading ? 'ti-loader-2 spin' : 'ti-login'}`}
              style={{ fontSize:18 }}
            />
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          {/* Demo accounts */}
          <div style={{ marginTop:32, paddingTop:24, borderTop:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:12, color:'#9ca3af', marginBottom:12, textAlign:'center' }}>
              Tài khoản demo — nhấn để điền nhanh
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {[
                { u:'admin',   label:'Admin',      icon:'ti-shield',    color:'#3C3489', bg:'#EEEDFE', border:'#c4b5fd' },
                { u:'sales01', label:'Kinh doanh', icon:'ti-briefcase', color:'#185FA5', bg:'#E0EDFF', border:'#93c5fd' },
                { u:'tech01',  label:'Kỹ thuật',   icon:'ti-tool',      color:'#0F6E56', bg:'#EAF3DE', border:'#86efac' },
              ].map(r => (
                <button
                  key={r.u}
                  onClick={() => fillDemo(r.u)}
                  style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 8px', borderRadius:10, border:`1px solid ${r.border}`, fontSize:12, fontWeight:600, cursor:'pointer', color:r.color, background:r.bg, transition:'opacity .1s, transform .08s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <i className={`ti ${r.icon}`} style={{ fontSize:14 }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
