type PomStatus = 'draft' | 'submitted' | 'reviewed' | 'exported'

declare global {
  interface Window {
    api: {
      window: {
        minimize:    () => void
        maximize:    () => void
        close:       () => void
        isMaximized: () => Promise<boolean>  // ← thêm
        resetSize:   () => void              // ← thêm
      }
      brands: {
        getAll:  () => Promise<any[]>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      categories: {
        getAll: () => Promise<any[]>
      }
      products: {
        getAll:          (filters?: any) => Promise<any[]>
        getById:         (id: number) => Promise<any>
        create:          (data: any) => Promise<any>
        update:          (id: number, data: any) => Promise<any>
        delete:          (id: number) => Promise<any>
        getPriceHistory: (id: number) => Promise<any[]>
      }
      solutions: {
        getAll: () => Promise<any[]>
      }
      poms: {
        getAll:       (filters?: any) => Promise<any[]>
        getById:      (id: number) => Promise<any>
        create:       (data: any) => Promise<any>
        update:       (id: number, data: any) => Promise<any>
        updateStatus: (id: number, status: PomStatus, reviewed_by?: number) => Promise<any>
        delete:       (id: number) => Promise<any>
        return:      (id: number, reason: string) => Promise<any>
        approve:     (id: number) => Promise<any>
        exportExcel: (id: number, isPreview: boolean) => Promise<any>  // ← thêm
      }
      pomItems: {
        upsert: (pom_id: number, items: any[]) => Promise<any>
      }
      users: {
        getAll: () => Promise<any[]>
        login:  (username: string, password_hash: string) => Promise<any>
      }
    }
  }
}

export {}