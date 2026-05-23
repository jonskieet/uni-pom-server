// src/types/global.d.ts
export {}

declare global {
  interface Window {
    api: {
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
        updateStatus: (id: number, status: string, reviewed_by?: number) => Promise<any>
        delete:       (id: number) => Promise<any>
        return:      (id: number, reason: string) => Promise<any>  
        exportExcel: (id: number, isPreview: boolean) => Promise<any>  
      }
      pomItems: {
        upsert: (pom_id: number, items: any[]) => Promise<any>
      }
      users: {
        getAll: () => Promise<any[]>
        login:  (username: string, password_hash: string) => Promise<any>
      }
    }
    ipcRenderer: {
      on: (channel: string, listener: (...args: any[]) => void) => void
    }

    window: {
      minimize:    () => Promise<void>
      maximize:    () => Promise<void>
      close:       () => Promise<void>
      isMaximized: () => Promise<boolean>
      resetSize:   () => Promise<void>   // ← thêm dòng này
    }
  }
}