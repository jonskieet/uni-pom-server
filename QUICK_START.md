// ============================================================
// QUICK START GUIDE - TỐI ƯU HÓA PERFORMANCE & UX
// ============================================================

/**
 * ============================================================
 * CÀI ĐẶT VÀ SỬ DỤNG
 * ============================================================
 */

// 1. NOTIFICATIONS - Thay thế alert() bằng toast
// ============================================================

// ❌ CŨ
alert('Thành công!')
alert('Có lỗi')

// ✅ MỚI
import { useNotification } from '@/components/ui'

const notify = useNotification()

notify.success('Thêm sản phẩm thành công!')  // Xanh lá
notify.error('Xóa thất bại')                 // Đỏ
notify.info('Thông tin hệ thống')            // Xanh dương
notify.warning('Hãy kiểm tra lại')          // Cam

// 2. LOADING STATES - Hiển thị feedback khi đang xử lý
// ============================================================

// ✅ CÁCH 1: Sử dụng withLoading (tự động show/hide overlay)
const { withLoading } = useLoading()

const handleSave = async () => {
  try {
    await withLoading(async () => {
      await ProductService.create(data)
      notify.success('Thêm thành công!')
    }, 'Đang lưu sản phẩm...')
  } catch (err) {
    notify.error(err.message)
  }
}

// ✅ CÁCH 2: Manual control (nếu cần)
const { isLoading, startLoading, stopLoading } = useLoading()

const handleDelete = async () => {
  startLoading('Đang xóa...')
  try {
    await ProductService.delete(id)
    notify.success('Xóa thành công!')
  } finally {
    stopLoading()
  }
}

// 3. SKELETON LOADING - Loading placeholder thay vì spinner
// ============================================================

import { SkeletonRow, Skeleton } from '@/components/ui'

// Loading table
{loading ? (
  <table>
    <tbody>
      {[...Array(5)].map((_, i) => (
        <SkeletonRow key={i} cols={6} />
      ))}
    </tbody>
  </table>
) : (
  <table>{...}</table>
)}

// Loading custom
{loading ? (
  <div>
    <Skeleton height={40} style={{ marginBottom: 16 }} />
    <Skeleton height={300} />
  </div>
) : (
  <div>{content}</div>
)}

// 4. PAGE ANIMATIONS - Fade-in effect khi load page
// ============================================================

import { PageTransition } from '@/components/PageTransition'

export default function MyPage() {
  return (
    <PageTransition>
      <div>{content}</div>
    </PageTransition>
  )
}

// 5. DEBOUNCE - Tối ưu search/filter (không gọi API quá nhiều)
// ============================================================

import { debounce } from '@/utils/debounce'

// ❌ CŨ - gọi API mỗi khi người dùng gõ (150 request cho 150 ký tự)
const handleSearch = (value) => {
  setFilters(f => ({ ...f, search: value }))
}

// ✅ MỚI - debounce 300ms (chỉ gọi API khi người dùng dừng gõ)
const debouncedSearch = debounce((value) => {
  setFilters(f => ({ ...f, search: value }))
}, 300)

<input onChange={e => debouncedSearch(e.target.value)} />

// 6. PHỐI HỢP TẤT CẢ (PRODUCTION-READY EXAMPLE)
// ============================================================

import { useNotification, useLoading, Skeleton } from '@/components/ui'
import { PageTransition } from '@/components/PageTransition'
import { debounce } from '@/utils/debounce'

export default function ProductsPage() {
  const { data, loading } = useProducts(filters)
  const notify = useNotification()
  const { withLoading } = useLoading()

  // Debounce search 300ms
  const handleSearch = debounce((value) => {
    setFilters(f => ({ ...f, search: value }))
  }, 300)

  // Save product
  const handleSave = async (product) => {
    try {
      await withLoading(async () => {
        await ProductService.create(product)
        notify.success(`Thêm "${product.name}" thành công!`)
        reload()
      }, 'Đang lưu sản phẩm...')
    } catch (err) {
      notify.error(err.message || 'Lưu thất bại')
    }
  }

  return (
    <PageTransition>
      <div>
        {/* Search with debounce */}
        <input 
          placeholder="Tìm kiếm..."
          onChange={e => handleSearch(e.target.value)}
        />

        {/* Loading skeleton */}
        {loading ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height={40} style={{ marginBottom: 8 }} />
            ))}
          </div>
        ) : (
          <table>{/* data */}</table>
        )}
      </div>
    </PageTransition>
  )
}

// ============================================================
// PERFORMANCE TIPS
// ============================================================

/**
 * 1. LUÔN LUÔN sử dụng notify.error() thay alert()
 *    → Tốt hơn UX, không block UI
 * 
 * 2. Wrap async operations với withLoading()
 *    → Người dùng biết app đang làm gì
 * 
 * 3. Dùng Skeleton thay LoadingSpinner
 *    → Skeleton khiến loading cảm thấy nhanh hơn
 * 
 * 4. Thêm PageTransition vào mỗi page
 *    → Tạo sense of polish & professionalism
 * 
 * 5. Debounce search/filter input
 *    → Giảm API calls, giảm lag
 * 
 * 6. Lazy load pages → giảm bundle size
 *    → App khởi động nhanh hơn
 * 
 * 7. Cache API responses
 *    → Dữ liệu hiển thị ngay, không đợi API
 * 
 * 8. Monitor performance
 *    → Kiểm tra bundle size: npm run build
 *    → Kiểm tra page load time ở DevTools
 */

/**
 * ============================================================
 * MONITORING PERFORMANCE
 * ============================================================
 */

// Check bundle size
// npm run build → Xem console output

// Các chiến lược tối ưu:
// 1. Code splitting ✅ (đã implement)
// 2. Tree shaking ✅ (automatic with vite)
// 3. Minification ✅ (automatic with vite)
// 4. Lazy loading ✅ (đã implement)
// 5. Debounce/Throttle ✅ (đã implement)
// 6. Request caching ⏳ (cần implement)
// 7. Image optimization ⏳ (cần implement)
// 8. Service worker ⏳ (nâng cao)

/**
 * ============================================================
 * COMMON PATTERNS
 * ============================================================
 */

// Pattern 1: Async operation với loading & notification
async function handleAsyncOp() {
  const { withLoading } = useLoading()
  const notify = useNotification()

  try {
    await withLoading(async () => {
      await api.call()
      notify.success('Thành công!')
    }, 'Đang xử lý...')
  } catch (err) {
    notify.error(err.message)
  }
}

// Pattern 2: Search with debounce
function SearchInput() {
  const handleSearch = debounce((value) => {
    setQuery(value)
  }, 300)

  return <input onChange={e => handleSearch(e.target.value)} />
}

// Pattern 3: Form submit with validation
async function handleSubmit(e) {
  e.preventDefault()
  if (!validate()) return

  const { withLoading } = useLoading()
  const notify = useNotification()

  try {
    await withLoading(async () => {
      await api.submit(data)
      notify.success('Lưu thành công!')
      onClose()
    }, 'Đang lưu...')
  } catch (err) {
    notify.error(err.message)
  }
}
