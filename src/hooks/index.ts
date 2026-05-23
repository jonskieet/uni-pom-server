// ============================================================
// src/hooks/index.ts — Custom hooks quản lý data & state
// Component chỉ cần gọi hook, không cần biết fetch từ đâu
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { BrandService, CategoryService, ProductService, SolutionService, PomService } from '../services'
import type { Brand, Category, Product, Solution, Pom, PomDetail, ProductFilters, PomFilters } from '../types'

// ── Generic async state ──────────────────────────────────────
interface AsyncState<T> {
  data: T
  loading: boolean
  error: string | null
}

function useAsync<T>(initialData: T) {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData, loading: true, error: null,
  })

  const setData    = (data: T)    => setState(s => ({ ...s, data, loading: false, error: null }))
  const setLoading = ()           => setState(s => ({ ...s, loading: true, error: null }))
  const setError   = (err: string) => setState(s => ({ ...s, loading: false, error: err }))

  return { state, setData, setLoading, setError }
}

// ── useBrands ────────────────────────────────────────────────
export function useBrands() {
  const { state, setData, setLoading, setError } = useAsync<Brand[]>([])

  const load = useCallback(async () => {
    setLoading()
    try { const r = await BrandService.getAll(); setData(Array.isArray(r) ? r : ((r as any)?.data ?? [])) }
    catch { setError('Không thể tải danh sách hãng.') }
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── useCategories ────────────────────────────────────────────
export function useCategories() {
  const { state, setData, setLoading, setError } = useAsync<Category[]>([])

  const load = useCallback(async () => {
    setLoading()
    try { const r = await CategoryService.getAll(); setData(Array.isArray(r) ? r : ((r as any)?.data ?? [])) }
    catch { setError('Không thể tải danh mục.') }
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── useSolutions ─────────────────────────────────────────────
export function useSolutions() {
  const { state, setData, setLoading, setError } = useAsync<Solution[]>([])

  const load = useCallback(async () => {
    setLoading()
    try { const r = await SolutionService.getAll(); setData(Array.isArray(r) ? r : ((r as any)?.data ?? [])) }
    catch { setError('Không thể tải giải pháp.') }
  }, [])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── useProducts ──────────────────────────────────────────────
export function useProducts(filters?: ProductFilters) {
  const { state, setData, setLoading, setError } = useAsync<Product[]>([])

  const load = useCallback(async () => {
    setLoading()
    try { 
      const r = await ProductService.getAll(filters)
      const arr = Array.isArray(r) ? r : Array.isArray((r as any)?.data) ? (r as any).data : ((r as any)?.data?.data ?? [])
      setData(arr)
    }
    catch { setError('Không thể tải danh sách sản phẩm.') }
  }, [
    filters?.brand_id,
    filters?.category_id,
    filters?.status,
    filters?.search,
  ])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── usePoms ──────────────────────────────────────────────────
export function usePoms(filters?: PomFilters) {
  const { state, setData, setLoading, setError } = useAsync<Pom[]>([])

  const load = useCallback(async () => {
    setLoading()
    try { const r = await PomService.getAll(filters); setData(Array.isArray(r) ? r : ((r as any)?.data ?? [])) }
    catch { setError('Không thể tải danh sách POM.') }
  }, [filters?.status, filters?.created_by, filters?.search])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── usePomDetail ─────────────────────────────────────────────
export function usePomDetail(id: number | null) {
  const { state, setData, setLoading, setError } = useAsync<PomDetail | null>(null)

  const load = useCallback(async () => {
    if (id === null) return
    setLoading()
    try { setData(await PomService.getById(id)) }
    catch { setError('Không thể tải chi tiết POM.') }
  }, [id])

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── useRefData — load brands + categories 1 lần dùng cho form ─
export function useRefData() {
  const brands     = useBrands()
  const categories = useCategories()
  return {
    brands:     brands.data,
    categories: categories.data,
    loading:    brands.loading || categories.loading,
  }
}
