// ============================================================
// Performance & UX Optimization Guide
// ============================================================

/**
 * TỐI ƯU HÓA ĐÃ THỰC HIỆN:
 * 
 * 1. LOADING STATES & FEEDBACK ✅
 *    - Global loading overlay (LoadingOverlay.tsx)
 *    - Custom toast notifications (Notifications.tsx)
 *    - Skeleton loaders (Skeleton.tsx)
 *    - All async operations show user feedback
 * 
 * 2. CODE SPLITTING ✅
 *    - Lazy load routes với React.lazy() & Suspense
 *    - Fallback skeleton screen khi load page
 *    - Giảm bundle size tại lần load đầu
 * 
 * 3. PAGE ANIMATIONS ✅
 *    - PageTransition component với fade-in effect
 *    - Smooth modal transitions
 *    - Button loading spinners
 * 
 * 4. STATE MANAGEMENT ✅
 *    - Zustand stores cho global state
 *    - useNotification hook cho notifications
 *    - useLoading hook cho loading states
 *    - Minimal re-renders
 * 
 * 5. UTILITY FUNCTIONS ✅
 *    - debounce() cho search/filter
 *    - throttle() cho scroll events
 * 
 * ============================================================
 * CÁC BƯỚC TIẾP THEO:
 * ============================================================
 * 
 * 1. ÁPDỤNG SKELETON LOADING ĐẾN TẤT CẢ PAGES
 *    - Thêm Skeleton loader khi loading === true
 *    - Áp dụng cho ProductsPage, MyPomPage, TechPomPage, etc
 *    
 *    Ví dụ:
 *    {loading ? (
 *      <div>
 *        {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
 *      </div>
 *    ) : (
 *      <table>{...}</table>
 *    )}
 * 
 * 2. DEBOUNCE SEARCH & FILTERS
 *    - Search input: áp dụng debounce(300ms)
 *    - Filter selects: áp dụng debounce(400ms)
 *    
 *    import { debounce } from '../../utils/debounce'
 *    
 *    const handleSearch = debounce((value) => {
 *      setFilters(f => ({ ...f, search: value }))
 *    }, 300)
 * 
 * 3. API RESPONSE CACHING
 *    - Thêm cache vào ProductService, PomService, etc
 *    - Cache 5 phút, invalidate khi create/update/delete
 *    
 *    interface CacheEntry {
 *      data: any
 *      timestamp: number
 *    }
 *    const cache = new Map<string, CacheEntry>()
 * 
 * 4. IMAGE & ASSET OPTIMIZATION
 *    - Compress images
 *    - Use WebP format
 *    - Lazy load images with intersection observer
 * 
 * 5. BUNDLE SIZE OPTIMIZATION
 *    - Run: npm run build
 *    - Analyze: npm run analyze (add script)
 *    - Remove unused dependencies
 * 
 * 6. DATABASE QUERY OPTIMIZATION
 *    - Add pagination limit (20-50 items)
 *    - Implement offset-based pagination
 *    - Eager load relationships (Prisma select)
 * 
 * 7. REQUEST DEDUPLICATION
 *    - Prevent duplicate requests
 *    - Cache in-flight requests
 *    - Cancel stale requests
 * 
 * ============================================================
 * USAGE:
 * ============================================================
 * 
 * // Use global loading
 * const { withLoading } = useLoading()
 * await withLoading(async () => {
 *   await api.fetch()
 * }, 'Loading...')
 * 
 * // Use notifications
 * const notify = useNotification()
 * notify.success('Done!')
 * notify.error('Failed!')
 * notify.info('Info message')
 * notify.warning('Warning!')
 * 
 * // Wrap pages with animation
 * <PageTransition>
 *   {children}
 * </PageTransition>
 * 
 * // Use skeletons
 * {loading ? <SkeletonRow /> : <tbody>{...}</tbody>}
 * 
 * // Debounce expensive operations
 * const debouncedSearch = debounce((query) => {
 *   setFilters(f => ({ ...f, search: query }))
 * }, 300)
 * onChange={e => debouncedSearch(e.target.value)}
 * 
 * ============================================================
 */
