// src/App.tsx — Đã thêm module Hãng sản xuất + Bảng giá
import { Component, Suspense, lazy, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthContext, useAuth, useAuthProvider } from './store/auth'
import { LoadingOverlay, Notifications, Skeleton } from './components/ui'
import LoginPage        from './pages/auth/LoginPage'
import MainLayout       from './components/MainLayout'
import ProtectedRoute   from './components/ProtectedRoute'

// Lazy load pages for code splitting
const ProductsPage     = lazy(() => import('./pages/products/ProductsPage'))
const BrandsPage       = lazy(() => import('./pages/brands/BrandsPage'))       // ← MỚI
const PricingPage      = lazy(() => import('./pages/pricing/PricingPage'))     // ← MỚI
const CreatePomPage    = lazy(() => import('./pages/pom/CreatePomPage'))
const MyPomPage        = lazy(() => import('./pages/pom/MyPomPage'))
const TechPomPage      = lazy(() => import('./pages/pom/TechPomPage'))
const TechLeadPomPage  = lazy(() => import('./pages/pom/TechLeadPomPage'))
const SurveyListPage   = lazy(() => import('./pages/survey/SurveyListPage'))
const SurveyReportPage = lazy(() => import('./pages/survey/SurveyReportPage'))
const SurveyDetailPage = lazy(() => import('./pages/survey/SurveyDetailPage'))
const FormTemplateManager = lazy(() => import('./pages/survey/FormTemplateManager'))

// ── Error Boundary ────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, fontFamily: 'monospace', color: '#dc2626' }}>
        <b>Lỗi render:</b><br />{this.state.error}
      </div>
    )
    return this.props.children
  }
}

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8 }}>
      <i className="ti ti-tools" style={{ fontSize:36, color:'#d1d5db' }} />
      <div style={{ fontSize:14, color:'#6b7280' }}>Trang <b>{name}</b> đang được xây dựng</div>
    </div>
  )
}

function Wrap({ title, subtitle, roles, children }: {
  title: string; subtitle?: string
  roles?: ('admin'|'sales'|'technical'|'technical_lead')[]
  children: ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={roles}>
      <MainLayout title={title} subtitle={subtitle}>
        {children}
      </MainLayout>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  if (!user) return <LoginPage />

  // Điều hướng home theo role
  const home =
    user.role === 'technical'      ? '/create-pom'  :
    user.role === 'technical_lead' ? '/lead-pom'    :
    user.role === 'sales'          ? '/my-pom'      :
    /* admin */                      '/products'

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />

      {/* ── Kinh doanh & Admin ───────────────────────────── */}
      <Route path="/products"
        element={<Wrap title="Sản phẩm" subtitle="Quản lý danh mục sản phẩm" roles={['admin','sales']}>
          <ProductsPage />
        </Wrap>} />

      <Route path="/pricing"
        element={<Wrap title="Bảng giá" subtitle="Quản lý giá & lịch sử thay đổi giá" roles={['admin','sales']}>
          <PricingPage />  {/* ← ĐÃ THAY PLACEHOLDER */}
        </Wrap>} />

      <Route path="/my-pom"
        element={<Wrap title="POM của tôi" subtitle="Xem & xuất Excel" roles={['admin','sales']}>
          <MyPomPage />
        </Wrap>} />

      <Route path="/brands"
        element={<Wrap title="Hãng sản xuất" subtitle="Quản lý nhà sản xuất" roles={['admin','sales']}>
          <BrandsPage />  {/* ← ĐÃ THAY PLACEHOLDER */}
        </Wrap>} />

      {/* ── Kỹ thuật ────────────────────────────────────── */}
      <Route path="/create-pom"
        element={<Wrap title="Tạo BOM" subtitle="Tạo danh sách thiết bị" roles={['admin','technical']}>
          <CreatePomPage />
        </Wrap>} />

      <Route path="/solutions"
        element={<Wrap title="Giải pháp" roles={['admin','technical']}>
          <Placeholder name="Giải pháp" />
        </Wrap>} />

      <Route path="/pom-history"
        element={<Wrap title="BOM của tôi" subtitle="Xem & chỉnh sửa POM" roles={['admin','technical']}>
          <TechPomPage />
        </Wrap>} />

      <Route path="/survey"
        element={<Wrap title="Báo cáo khảo sát" subtitle="Khảo sát · Hoàn công · Nghiệm thu" roles={['admin','technical','sales']}>
          <SurveyListPage />
        </Wrap>} />

      <Route path="/survey-report"
        element={<Wrap title="Tạo phiếu báo cáo khảo sát" roles={['admin','technical','sales']}>
          <SurveyReportPage />
        </Wrap>} />

      <Route path="/survey-detail/:id"
        element={<Wrap title="Chi tiết phiếu báo cáo khảo sát" roles={['admin','technical','sales']}>
          <SurveyDetailPage />
        </Wrap>} />

      {/* ── Trưởng phòng KT ─────────────────────────────── */}
      <Route path="/lead-pom"
        element={<Wrap title="Duyệt POM" subtitle="Xem xét & phê duyệt POM" roles={['admin','technical_lead']}>
          <TechLeadPomPage />
        </Wrap>} />

      <Route path="/lead-solutions"
        element={<Wrap title="Giải pháp" roles={['admin','technical_lead']}>
          <Placeholder name="Giải pháp" />
        </Wrap>} />

      <Route path="/lead-form-templates"
        element={<Wrap title="Quản lý mẫu phiếu" subtitle="Thiết kế form khảo sát tùy chỉnh" roles={['admin','technical_lead']}>
          <FormTemplateManager />
        </Wrap>} />

      <Route path="/lead-brands"
        element={<Wrap title="Hãng sản xuất" roles={['admin']}>
          <BrandsPage />  {/* Admin only */}
        </Wrap>} />

      {/* ── Quản trị ────────────────────────────────────── */}
      <Route path="/users"
        element={<Wrap title="Người dùng" roles={['admin']}>
          <Placeholder name="Người dùng" />
        </Wrap>} />

      <Route path="/settings"
        element={<Wrap title="Cài đặt" roles={['admin']}>
          <Placeholder name="Cài đặt" />
        </Wrap>} />

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}

function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthProvider()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

function PageLoadingFallback() {
  return (
    <div style={{ padding: 40, display: 'flex', gap: 20 }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ flex: 1 }}>
          <Skeleton height={40} style={{ marginBottom: 16 }} />
          <Skeleton height={300} style={{ marginBottom: 12 }} />
          <Skeleton height={20} />
        </div>
      ))}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <LoadingOverlay />
          <Notifications />
          <Suspense fallback={<PageLoadingFallback />}>
            <AppRoutes />
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
