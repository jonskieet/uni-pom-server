// ============================================================
// src/hooks/useNotification.ts — Toast notifications hook
// ============================================================

import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = Date.now().toString()
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }]
    }))
    
    // Auto-remove notification after duration
    const duration = notification.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }))
      }, duration)
    }
  },
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id)
  })),
  clear: () => set({ notifications: [] })
}))

export interface NotificationMethods {
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  remove: (id: string) => void
}

export function useNotification(): NotificationMethods {
  const { addNotification, removeNotification } = useNotificationStore()

  return {
    success: (message: string, duration?: number) => {
      addNotification({ type: 'success', message, duration })
    },
    error: (message: string, duration?: number) => {
      addNotification({ type: 'error', message, duration: duration ?? 4000 })
    },
    info: (message: string, duration?: number) => {
      addNotification({ type: 'info', message, duration })
    },
    warning: (message: string, duration?: number) => {
      addNotification({ type: 'warning', message, duration })
    },
    remove: removeNotification
  }
}
