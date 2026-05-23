// ============================================================
// src/hooks/useLoading.ts — Global loading state hook
// ============================================================

import { create } from 'zustand'

interface LoadingState {
  isLoading: boolean
  loadingText: string
  startLoading: (text?: string) => void
  stopLoading: () => void
}

export const useLoadingStore = create<LoadingState>((set) => ({
  isLoading: false,
  loadingText: 'Đang tải...',
  startLoading: (text = 'Đang tải...') => set({ isLoading: true, loadingText: text }),
  stopLoading: () => set({ isLoading: false })
}))

export function useLoading() {
  const { isLoading, loadingText, startLoading, stopLoading } = useLoadingStore()
  
  return {
    isLoading,
    loadingText,
    startLoading,
    stopLoading,
    withLoading: async <T,>(
      fn: () => Promise<T>,
      text = 'Đang xử lý...'
    ): Promise<T> => {
      startLoading(text)
      try {
        return await fn()
      } finally {
        stopLoading()
      }
    }
  }
}
